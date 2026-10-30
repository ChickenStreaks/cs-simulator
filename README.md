# cs-simulator

The ChickenStreaks app as clickable screens with a fake family: «See as», «Theme» and «Reset» in the bar; the rest
(the clock, a scenario) from the browser console. Details: [simulator/README.md](simulator/README.md).

```sh
ln -s ../cs-mobile-ng/packages/blueprint blueprint   # once, optional: serves the product rules at /blueprint/
pnpm dev     # http://127.0.0.1:4710/simulator/
pnpm check   # generated index current, flows in step, the rules' test
pnpm test    # browser tests (once: simulator/tools/setup-tests.sh)
```
