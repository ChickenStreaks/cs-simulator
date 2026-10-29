#!/bin/bash
# One-time setup of the simulator's test runner, outside the repo (never /tmp):
#   1. Playwright 1.64.1 + html-to-image under ~/.cache/claude-builds/cs-simulator/<lane>/ and a link simulator/tests/node_modules;
#   2. Chromium and WebKit (Playwright's own builds, ~/.cache/ms-playwright);
#   3. WebKit without root on a non-Ubuntu host: the three Ubuntu 24.04 libraries it lacks (libicu74, libxml2, libflite1)
#      extracted under ~/.cache/claude-builds/cs-simulator/webkit-libs/, and a launcher pw_wk.sh that the Playwright config
#      passes as WebKit's executablePath (LD_LIBRARY_PATH alone does not work: WebKit's own wrapper resets it).
# Usage: simulator/tools/setup-tests.sh [lane=shell]
set -euo pipefail
LANE=${1:-shell}
SIM=$(cd "$(dirname "$0")/.." && pwd)
BASE=$HOME/.cache/claude-builds/cs-simulator
RUN=$BASE/$LANE
mkdir -p "$RUN"
cp "$SIM/tests/runner-package.json" "$RUN/package.json"
(cd "$RUN" && npm install --no-audit --no-fund)
ln -sfn "$RUN/node_modules" "$SIM/tests/node_modules"
(cd "$RUN" && npx playwright install chromium webkit) || true   # the host check may complain about WebKit: step 3 fixes it
# macOS runs Playwright's WebKit as it is; step 3 is only for a Linux host that is not Ubuntu
if [ "$(uname)" != Linux ]; then echo "setup-tests: runner in $RUN"; exit 0; fi

WK=$(ls -d "$HOME"/.cache/ms-playwright/webkit-* 2>/dev/null | sort | tail -1)
[ -n "$WK" ] || { echo "setup-tests: no WebKit build under ~/.cache/ms-playwright"; exit 1; }
L=$BASE/webkit-libs
mkdir -p "$L/debs" "$L/root" "$L/lib"
POOL=http://archive.ubuntu.com/ubuntu/pool
for p in main/i/icu/libicu74_74.2-1ubuntu3.1_amd64.deb main/libx/libxml2/libxml2_2.9.14+dfsg-1.3ubuntu3.10_amd64.deb universe/f/flite/libflite1_2.2-6build3_amd64.deb; do
  f=$L/debs/$(basename "$p")
  [ -s "$f" ] || curl -sSfo "$f" "$POOL/$p"
  x=$L/x/$(basename "$p" .deb); mkdir -p "$x"
  (cd "$x" && ar x "$f" && tar -xf data.tar.* -C "$L/root")
done
cp -a "$L/root/usr/lib/x86_64-linux-gnu/." "$L/lib/"
W=$WK/minibrowser-wpe
printf '%s\n' '#!/bin/sh' "# Playwright's WebKit (WPE) with the Ubuntu libraries it lacks on this host (simulator/tools/setup-tests.sh)" \
  "W=$W" "L=$L/lib" 'export WEBKIT_EXEC_PATH="$W/bin"' 'export WEBKIT_INJECTED_BUNDLE_PATH="$W/lib"' \
  'export WEBKIT_INSPECTOR_RESOURCES_PATH="$W/share"' 'export LD_LIBRARY_PATH="$W/lib:$W/sys/lib:$L"' 'export WEBKIT_FORCE_COMPLEX_TEXT=1' \
  'exec "$W/bin/MiniBrowser" "$@"' > "$L/pw_wk.sh"
chmod +x "$L/pw_wk.sh"
missing=$(LD_LIBRARY_PATH="$W/lib:$W/sys/lib:$L/lib" ldd "$W/bin/MiniBrowser" "$W"/lib/*.so* 2>/dev/null | grep -c 'not found' || true)
echo "setup-tests: runner in $RUN · WebKit launcher $L/pw_wk.sh · libraries still missing: $missing"
