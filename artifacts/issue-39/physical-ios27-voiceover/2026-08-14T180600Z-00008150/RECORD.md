# Physical iOS 27 VoiceOver acceptance record

Status: **PASS**

- UTC date/time: 2026-08-14T18:06:00Z–2026-08-14T18:10:49Z
- Operator: Codex coordinator using Agent Device against Thiago's connected physical device
- Built repository commit: `d7e7472903cc6a081e967a7245821fea5ceaf2ba`
- Runtime source manifest: SHA-256 `8f0a4f59e0a5781ba059fcba3798197db6bbc4bc5deeea896609b6a8fb1ed073`, computed from `git ls-tree -r d7e7472 -- src ios android example/src example/ios | rg -v '/__tests__/'`
- Working tree at build: clean
- Build: physical arm64 Release, completed 2026-08-14T18:01:03Z with Xcode 27.0 beta 4; `xcodebuild` reported `BUILD SUCCEEDED`
- Installed app: `reorderable.example`, CDHash `7156aff8cb85dda2d5650c49f67bfd7d1cb78578`, team `6B3J8SDXMN`, Apple Development signing identity `NYT2M7387U`
- Agent Device version: repository-pinned 0.20.6; CoreDevice physical iOS backend
- Device: iPhone 17 Pro Max (`iPhone18,2`), UDID `00008150-000A79C90138401C`
- iOS: 27.0 (24A5408d)
- VoiceOver: enabled; English Caption Panel enabled; Screen Curtain off
- Route: `reorderable://lab/accessibility?preset=default&engine=auto`

The final evidence-only amendment changes this record and its regression-test
path, not the runtime manifest above. Recomputing the documented manifest on
the final commit must produce the same SHA-256.

## Accessible reorder

- Initial state: order `blue, green, yellow`; selection `blue, green`; event `None`; callback count `0`
- Focused element: `blue accessible card, selected`
- VoiceOver action selected: `Move later`
- Invocation: one-finger vertical action selection followed by double-tap
- Exact announcement: `Moved 2 items to position 2 of 3.`
- Terminal state: order `yellow, blue, green`; selection `blue, green`; event `{"sourceIds":["blue","green"],"destination":{"sectionId":null,"beforeId":null}}`; callback count `1`
- Same logical blue element retained focus: yes; the VoiceOver focus ring returned to the logical blue card and Caption Panel reported `blue accessible card, selected, 100%`
- Evidence: `reorder-before.png`, `reorder.mp4`, `reorder-announcement.png`, and `reorder-after.png`
- `reorder-announcement.png` is the full-resolution frame extracted from the uninterrupted device recording while Caption Panel displayed the exact announcement.

## Accessible drop

- Reset state: order `blue, green, yellow`; selection `blue, green`; event `None`; callback count `0`
- Focused element: `Accessible accepting drop zone`
- VoiceOver action selected: `Drop selected items here`
- Invocation: one-finger vertical action selection followed by double-tap
- Exact announcement: `Dropped 2 items.`
- Terminal state: order `blue, green, yellow`; selection `blue, green`; event `{"itemIds":["blue","green"],"destinationId":"accessible-zone"}`; callback count `1`
- Same accepting zone retained focus: yes; the white VoiceOver focus ring remained on the accepting zone
- Evidence: `drop-before.png`, `drop.mp4`, `drop-announcement.png`, and `drop-after.png`

Both semantic actions, exact announcements, focus retention, and exact public
terminal outcomes were observed on the newly built Release app. This run passes
the one-time physical iOS 27 VoiceOver gate for issue #39.
