---
'react-native-reorderable': patch
---

Isolate release device-contract sessions and evidence so mixed pointer-driver validation cannot reuse stale Detox clients or results, wait for freshly erased iOS simulators to finish booting before starting the timed contract cases, and keep iOS evidence recording outside Agent Device replays so current gesture targeting and runner recovery fixes can be used without replay lock contention.
