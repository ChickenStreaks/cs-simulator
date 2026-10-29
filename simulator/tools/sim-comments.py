#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Read the ChickenStreaks simulator's comments — for the owner and the agents.

Default source: the files the local backend (simulator/server/comments.mjs) writes under
~/.cache/claude-builds/cs-simulator/comments/ (override with --dir or the env WB_COMMENTS_DIR).
--remote reads the hosted D1 database through the Cloudflare D1 query API instead (see simulator/server/cloudflare/);
it needs the account id and database id below (or CLOUDFLARE_ACCOUNT_ID / WB_SIM_D1_ID) and a token in
~/.config/cloudflare/token (never printed).

  sim-comments.py list [--since 2026-10-21] [--limit 200] [--json]
  sim-comments.py show <id>        # the row and its runtime block; saves the screenshot and prints its path
  sim-comments.py shot <id> [--out PATH]    # only the screenshot
  sim-comments.py counts [--json]  # story started/completed per day
  sim-comments.py delete <id>
  sim-comments.py watch [--every SEC] [--from-now]   # one line per new comment; Ctrl-C to stop
  sim-comments.py status <id> <state> [--commit SHA]   # visto · en arreglo · hecho · necesita decisión · no se hará
  sim-comments.py reply <id> "<text>"                  # the short answer the person reads in «Mis comentarios»
  sim-comments.py replay <id> [--out shot.png] [--base URL]   # the exact moment again, headless, with a screenshot

A comment with reply_to is «Sigue igual»: the person says an earlier comment (that id) still happens — read both.

Status and replies never rewrite a comment: each is one more line of comment-events.jsonl (or a comment_events row in
D1), and the latest wins when read. A state outside the list is kept as written, flagged ⚠. If the update cannot be
saved the command fails and says so; the comment stays exactly as it was.

Add --dir PATH (local folder) or --remote before the command. Comment text is printed as plain text (control
characters removed). A row marked ⚠ names a screen·state its backend's screens.json did not list (it was kept).
"""
import argparse
import json
import subprocess
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

# --- remote placeholders (fill in only when the hosted backend exists) ---------------------------------------------
ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "<CLOUDFLARE_ACCOUNT_ID>")
DATABASE = os.environ.get("WB_SIM_D1_ID", "<D1_DATABASE_ID>")
TOKEN_FILE = pathlib.Path.home() / ".config" / "cloudflare" / "token"

BUILDS = pathlib.Path.home() / ".cache" / "claude-builds" / "cs-simulator"
LOCAL_DIR = pathlib.Path(os.environ.get("WB_COMMENTS_DIR") or BUILDS / "comments")
SHOTS_OUT = BUILDS / "shots"
EXT = {"image/jpeg": ".jpg", "image/webp": ".webp"}
THUMBS = {"up": "👍", "down": "👎", None: ""}
# the states of a comment: code (stored) → the words the person reads (server/validate.mjs STATUSES; keep them equal)
STATUSES = {"new": "nuevo", "seen": "visto", "fixing": "en arreglo", "done": "hecho", "needs_decision": "necesita decisión", "wontfix": "no se hará"}
REPLY_MAX = 500


def fold(s):
    import unicodedata
    s = "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")
    return " ".join(s.lower().replace("_", " ").replace("-", " ").split())


BY_WORDS = {fold(k): k for k in STATUSES} | {fold(v): k for k, v in STATUSES.items()}


def status_of(raw):
    """«en arreglo», «Hecho», «needs_decision» → (code, False); anything else → (as written, True): kept, flagged."""
    raw = " ".join(str(raw).split())
    if not raw or len(raw) > 40:
        sys.exit("a state is 1 to 40 characters")
    code = BY_WORDS.get(fold(raw))
    return (code, False) if code else (raw, True)


def merge(rows, events):
    """Each row with its latest status, reply and commit, and its history (the same as server/validate.mjs mergeEvents)."""
    by = {}
    for e in events:
        if isinstance(e, dict) and isinstance(e.get("comment"), str):
            by.setdefault(e["comment"], []).append(e)
    out = []
    for r0 in rows:
        r = dict(r0, status=r0.get("status") or "new", status_unknown=0, reply=None, reply_at=None, commit=None, updated_at=None, history=[])
        for e in sorted(by.get(r.get("id"), []), key=lambda e: str(e.get("at", ""))):
            if e.get("status"):
                r["status"] = e["status"]
            if e.get("commit"):
                r["commit"] = e["commit"]
            if e.get("reply"):
                r["reply"], r["reply_at"] = e["reply"], e.get("at")
            r["updated_at"] = e.get("at") or r["updated_at"]
            r["history"].append({k: e.get(k) for k in ("at", "by", "status", "commit", "reply")})
        r["status_unknown"] = 0 if r["status"] in STATUSES else 1
        r["status_label"] = STATUSES.get(r["status"], r["status"])
        out.append(r)
    return out


def status_cell(r):
    return STATUSES.get(r.get("status"), r.get("status") or "nuevo") + (" ⚠" if r.get("status") not in STATUSES and r.get("status") else "")


def clean(s, width=None):
    """Plain, single-line text: no control or escape characters reach the terminal."""
    s = "" if s is None else str(s)
    s = "".join(ch if ch.isprintable() else " " for ch in s.replace("\n", " ⏎ "))
    return s if width is None or len(s) <= width else s[: width - 1] + "…"


def author_of(row):
    """The local backend writes `author`, the D1 schema `author_email`."""
    return row.get("author") or row.get("author_email") or ""


def where_of(row):
    return f"{row.get('screen')}·{row.get('state')}" + (" ⚠" if row.get("screen_unknown") else "")


def viewer_of(row):
    """«Ver como» name and role, e.g. «Ana (owner)»."""
    name, role = row.get("view_as_name") or row.get("view_as_person"), row.get("view_as_role")
    return f"{name} ({role})" if name and role else name or role or ""


# ---- remote (D1 query API) -------------------------------------------------------------------------------------------
def d1(sql, params=()):
    if "<" in ACCOUNT or "<" in DATABASE:
        sys.exit("remote: set CLOUDFLARE_ACCOUNT_ID and WB_SIM_D1_ID (or edit ACCOUNT / DATABASE in this file) first")
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database/{DATABASE}/query",
        data=json.dumps({"sql": sql, "params": list(params)}).encode(),
        headers={"Authorization": "Bearer " + TOKEN_FILE.read_text().strip(), "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"D1 API error {e.code}: {clean(e.read().decode(errors='replace'), 300)}")
    if not body.get("success"):
        sys.exit(f"D1 API error: {clean(json.dumps(body.get('errors')), 300)}")
    return body["result"][0]["results"]


class Remote:
    def list(self, since, limit):
        return merge(d1("SELECT c.*, (SELECT count(*) FROM comment_shots s WHERE s.comment_id = c.id) AS has_shot "
                        "FROM comments c WHERE server_ts >= ? ORDER BY server_ts DESC LIMIT ?", (since, limit)), self.events())

    def get(self, cid):
        rows = merge(d1("SELECT * FROM comments WHERE id = ?", (cid,)), self.events())
        if not rows:
            return None, None
        shot = d1("SELECT mime, hex(bytes) AS hex FROM comment_shots WHERE comment_id = ?", (cid,))
        return rows[0], (shot[0]["mime"], bytes.fromhex(shot[0]["hex"])) if shot else None

    def delete(self, cid):
        d1("DELETE FROM comment_shots WHERE comment_id = ?", (cid,))
        return d1("DELETE FROM comments WHERE id = ? RETURNING id", (cid,))

    def counts(self):
        rows = d1("SELECT day, story, event, NULL AS step, n FROM story_events ORDER BY day DESC, story, event")
        try:
            rows += d1("SELECT day, story, 'quit' AS event, step, n FROM story_quits ORDER BY day DESC, story, step")   # migration 0003
        except SystemExit:
            pass
        return rows

    def events(self, ids=None):
        rows = d1("SELECT comment_id AS comment, at, by_who AS by, status, commit_sha AS 'commit', reply FROM comment_events ORDER BY at")
        return [{k: v for k, v in e.items() if v is not None} for e in rows]

    def add_event(self, cid, ev):
        if not d1("SELECT id FROM comments WHERE id = ?", (cid,)):
            return False
        d1("INSERT INTO comment_events (comment_id, at, by_who, status, commit_sha, reply) VALUES (?, ?, ?, ?, ?, ?)",
           (cid, ev["at"], ev["by"], ev.get("status"), ev.get("commit"), ev.get("reply")))
        return True


# ---- local (the backend's files) -------------------------------------------------------------------------------------
class Local:
    def __init__(self, folder):
        self.dir = pathlib.Path(folder)
        self.file = self.dir / "comments.jsonl"
        self.events_file = self.dir / "comment-events.jsonl"

    def events(self):
        """Status and replies; unreadable → none (warned), so the comments still show."""
        try:
            text = self.events_file.read_text(encoding="utf-8") if self.events_file.exists() else ""
        except OSError as e:
            print(f"(status and replies unreadable: {e})", file=sys.stderr)
            return []
        out = []
        for line in text.splitlines():
            if line.strip():
                try:
                    out.append(json.loads(line))
                except ValueError:
                    pass
        return out

    def add_event(self, cid, ev):
        if not any(r.get("id") == cid for r in self.rows()):
            return False
        with open(self.events_file, "a", encoding="utf-8") as f:   # append only: the comment rows are never touched
            f.write(json.dumps(dict(comment=cid, **ev), ensure_ascii=False) + "\n")
        return True

    def rows(self):
        if not self.file.exists():
            return []
        out = []
        for line in self.file.read_text(encoding="utf-8").splitlines():
            if line.strip():
                try:
                    out.append(json.loads(line))
                except ValueError:
                    pass   # a half-written line: the next read has it whole
        return out

    def list(self, since, limit):
        rows = [r for r in merge(self.rows(), self.events()) if r.get("server_ts", "") >= since]
        return sorted(rows, key=lambda r: r.get("server_ts", ""), reverse=True)[:limit]

    def shot_path(self, cid):
        for ext in EXT.values():
            p = self.dir / "shots" / (cid + ext)
            if p.exists():
                return p
        return None

    def get(self, cid):
        row = next((r for r in merge(self.rows(), self.events()) if r.get("id") == cid), None)
        p = self.shot_path(cid) if row else None
        mime = next((m for m, e in EXT.items() if p and p.suffix == e), None)
        return row, (mime, p.read_bytes()) if p else None

    def delete(self, cid):
        # Rewrites the file: a comment posted in the same instant could be lost; deleting is a rare, manual act.
        rows = self.rows()
        keep = [r for r in rows if r.get("id") != cid]
        if len(keep) == len(rows):
            return []
        tmp = self.file.with_suffix(".jsonl.tmp")
        tmp.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in keep), encoding="utf-8")
        os.chmod(tmp, 0o644)
        tmp.replace(self.file)
        p = self.shot_path(cid)
        if p:
            p.unlink()
        return [{"id": cid}]

    def counts(self):
        f = self.dir / "story-counts.json"
        data = json.loads(f.read_text()) if f.exists() else {}
        out = []
        for key, n in data.items():   # "YYYY-MM-DD|<story>|<event>", a quit as "quit@<step>"
            day, story, event = key.split("|", 2)
            ev, _, step = event.partition("@")
            out.append({"day": day, "story": story, "event": ev, "step": int(step) if step.isdigit() else None, "n": n})
        return sorted(out, key=lambda r: (r["day"], r["story"], r["event"]))


# ---- runtime block of `show` -----------------------------------------------------------------------------------------
def runtime_of(row):
    """The row's runtime as a dict: D1 keeps it as JSON text, the local file as an object; older rows have none."""
    rt = row.get("runtime")
    if rt is None or rt == "":
        return None
    if isinstance(rt, str):
        try:
            rt = json.loads(rt)
        except ValueError:
            return {"raw": rt}
    return rt if isinstance(rt, dict) else {"raw": json.dumps(rt, ensure_ascii=False)}


def compact(v):
    """A value on one line: strings as they are, anything else as compact JSON."""
    return v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, separators=(",", ":"))


def print_runtime(rt):
    """One labelled line per part, the actions numbered, every value as plain text. Tolerant of shape changes."""
    line = lambda k, v: print(f"  {k:13} {clean(v)}")
    rest = dict(rt)
    size = len(json.dumps(rt, ensure_ascii=False).encode())
    print(f"{'runtime':13} v{clean(rest.pop('v', '?'))} ({size} bytes)")
    if "raw" in rest:
        line("raw", rest.pop("raw"))
    url = rest.pop("url", None)
    if isinstance(url, dict):
        for k, v in url.items():
            line("url" if k in ("shell", "page") else f"url {k}", compact(v))
    elif url:
        line("url", url)
    view = rest.pop("view", None)
    if isinstance(view, dict):
        line("view", f"{view.get('screen')} ({view.get('state')})")
    elif view:
        line("view", compact(view))
    for key in ("scenario", "sim_time"):
        if key in rest:
            line(key, compact(rest.pop(key)))
    va = rest.pop("view_as", None)
    if isinstance(va, dict):
        who = va.get("name") or va.get("person") or "?"
        extra = [str(va[k]) for k in ("role", "context") if va.get(k)]
        line("view_as", who + (f" ({', '.join(extra)})" if extra else ""))
    elif va:
        line("view_as", compact(va))
    se = rest.pop("session", None)
    if se is not None:
        line("session", compact(se))
    acts = rest.pop("actions", None) or []
    for i, a in enumerate(acts):
        print(f"  {'actions' if i == 0 else '':13} {i + 1}. {clean(compact(a))}")
    errs = rest.pop("errors", None) or []
    total = rest.pop("errors_total", len(errs))
    for i, e in enumerate(errs):
        print(f"  {(f'errors ({total})' if i == 0 else ''):13} {clean(compact(e))}")
    for k, v in rest.items():   # parts of a later version: unformatted, but shown
        line(k, compact(v))


# ---- commands --------------------------------------------------------------------------------------------------------
def print_table(rows):
    if not rows:
        print("(sin comentarios)")
        return
    print(f"{'time (UTC)':16}  {'id':26}  {'author':14}  {'screen·state':34}  {'story/step':14}  {'ver como':18}  {'estado':18}  {'':2}  text")
    for r in rows:
        story = (f"{r['story']}" + (f"/{r['step']}" if r.get("step") else "")) if r.get("story") else ""
        shot = " 📷" if r.get("has_shot") else ""
        if r.get("kind") == "pin" and not r.get("has_shot"):
            shot = f" (sin captura: {clean(r.get('shot_error') or 'sin motivo', 32)})"
        print(f"{r['server_ts'][:16].replace('T', ' '):16}  {r['id']:26}  {clean(author_of(r), 14):14}  "
              f"{clean(where_of(r), 34):34}  {clean(story, 14):14}  {clean(viewer_of(r), 18):18}  {clean(status_cell(r), 18):18}  "
              f"{THUMBS.get(r.get('thumbs'), ''):2}  {clean(r.get('text'), 80)}{shot}" + ("  💬" if r.get("reply") else "")
              + (f"  ↩ sigue igual {r['reply_to']}" if r.get("reply_to") else ""))


def local_hhmmss(ts):
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone().strftime("%H:%M:%S")
    except (ValueError, AttributeError):
        return clean(ts, 8)


def watch_line(r):
    """time · id · screen·state · «Ver como» · first 80 chars of the text · 📷"""
    text = clean(r.get("text"), 80) if r.get("text") else (THUMBS.get(r.get("thumbs"), "") + " fin de historia " + clean(r.get("story")))
    if r.get("reply_to"):
        text = f"↩ sigue igual {r['reply_to']}: " + text   # the person says that earlier comment still happens
    return "  ".join(p for p in (local_hhmmss(r.get("server_ts")), r.get("id", ""), clean(where_of(r)), clean(viewer_of(r)) or "-",
                                 text + (" 📷" if r.get("has_shot") else "")) if p)


def watch_local(src, every, from_now):
    """Prints one line per new row of comments.jsonl. It remembers the byte offset (and the ids it printed, so a
    `delete`, which rewrites the file, does not replay anything); the file may not exist yet."""
    offset, ino, seen = 0, None, set()
    if from_now and src.file.exists():
        offset, ino = src.file.stat().st_size, src.file.stat().st_ino
        seen = {r.get("id") for r in src.rows()}
    while True:
        try:
            st = src.file.stat()
        except FileNotFoundError:
            offset, ino = 0, None
            time.sleep(every)
            continue
        if ino is not None and (st.st_ino != ino or st.st_size < offset):
            offset = 0   # replaced or truncated: read it again, the seen ids stop any repeat
        ino = st.st_ino
        if st.st_size > offset:
            with open(src.file, "rb") as f:
                f.seek(offset)
                chunk = f.read()
            end = chunk.rfind(b"\n") + 1   # only whole lines: a half-written one waits for the next round
            offset += end
            for raw in chunk[:end].splitlines():
                try:
                    row = json.loads(raw.decode("utf-8"))
                except ValueError:
                    continue
                if row.get("id") in seen:
                    continue
                seen.add(row.get("id"))
                print(watch_line(row), flush=True)
        time.sleep(every)


def watch_remote(src, every, from_now):
    seen, since = set(), "0000"
    if from_now:
        rows = src.list("0000", 1)
        since = rows[0]["server_ts"] if rows else since
        seen = {r["id"] for r in rows}
    while True:
        for r in reversed(src.list(since, 200)):
            if r["id"] not in seen:
                seen.add(r["id"])
                since = max(since, r["server_ts"])
                print(watch_line(r), flush=True)
        time.sleep(max(every, 5))


def save_shot(cid, shot, out=None):
    mime, data = shot
    ext = EXT.get(mime, ".bin")
    if out:
        p = pathlib.Path(out).expanduser()
        if p.is_dir():
            p = p / (cid + ext)
    else:
        SHOTS_OUT.mkdir(parents=True, exist_ok=True)
        p = SHOTS_OUT / (cid + ext)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return p


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--remote", action="store_true", help="read the hosted D1 database instead of the local files")
    ap.add_argument("--dir", default=str(LOCAL_DIR), help=f"local comments folder (default {LOCAL_DIR})")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list")
    p.add_argument("--since", default="0000", help="ISO date or time, UTC (e.g. 2026-10-21)")
    p.add_argument("--limit", type=int, default=200)
    p.add_argument("--json", action="store_true")
    sub.add_parser("show").add_argument("id")
    p = sub.add_parser("shot")
    p.add_argument("id")
    p.add_argument("--out", help="file or folder to write the screenshot to")
    sub.add_parser("delete").add_argument("id")
    p = sub.add_parser("counts")
    p.add_argument("--json", action="store_true")
    p = sub.add_parser("watch")
    p.add_argument("--every", type=float, default=2.0, help="seconds between looks (default 2)")
    p.add_argument("--from-now", action="store_true", help="skip the comments that already exist")
    p = sub.add_parser("status")
    p.add_argument("id")
    p.add_argument("state", help="visto · en arreglo · hecho · necesita decisión · no se hará (or new seen fixing done needs_decision wontfix)")
    p.add_argument("--commit", help="the commit that fixed it")
    p = sub.add_parser("reply")
    p.add_argument("id")
    p.add_argument("text")
    p = sub.add_parser("replay")
    p.add_argument("id")
    p.add_argument("--out", help="where the screenshot goes (default ~/.cache/claude-builds/cs-simulator/replays/<id>.png)")
    p.add_argument("--base", help="a running simulator (default: its own «like production» server)")
    a = ap.parse_args()
    src = Remote() if a.remote else Local(a.dir)

    if a.cmd == "list":
        rows = src.list(a.since, a.limit)
        print(json.dumps(rows, ensure_ascii=False, indent=1)) if a.json else print_table(rows)
    elif a.cmd == "show":
        row, shot = src.get(a.id)
        if not row:
            sys.exit("no such comment")
        for k, v in row.items():
            if k not in ("runtime", "history", "status", "status_label", "status_unknown", "reply", "reply_at", "commit", "updated_at"):
                print(f"{k:13} {clean(v)}")
        print(f"{'estado':13} {clean(status_cell(row))}" + (f"  · commit {clean(row['commit'])}" if row.get("commit") else ""))
        if row.get("reply"):
            print(f"{'respuesta':13} {clean(row['reply'])}")
        for i, h in enumerate(row.get("history") or []):
            what = "; ".join(x for x in (h.get("status") and STATUSES.get(h["status"], h["status"]), h.get("commit") and "commit " + h["commit"],
                                         h.get("reply") and "«" + clean(h["reply"], 60) + "»") if x)
            print(f"{'historia' if i == 0 else '':13} {local_hhmmss(h.get('at'))} {clean(h.get('by') or '')}: {clean(what)}")
        rt = runtime_of(row)
        if rt:
            print_runtime(rt)
        if shot:
            print(f"{'screenshot':13} {save_shot(a.id, shot)}")
    elif a.cmd == "shot":
        row, shot = src.get(a.id)
        if not row:
            sys.exit("no such comment")
        if not shot:
            sys.exit("this comment has no screenshot" + (f" ({clean(row.get('shot_error'))})" if row.get("shot_error") else ""))
        print(save_shot(a.id, shot, a.out))
    elif a.cmd == "delete":
        print("deleted" if src.delete(a.id) else "no such comment")
    elif a.cmd == "counts":
        rows = src.counts()
        if a.json:
            print(json.dumps(rows, indent=1))
        else:
            print(f"{'day':10}  {'story':28}  {'event':15}  n")
            for r in rows:
                ev = r["event"] + (f" · paso {r['step']}" if r.get("step") else "")
                print(f"{r['day']:10}  {clean(r['story'], 28):28}  {ev:15}  {r['n']}")
            if any(r["event"] == "quit" for r in rows):
                print("(where people quit a story: with a few reviewers these are anecdotes, not rates)")
    elif a.cmd == "replay":
        row, _ = src.get(a.id)
        if not row:
            sys.exit("no such comment")
        rt = runtime_of(row) or {}
        params = row.get("params") or (rt.get("view") or {}).get("params") or {}
        if isinstance(params, str):
            params = json.loads(params)
        print(f"{'screen':13} {clean(where_of(row))}  {clean(json.dumps(params, ensure_ascii=False)) if params else ''}")
        print(f"{'ver como':13} {clean(viewer_of(row)) or '-'}  ·  scenario {clean(row.get('scenario'))}"
              + (f"  ·  situation {clean(row.get('situation'))}" if row.get("situation") else ""))
        off = row.get("clock_offset_ms") or 0
        print(f"{'clock':13} {clean(row.get('sim_time'))}" + (f"  (+{round(off / 3600000, 1)} h)" if off else ""))
        if row.get("reply_to"):
            print(f"{'sigue igual':13} {row['reply_to']}")
        tool = pathlib.Path(__file__).resolve().parent / "replay.mjs"
        cmd = ["node", str(tool), json.dumps(dict(row, params=params, runtime=rt), ensure_ascii=False)]
        if a.out:
            cmd += ["--out", a.out]
        if a.base:
            cmd += ["--base", a.base]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        line = (r.stdout.strip().splitlines() or [""])[-1]
        try:
            res = json.loads(line)
            print(f"{'replayed':13} {res['screen']}·{res['state']}" + ("" if res.get("reached") else "  ⚠ not reached"))
            print(f"{'screenshot':13} {res['shot']}")
        except ValueError:
            sys.exit("replay failed: " + clean((r.stderr or r.stdout).strip(), 300))
        sys.exit(0 if r.returncode == 0 else 1)
    elif a.cmd in ("status", "reply"):
        ev = {"at": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"), "by": "cli"}
        if a.cmd == "status":
            code, unknown = status_of(a.state)
            ev["status"] = code
            if a.commit:
                if not (7 <= len(a.commit) <= 40 and all(c in "0123456789abcdefABCDEF" for c in a.commit)):
                    sys.exit("--commit must be a commit hash (7 to 40 hex characters)")
                ev["commit"] = a.commit.lower()
        else:
            text = a.text.strip()
            if not text or len(text) > REPLY_MAX:
                sys.exit(f"a reply is 1 to {REPLY_MAX} characters")
            ev["reply"] = text
        try:
            ok = src.add_event(a.id, ev)
        except OSError as e:
            sys.exit(f"not saved ({e.strerror or e}); the comment is untouched — try again")
        if not ok:
            sys.exit("no such comment")
        if a.cmd == "status":
            print(f"{a.id} → {STATUSES.get(ev['status'], ev['status'])}" + (" ⚠ (not one of the states; kept as written)" if unknown else "")
                  + (f" · commit {ev['commit']}" if ev.get("commit") else ""))
        else:
            print(f"{a.id} ← «{clean(ev['reply'], 80)}»")
    elif a.cmd == "watch":
        try:
            (watch_remote if a.remote else watch_local)(src, a.every, a.from_now)
        except KeyboardInterrupt:
            sys.exit(130)
        except BrokenPipeError:
            sys.exit(0)


if __name__ == "__main__":
    main()
