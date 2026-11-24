#!/usr/bin/env bash
# SOURCE is main; BASE and PROBE are separately unpacked, installed git archives.
set -eu
fixtures=$SOURCE/docs/ef0-evidence
# Choose a new directory for each replay; never replace frozen evidence.
: "${OUTPUT:?Supply a new absolute output directory}"
mkdir "$OUTPUT"
p=$OUTPUT
overall_status=0
owned() {
  local name=$1
  shift
  VITE_LOG="$p/vite-$name.txt" python "$fixtures/owned-vite.py" "$@" > "$p/$name.txt" 2>&1
}
run() {
  local label=$1
  shift
  check_status=0
  "$@" || { check_status=$?; overall_status=1; }
  printf '%s %d\n' "$label" "$check_status" >> "$p/check-status.txt"
}
skip() {
  printf '%s SKIP (%s failed)\n' "$1" "$2" >> "$p/check-status.txt"
}
export RESOURCE_REPORT="$p/resource-report.json"
cp "$fixtures/animation-hardware.mjs" "$BASE/"
run generation owned generation-check dev 5491 "$SOURCE" "$BASE" / 140 npm run test:generation
run animation-hw-2 owned animation-hw-2 dev 5493 "$SOURCE" "$BASE" / 90 node animation-hardware.mjs
run gallery owned gallery-check dev 5494 "$SOURCE" "$BASE" / 360 npm run gallery:generation
run resources owned resources-check dev 5495 "$SOURCE" "$BASE" / 180 npm run test:resources
run animation owned animation-check dev 5496 "$SOURCE" "$BASE" / 180 npm run test:animation
run base-build timeout 150 npm --prefix "$BASE" run build > "$p/base-build.txt" 2>&1
if (( check_status == 0 )); then
  run assets bash -c 'cd "$BASE" && node tests/measure-generation.ts assets' > "$p/assets.json"
  run production owned production-check preview 5497 "$BASE" "$BASE" / 90 npm run test:production
else
  skip assets base-build
  skip production base-build
fi
run effect-native timeout 30 npm --prefix "$PROBE" run typecheck > "$p/effect-native.txt" 2>&1
run effect-node timeout 20 node --test "$PROBE/tests/effect-probe.test.ts" >> "$p/effect-native.txt" 2>&1
run effect-root-build timeout 90 npm --prefix "$PROBE" run build > "$p/effect-root-build.txt" 2>&1
if (( check_status == 0 )); then
  run effect-root owned effect-root preview 5498 "$PROBE" "$PROBE" / 45 node effect-browser.mjs @URL@
else
  skip effect-root effect-root-build
fi
run effect-pages-build timeout 90 npm --prefix "$PROBE" run build:pages > "$p/effect-pages-build.txt" 2>&1
if (( check_status == 0 )); then
  run effect-pages owned effect-pages preview 5499 "$PROBE" "$PROBE" /the-hollow-crown/ 45 node effect-browser.mjs @URL@
else
  skip effect-pages effect-pages-build
fi
run focused timeout 150 node --test tests/generation-fixtures.test.ts tests/generation.test.ts tests/scenes.test.ts tests/generation-report.test.ts > "$p/focused.txt" 2>&1
run core timeout 300 npm test > "$p/core.txt" 2>&1
run main-build timeout 150 npm run build > "$p/main-build.txt" 2>&1
run full timeout 480 npm run check:full > "$p/full.txt" 2>&1
run corpus timeout 120 npm --prefix "$BASE" run report:generation > "$p/corpus.txt" 2>&1
exit "$overall_status"
