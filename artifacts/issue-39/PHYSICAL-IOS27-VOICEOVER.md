# Physical iOS 27 VoiceOver acceptance

Status: **NOT RUN — no result is claimed by this template.**

This is the one-time physical-device record required by issue #39 and
[ADR 0007](../../docs/adr/0007-portable-accessible-reorder.md). It proves that
React Native accessibility focus and the library-owned reorder/drop custom
actions survive the native iOS 27 SwiftUI hosting boundary. Simulator, Detox,
debug-action, and pointer results cannot satisfy this record.

## Tool boundary

Use the repository-pinned Agent Device 0.20.6. On physical iOS it can discover
the device, inspect capabilities/apps, open the installed app and deep link,
capture accessibility snapshots/screenshots, and record when the modern
CoreDevice backend exposes those capabilities. It can drive VoiceOver focus, action selection, and invocation with physical
HID gestures. Use the VoiceOver Caption Panel or a human operator to transcribe
the spoken steps below while Agent Device records supporting evidence.

Stop without a result if the device is not physical iOS 27.x, the tested app is
not built from the recorded commit, `reorderable.example` is missing, the Auto
engine policy is not selected, or the selected physical backend lacks any
required capture capability. Do not substitute a simulator or forced fallback.

## Before the run

The physical device must be paired and trusted, connected by cable, unlocked,
and in Developer Mode. The AgentDeviceRunner must be signed for the operator's
team (`AGENT_DEVICE_IOS_TEAM_ID` and a unique
`AGENT_DEVICE_IOS_BUNDLE_ID`; add a provisioning-profile specifier only if
Xcode requires one). The current signed example app must already be installed;
do not use the simulator `.app` build.

Record these values in the record section before testing:

- UTC date/time, operator, repository commit, and whether the tree was clean.
- Physical device model, UDID, iOS 27.x version, and VoiceOver language/voice.
- Example-app build/signing identity sufficient to tie the installed binary to
  the recorded commit.
- Agent Device version and physical backend/capability output.

Run discovery from the repository root:

```sh
./node_modules/.bin/agent-device --version
./node_modules/.bin/agent-device devices --platform ios --json
```

Set `ISSUE39_IOS_UDID` to the discovered physical-device UDID and
`ISSUE39_VO_EVIDENCE` to a new, empty run directory such as
`artifacts/issue-39/physical-ios27-voiceover/2026-08-08T120000Z-DEVICE`.
Never reuse a simulator UDID or overwrite an earlier run.

```sh
mkdir -p "$ISSUE39_VO_EVIDENCE"
```

Copy the complete, unfiltered version/device/capability/app command outputs into
`agent-device-version.txt`, `device-inventory.json`, `capabilities.json`, and
`installed-apps.json` in that directory. Copy each later raw snapshot output
immediately into its named before/after snapshot artifact.

```sh
./node_modules/.bin/agent-device capabilities --platform ios --udid "$ISSUE39_IOS_UDID" --json
./node_modules/.bin/agent-device apps --platform ios --udid "$ISSUE39_IOS_UDID" --json
./node_modules/.bin/agent-device open reorderable.example --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID" --relaunch
./node_modules/.bin/agent-device snapshot -i --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
```

Enable VoiceOver on the device. Agent Device may navigate iOS Settings to do
this when accessibility gestures remain observable. Keep Screen Curtain off so
the video can show the VoiceOver cursor, and enable Caption Panel when it will
serve as the verbatim transcript. Record how VoiceOver was enabled.

## A. Reorder action and focus retention

Open the named native-policy Scenario Lab route and verify its untouched state:

```sh
./node_modules/.bin/agent-device open 'reorderable://lab/accessibility?preset=default&engine=auto' --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Auto engine policy" selected=true' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Current order: blue, green, yellow"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Current selection: blue, green"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Last committed event: None"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Callback count: 0"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device snapshot --force-full --raw --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device screenshot "$ISSUE39_VO_EVIDENCE/reorder-before.png" --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device record start "$ISSUE39_VO_EVIDENCE/reorder.mp4" --scope device --fps 30 --quality high --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
```

The operator or Agent Device automation must now, without activating an app
control outside VoiceOver:

1. Move VoiceOver focus to **“blue accessible card, selected”** and transcribe
   the complete spoken focus description, including position metadata.
2. Set the VoiceOver rotor to Actions, move through actions until VoiceOver
   speaks **“Move later”**, and double-tap to invoke that action.
3. Transcribe the action and announcement. The required library announcement is
   **“Moved 2 items to position 2 of 3.”**
4. Confirm VoiceOver focus returns to the same logical element, spoken as
   **“blue accessible card, selected”**, after the React Native callback and
   SwiftUI-hosted tree update. Record any focus jump, silence, or stale element
   as a failure.

The required terminal public state is:

```text
Current order: yellow, blue, green
Current selection: blue, green
Last committed event: {"sourceIds":["blue","green"],"destination":{"sectionId":null,"beforeId":null}}
Callback count: 1
```

Capture the terminal state before stopping the recording:

```sh
./node_modules/.bin/agent-device wait 'label="Current order: yellow, blue, green"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Current selection: blue, green"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Last committed event: {\"sourceIds\":[\"blue\",\"green\"],\"destination\":{\"sectionId\":null,\"beforeId\":null}}"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Callback count: 1"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device snapshot --force-full --raw --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device screenshot "$ISSUE39_VO_EVIDENCE/reorder-after.png" --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device record stop --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
```

## B. Drop action and focus retention

Open the same route again to reset the outcome to callback zero:

```sh
./node_modules/.bin/agent-device open 'reorderable://lab/accessibility?preset=default&engine=auto' --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Auto engine policy" selected=true' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Current order: blue, green, yellow"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Current selection: blue, green"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Last committed event: None"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Callback count: 0"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device snapshot --force-full --raw --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device screenshot "$ISSUE39_VO_EVIDENCE/drop-before.png" --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device record start "$ISSUE39_VO_EVIDENCE/drop.mp4" --scope device --fps 30 --quality high --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
```

The operator or Agent Device automation must:

1. Move VoiceOver focus to **“Accessible accepting drop zone”** and transcribe
   the complete spoken focus description.
2. Set the rotor to Actions, move until VoiceOver speaks
   **“Drop selected items here”**, and double-tap to invoke it.
3. Transcribe the action and required announcement: **“Dropped 2 items.”**
4. Confirm focus returns to **“Accessible accepting drop zone”** after the React
   Native callback and SwiftUI-hosted tree update. Any focus jump, silence, or
   stale element is a failure.

The required terminal public state is:

```text
Current order: blue, green, yellow
Current selection: blue, green
Last committed event: {"itemIds":["blue","green"],"destinationId":"accessible-zone"}
Callback count: 1
```

Capture the exact terminal state and close only after all command output and
evidence have been copied into the run directory:

```sh
./node_modules/.bin/agent-device wait 'label="Current order: blue, green, yellow"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Current selection: blue, green"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Last committed event: {\"itemIds\":[\"blue\",\"green\"],\"destinationId\":\"accessible-zone\"}"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device wait 'label="Callback count: 1"' 15000 --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device snapshot --force-full --raw --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device screenshot "$ISSUE39_VO_EVIDENCE/drop-after.png" --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device record stop --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
./node_modules/.bin/agent-device close --session issue39-physical-voiceover --platform ios --udid "$ISSUE39_IOS_UDID"
```

## Required retained artifacts

A result is invalid unless the run directory contains:

- device inventory, capability output, installed-app/build identity, Agent
  Device version, repository commit, and dirty-tree status;
- raw before/after accessibility snapshots for reorder and drop;
- `reorder-before.png`, `reorder-after.png`, `drop-before.png`, and
  `drop-after.png`;
- uninterrupted `reorder.mp4` and `drop.mp4` recordings; absence of captured
  VoiceOver audio must be supplemented by a timestamped verbatim Caption Panel
  or operator transcript and is never silently inferred;
- the completed record below, including spoken actions, announcements, focus
  before/after, exact public outcomes, deviations, and artifact paths.

## Acceptance record template

Copy this section to `$ISSUE39_VO_EVIDENCE/RECORD.md`. Do not mark PASS unless
both actions, announcements, focus-retention checks, exact public outcomes, and
all required artifacts were observed in the same run.

```text
Status: NOT RUN | PASS | FAIL
UTC date/time:
Operator:
Repository commit:
Working tree clean: yes | no (describe)
Example-app build identity/signing record:
Agent Device version:
Physical backend/capabilities artifact:
Device model:
Device UDID:
iOS version (must be 27.x):
VoiceOver language/voice:
VoiceOver enablement method:

Reorder
  Route: reorderable://lab/accessibility?preset=default&engine=auto
  Auto engine policy selected: yes | no
  Initial exact public state observed: yes | no
  Focus before (verbatim):
  Actions spoken (verbatim, include Move later):
  Invocation gesture:
  Announcement (verbatim):
  Focus after (verbatim):
  Same logical blue element retained focus: yes | no
  Exact terminal order/event/selection/callback observed: yes | no
  Snapshot/screenshot/video paths:

Drop
  Route: reorderable://lab/accessibility?preset=default&engine=auto
  Reset initial exact public state observed: yes | no
  Focus before (verbatim):
  Actions spoken (verbatim, include Drop selected items here):
  Invocation gesture:
  Announcement (verbatim):
  Focus after (verbatim):
  Same accepting zone retained focus: yes | no
  Exact terminal order/event/selection/callback observed: yes | no
  Snapshot/screenshot/video paths:

Deviations or failures:
Final rationale:
```
