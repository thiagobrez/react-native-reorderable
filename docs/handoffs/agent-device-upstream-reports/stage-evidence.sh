#!/usr/bin/env bash
# Re-creates the evidence folder for the agent-device upstream report (#84, report 1).
# Usage: bash docs/handoffs/agent-device-upstream-reports/stage-evidence.sh [target-dir]
# Requires: gh (authenticated), ~230 MB of downloads. Artifacts expire ~90 days after
# 2026-08-31 / 2026-09-01.
set -euo pipefail

REPO=thiagobrez/react-native-reorderable
FAILING_RUN=33488489650   # 2026-09-01, ios26.auto-fallback attempt-1: lost touch stream
PASSING_RUN=33355396042   # 2026-08-31, ios26.auto-fallback attempt-2: late but delivered
TARGET="${1:-/tmp/agent-device-upstream-reports}"
WORK="$(mktemp -d)"

download() { # run-id dest
  mkdir -p "$2"
  gh run download "$1" -R "$REPO" -n issue-39-ios26.auto-fallback -D "$2"
}

echo "Downloading run artifacts into $WORK ..."
download "$FAILING_RUN" "$WORK/failing"
download "$PASSING_RUN" "$WORK/passing"

R1="$TARGET/report-1-lost-touch-stream"
D1="$R1/failing-run-$FAILING_RUN"
D2="$R1/passing-run-$PASSING_RUN"
rm -rf "$TARGET"
mkdir -p "$D1" "$D2"

F="$WORK/failing/agent-device/ios26.auto-fallback/attempts/attempt-1"
cp "$F/free-form-reorder/pointer.mp4"                 "$D1/free-form-reorder.pointer.mp4"
cp "$F/free-form-reorder/pointer-replay.ad"           "$D1/free-form-reorder.pointer-replay.ad"
cp "$F/free-form-reorder/gesture-start-marker.png"    "$D1/free-form-reorder.gesture-start-marker.png"
cp "$WORK"/failing/feedback/ios26.auto-fallback/attempts/attempt-1/free-form-reorder/sample-{1,2,3}.png "$D1/"
cp "$F/virtualized-list-reorder/pointer.mp4"          "$D1/virtualized-list-reorder.pointer.mp4"
cp "$F/replay-daemon-state/sessions/issue39-ios-runner-preflight/runner.log" "$D1/runner.log"
cp "$F/replay-daemon-state/sessions/issue39-free-form-reorder/events.ndjson" "$D1/free-form-reorder.events.ndjson"
cp "$F/replay-daemon-state/sessions/issue39-free-form-reorder/requests/aed3651e9dc0eaca.ndjson" \
   "$D1/free-form-reorder.replay-request.aed3651e9dc0eaca.ndjson"
cp "$WORK/failing/device-tables/ios26.auto-fallback-job.json" "$D1/job-attempts.json"
grep -n "command=gesture" "$D1/runner.log" > "$D1/runner.log.gesture-lines.txt"

P="$WORK/passing/agent-device/ios26.auto-fallback"
cp "$P/free-form-reorder/pointer.mp4" "$D2/free-form-reorder.attempt-2.pointer.mp4"
cp "$P/replay-daemon-state/sessions/issue39-free-form-reorder/events.ndjson" "$D2/free-form-reorder.attempt-2.events.ndjson"
cp "$WORK/passing/device-tables/ios26.auto-fallback-job.json" "$D2/job-attempts.json"
grep -n "command=gesture" "$P/replay-daemon-state/sessions/issue39-ios-runner-preflight/runner.log" > "$D2/runner.log.gesture-lines.txt"

rm -rf "$WORK"
echo "Staged under $TARGET:"
find "$TARGET" -type f | sort
