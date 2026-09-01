# agent-device CI hardening for the observed device-job flakes

Research date: 2026-09-01 (resolves issue #56, part of #53)

## Conclusion

The pinned `agent-device` 0.20.10 is the **latest published release** — there is
no newer version to upgrade to, so no observed flake can be fixed today by a
version bump. The relevant story is:

- Flake 1 ("already owned by another agent-device daemon") has real, merged
  fixes on unreleased upstream `main` (live-owner warm-runner reclaim, stale
  claim release, retry-attempt claim supersede). **Upgrade at the next upstream
  release**; until then, the local daemon-stop hygiene is exactly what upstream
  documents and must stay.
- Flake 2 (`RUNNER_BUSY` / execution watchdog) is retriable by design; the
  watchdog is a fixed ~30 s runner-side constant with no operator knob. All
  known hardening already shipped in ≤ 0.20.10. **Keep the retry.**
- Flake 3 (artifact restored, `dyld: Library not loaded: libcurl.4.dylib`) is
  **unreported upstream**. The runner-artifact cache key omits the macOS host
  build, and the rebuild fallback only fires on retriable health failures, so a
  dyld load failure is a hard error. **Local workaround needed** (purge
  `~/.agent-device/apple-runner` before retry attempts) **plus an upstream
  issue.**
- Flakes 4–5 (adb `listener tcp:NNNN not found`, emulator boot) do not involve
  agent-device at all in this repo: every Android scenario routes to Detox
  (`e2e/contracts/pointer-drivers.json`), the adb message comes from Detox/adb,
  and emulator boot is owned by `reactivecircus/android-emulator-runner`.
  **Keep the existing retry; nothing upstream applies.**

Of the local workarounds, the preflight-then-stop-daemon dance matches
upstream's documented CI guidance verbatim; the alert-seeding relaunch, exit-75
sentinel, simulator erase, PID-derived Detox ports, and IPv4 pinning have no
upstream equivalent (neither recommended nor superseded) and remain local
policy. None of them papers over a bug that a released upstream version has
already fixed.

## Version status

- Latest release and latest tag: **v0.20.10** (npm publish 2026-08-18, GitHub
  release 2026-08-24) — identical to the pin in `package.json` / ADR 0006.
  Sources: [releases](https://github.com/callstack/agent-device/releases),
  `npm view agent-device versions time` (ends at 0.20.10, dist-tag `latest`).
- ~115 PRs merged on `main` after the release (as of 2026-09-01), none
  released. The `CHANGELOG.md` "Unreleased" section is dominated by 0.21
  breaking changes and MCP/daemon security hardening; the claim/runner-ownership
  fixes below are documented in PR bodies and help-text updates instead.

## Flake-by-flake mapping

### 1. `iOS runner ... is already owned by another agent-device daemon`

**Origin (verified in the pinned 0.20.10 dist, `dist/src/runner-lease.js`):**
runner leases are per-device JSON files in a **global** directory
(`~/.agent-device/apple-runner/leases/`, overridable via
`AGENT_DEVICE_IOS_RUNNER_LEASE_DIR`) regardless of `AGENT_DEVICE_STATE_DIR`.
A new daemon may take over a lease only when the owner is provably dead, when
its `AGENT_DEVICE_STATE_DIR` matches the lease's recorded state dir, or through
a proxy logical lease. A live (or liveness-unknown) foreign owner hard-rejects
with this exact message. Daemons and warm runners self-idle after 5 minutes
(`help physical-device`: `AGENT_DEVICE_DAEMON_IDLE_TIMEOUT_MS`,
`AGENT_DEVICE_IOS_RUNNER_IDLE_STOP_MS`), which is precisely the window where a
subsequent job/attempt collides.

**Already inside the 0.20.10 pin:** stale-lease reclaim and idle-daemon reaping
([#1169](https://github.com/callstack/agent-device/pull/1169), 0.19.3), warm
runner idle stop ([#1025](https://github.com/callstack/agent-device/pull/1025)),
local device-claim enforcement (0.20.9) and the foreign-live-claim shutdown fix
([#1809](https://github.com/callstack/agent-device/pull/1809), 0.20.10).

**Merged upstream but unreleased:**

- [#2160](https://github.com/callstack/agent-device/pull/2160) (2026-08-31) —
  reclaims a retained warm runner under device-claim authority; directly
  removes the "up to ~5 minutes of `IOS_RUNNER_OWNED_BY_OTHER_DAEMON` until the
  previous daemon idles out" case.
- [#2162](https://github.com/callstack/agent-device/pull/2162) (2026-08-31) —
  `device release --stale` / `device status --stale` plus exact recovery
  commands in `DEVICE_IN_USE` errors (closes the
  [#1320](https://github.com/callstack/agent-device/issues/1320) recovery loop).
- [#2105](https://github.com/callstack/agent-device/pull/2105) (2026-08-28) —
  a retried `open` supersedes the claim its aborted attempt abandoned. The PR's
  motivating failure is literally our retry shape: *"every retry died at step 1
  with `ios device <UDID> is owned by session "…:attempt-1"`"*.
- [#2057](https://github.com/callstack/agent-device/pull/2057),
  [#2171](https://github.com/callstack/agent-device/pull/2171),
  [#2015](https://github.com/callstack/agent-device/pull/2015) — claims held by
  replaced/superseded daemons, stale-claim recovery composed from the dead
  owner's state dir, branch-named daemon stop before replacement.

**Remedy: version upgrade — as soon as the next upstream release ships.**
Until then: keep the local daemon-stop hygiene (it is upstream-sanctioned, see
the workaround audit), and optionally reduce the collision window in CI with
`AGENT_DEVICE_DAEMON_IDLE_TIMEOUT_MS` / `AGENT_DEVICE_IOS_RUNNER_IDLE_STOP_MS`,
`close --shutdown`, or `daemon stop --state-dir <path> --clean` (all present in
0.20.10 per `help daemon` / `help physical-device`). On shared or self-hosted
Macs, a job-scoped `AGENT_DEVICE_IOS_RUNNER_LEASE_DIR` would isolate lease
namespaces entirely.

### 2. `RUNNER_BUSY: still finishing a previous command that exceeded its execution watchdog`

**Origin (verified in the pinned dist):** emitted by the on-device XCTest
runner (`dist/apple/runner/.../RunnerTests+CommandExecution.swift`) when a new
command arrives while main-thread work abandoned by the runner's fixed ~30 s
execution watchdog is still draining — "usually an accessibility capture on a
heavy or animating screen". The watchdog is a runner-side constant with **no
operator configuration**; per-command `--timeout` only bounds the CLI wall
clock. Upstream marks the error retriable and its built-in hint is "wait a few
seconds and retry"; past a wedge threshold it escalates to `RUNNER_WEDGED` and
the daemon recycles the runner.

**Upstream history:** designed/hardened in
[#1105](https://github.com/callstack/agent-device/issues/1105) →
[#1107](https://github.com/callstack/agent-device/pull/1107) and
[#1126](https://github.com/callstack/agent-device/pull/1126) (0.19.0), plus
[#1248](https://github.com/callstack/agent-device/pull/1248) (0.20.0). All in
the pin. No open upstream bug; nothing newer changes this.

**Remedy: keep the local retry (config/no-change).** The exit-75 →
attempt-level retry in `scripts/run-device-contract-job.mjs` is the correct
consumer response to a retriable-by-design error.

### 3. `artifact restored but runner did not connect: dyld: Library not loaded: /usr/lib/libcurl.4.dylib`

**Origin:** the message frame is upstream
(`packages/platform-apple/src/runner/runner-lifecycle.ts`; verified in
`dist/src/runner-client.js` of the pin); the `dyld: …libcurl.4.dylib` suffix is
the pass-through underlying reason. The prepared XCTest runner artifact is
cached under `~/.agent-device/apple-runner` and fingerprinted on package
version, runner-source fingerprint, Xcode version+build, and SDK version+build
(`runner-cache-metadata.ts`) — **not** on the macOS host build. 0.20.10 does
rebuild on a *retriable/timeout-shaped* restore-health failure, but a dyld
library-load failure does not match that classifier, so it surfaces as a hard
error instead of triggering a rebuild.

**Upstream status: unknown/unreported.** Zero GitHub issues or PRs mention
`libcurl`, that dyld failure, or this restore path failing this way
(`gh api search/issues`, 2026-09-01). Artifact caching was introduced in
[#688](https://github.com/callstack/agent-device/pull/688).

**Remedy: keep/extend a local workaround, and file upstream.** Concretely:
purge `~/.agent-device/apple-runner` (or at least its cached artifact) in the
retry path — e.g. in `scripts/reset-device-contract-ios-simulator.mjs` next to
the simulator erase — so attempt 2 rebuilds the runner instead of restoring the
artifact that just failed to load. Upstream deserves an issue asking for (a)
the macOS host build in the cache fingerprint and (b) dyld load failures to be
admitted to the rebuild-fallback classifier.

### 4. Android `adb reverse` — `listener tcp:NNNN not found`

**Not an agent-device error in this repo.** All `android.fallback` scenarios
route to Detox (`e2e/contracts/pointer-drivers.json` `routes`), and the string
is adb's own stderr surfaced by Detox
(`node_modules/detox/src/devices/common/drivers/android/exec/ADB.js`,
`reverse --remove`). For completeness: agent-device 0.20.10 already *tolerates*
this exact message on its own `reverse --remove` path
(`isMissingReverseMapping`, `packages/platform-android/src/adb-port-reverse.ts`),
and zero upstream issues match.

**Remedy: no agent-device action (unknown upstream / out of scope).** Treat as
a Detox/adb race; the attempt-level retry already covers it. The PID-derived
per-scenario Detox ports in `run-device-contract-isolated.mjs` reduce reverse
collisions between processes and should stay.

### 5. Android emulator-boot flakes

**Not an agent-device concern here.** Emulator lifecycle is owned by
`reactivecircus/android-emulator-runner` in
`.github/workflows/exact-package-candidate.yml`; agent-device never drives the
Android lanes. Upstream, for reference, polls `sys.boot_completed` with a 120 s
default (`ANDROID_EMULATOR_BOOT_TIMEOUT_MS`,
`packages/platform-android/src/emulator-lifecycle.ts`) and reworked boot
readiness in [#1747](https://github.com/callstack/agent-device/pull/1747)
(0.20.9) — none of which is on our path.

**Remedy: keep local configuration** (emulator-runner options and the job-level
retry). No upstream agent-device fix applies.

## Local workaround audit vs upstream guidance

| Local workaround | Upstream position | Verdict |
| --- | --- | --- |
| `prepare ios-runner` preflight after boot/install, before replay (`scripts/prepare-agent-device-ios-runner.mjs`) | Documented verbatim: "Apple CI: prepare ios-runner after boot/install, before replay/test" (`help workflow`, 0.20.10) | Matches upstream — keep |
| Stopping the default-state-dir daemon and the replay-state-dir daemon around preflight | Documented: "if replay/test starts a separate daemon, stop the prepare daemon before replay/test so it does not keep the prepared runner lease"; recovery for "already owned" is "stop the owning daemon", never re-running prepare (`help prepare`, 0.20.10) | Matches upstream — keep. The repo also reuses one `AGENT_DEVICE_STATE_DIR` for prepare + replay, which enables the sanctioned same-state-dir lease takeover |
| Alert-seeding relaunch dance (open deep link → `alert accept` → relaunch → re-open deep link) | No upstream concept; only generic `alert accept/dismiss` and `settings permission` (which some runtimes reject for notifications) | Genuinely local — keep |
| Exit-75 (`EX_TEMPFAIL`) infrastructure-retry sentinel | Zero occurrences upstream; replay exit codes are 0/1 | Local convention — keep |
| `simctl erase` between attempts (`reset-device-contract-ios-simulator.mjs`) | No `simctl erase` anywhere upstream; neither recommended nor advised against | Local policy — keep, but pair it with the runner-artifact cache purge (flake 3) since erase changes the device state the restored runner reconnects to |
| PID-derived per-scenario Detox ports | Detox appears upstream only in comparison docs | Local (Detox-side) — keep |
| IPv4 pinning (`ws://127.0.0.1:…`) | Consistent with upstream practice: the daemon deliberately binds `127.0.0.1` only (`security-trust.md`) | Local (Detox-side), aligned — keep |

## Evidence

- Releases/tags/npm: [github.com/callstack/agent-device/releases](https://github.com/callstack/agent-device/releases)
  (latest v0.20.10, 2026-08-24); `npm view agent-device versions time`
  (latest 0.20.10); `gh api search/issues q=is:pr is:merged merged:>2026-08-24`
  (≈115 unreleased PRs as of 2026-09-01).
- Pinned-dist verification (0.20.10, `node_modules/agent-device/dist/`):
  `runner-lease.js` (lease dir, takeover rules, exact "already owned" message
  and hints), `runner-client.js` (`RUNNER_BUSY` mapping, "artifact restored but
  runner did not connect", timeout-shaped rebuild classifier),
  `apple/runner/.../RunnerTests+CommandExecution.swift` (30 s watchdog,
  `RUNNER_BUSY` payload).
- CLI help (0.20.10): `help workflow` (Apple CI order; "runners and daemons
  both self-idle after 5 minutes, and a stale lease reclaims automatically — a
  live owner still rejects"), `help prepare` (stop the prepare daemon; not a
  recovery step), `help daemon` (`daemon stop --state-dir --clean`),
  `help physical-device` (idle-timeout env vars). No `help ci` topic exists.
- Upstream PRs/issues linked inline above; upstream docs:
  [sessions](https://oss.callstack.com/agent-device/docs/sessions)
  (`close --shutdown` "prevents resource leakage in CI/multi-tenant
  workloads"), `website/docs/docs/replay-e2e.md` (CI replay guidance),
  `website/docs/docs/configuration.md` (GitHub-Actions `install-from-source`
  artifact source), `website/docs/docs/security-trust.md` (loopback-only bind).
- Local scripts audited: `scripts/prepare-agent-device-ios-runner.mjs`,
  `scripts/run-device-contract-job.mjs`,
  `scripts/run-device-contract-isolated.mjs`,
  `scripts/reset-device-contract-ios-simulator.mjs`,
  `e2e/contracts/pointer-drivers.json`,
  `.github/workflows/exact-package-candidate.yml`; adb message attribution:
  `node_modules/detox/src/devices/common/drivers/android/exec/ADB.js`.
