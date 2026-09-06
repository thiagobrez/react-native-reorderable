# Handoff: file the agent-device upstream report (issue #84)

> Current work: [upstream PR #2362](https://github.com/callstack/agent-device/pull/2362) and [CI restoration PR #101](https://github.com/thiagobrez/react-native-reorderable/pull/101). The filing instructions below are historical. Read the [reassessment](./fix-proposal.md) and [measurement limits](./reproduction.md#measurement-limits-and-current-validation) before reusing the original causal claims or latency figures.

Prepared 2026-09-06 for a human filer. Issue [#84](https://github.com/thiagobrez/react-native-reorderable/issues/84)
is `ready-for-human` because it publishes to an external tracker
([callstack/agent-device](https://github.com/callstack/agent-device/issues)).
Everything below was re-verified against the retained CI logs, the downloaded
run artifacts, the pinned `agent-device` 0.20.10 dist, and upstream `main`.

Only report 1 (lost touch stream) is handed off. The second report listed on #84
(the `dyld: Library not loaded: /usr/lib/libcurl.4.dylib` runner-artifact failure)
was dropped: it occurred once (run 33379687040, 2026-08-31) and the evidence did
not confirm the cache-key theory from #56, so there is nothing confirmed to file.

## What to file

| # | Draft to paste | One-line summary | Confidence |
| --- | --- | --- | --- |
| 1 | [`report-1-ios26-cold-simulator-lost-touch-stream.md`](./report-1-ios26-cold-simulator-lost-touch-stream.md) | `gesture drag` returns `ok=1` with the exact scripted duration while the app receives no touch stream on a freshly erased, cold-booted iOS 26.5 simulator on a GitHub-hosted `macos-26` runner. | High. Every number in the draft comes from the two runs' daemon/runner logs and a frame-change analysis of the recordings. |

The draft follows upstream's only stated convention (from their `CONTRIBUTING.md`,
"Issues" section): include OS and Node version, Xcode version, the exact command,
and the exact output. Upstream has no issue templates and labels are theirs to set.

## Reproduction

A CI reproduction lives on this branch; see [`reproduction.md`](./reproduction.md).
Run it before filing so the report can cite a fresh run and the probe table.

## Before you file

1. Stage the evidence locally (re-downloads the two run artifacts, ~230 MB):

   ```bash
   bash docs/handoffs/agent-device-upstream-reports/stage-evidence.sh
   # writes /tmp/agent-device-upstream-reports/
   ```

   The GitHub Actions artifacts it pulls (`issue-39-ios26.auto-fallback` from runs
   33488489650 and 33355396042) are uploaded with `retention-days: 14`.
   Confirmed expiry dates from the API: **2026-09-15** (33488489650) and
   **2026-09-14** (33355396042). Stage them before then; the staged
   copies are the durable evidence. The job console logs stay available for 90 days.

2. Check whether upstream already has a report for this signature. As of
   2026-09-06 `gh search issues --repo callstack/agent-device` returns nothing for
   `gesture no touch simulator`. Re-run the searches before
   filing.

3. Check the latest upstream release. As of 2026-09-06 the latest release is still
   v0.20.10 (2026-08-24), the version this repo pins. If a newer release exists,
   read its changelog for gesture synthesis / XCUITest runner changes first and adjust the "Version" lines in the draft.

## Filing report 1 (lost touch stream)

- Paste the draft body verbatim; fix the title if you prefer.
- Attach, from `/tmp/agent-device-upstream-reports/report-1-lost-touch-stream/`:
  - `failing-run-33488489650/free-form-reorder.pointer.mp4` (the pixel-static recording)
  - `failing-run-33488489650/virtualized-list-reorder.pointer.mp4` (same job, restarted runner, works)
  - `failing-run-33488489650/runner.log` (full XCUITest runner log for the job's first runner process)
  - `failing-run-33488489650/free-form-reorder.events.ndjson` and `free-form-reorder.replay-request.aed3651e9dc0eaca.ndjson` (daemon-side request timeline)
  - `failing-run-33488489650/free-form-reorder.pointer-replay.ad` (the exact replay script)
  - `failing-run-33488489650/sample-1.png` … `sample-3.png` (static app samples taken during and after the gesture)
  - `passing-run-33355396042/free-form-reorder.attempt-2.pointer.mp4` and `free-form-reorder.attempt-2.events.ndjson` (late-but-delivered contrast)
- GitHub issues accept `.mp4`, `.png`, `.log`, `.txt`. Rename `.ndjson` and `.ad`
  files to `.txt` if the uploader rejects them.

## After filing

1. Post the upstream link as a comment on #84. Note there that report 2 was
   dropped as unconfirmed (single occurrence, run 33379687040), then close #84.
2. In `docs/research/agent-device-ci-hardening.md` (branch
   `research/agent-device-ci-hardening`): add the upstream issue number to the
   iOS 26 section.
3. Issue [#80](https://github.com/thiagobrez/react-native-reorderable/issues/80)
   (adopt the next agent-device release) is the place to track whether upstream's
   response lands in a release; mention the new issue numbers there.

## How the recording analysis was done (so it can be reproduced)

The pointer recordings are device-scope screen captures with a variable frame
rate; the encoder emits a frame only when pixels change, so frame timestamps
alone show when anything moved. Frame-to-frame mean absolute difference:

```bash
ffmpeg -v error -i pointer.mp4 -filter_complex \
  "[0:v]scale=302:656,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=/tmp/fd.txt" -f null -
ffprobe -v error -select_streams v:0 -show_entries frame=pts_time -of csv=p=0 pointer.mp4
```

Recording `t=0` is aligned to the replay's `request.started replay` timestamp in
`events.ndjson` (the recording is the first replay step and the video duration
matches the replay duration to within 0.5 s in both runs).

## Source of truth for the claims

- Diagnosis: #54 resolution comment. Decision: #60 resolution comment.
