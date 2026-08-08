# Issue 38 device evidence

The shared named-scenario verifier passed all 18 visible routes on both iOS and
Android. Directories ending in `-final` contain the evidence refreshed after
the final visible UI and review corrections; they supersede the corresponding
earlier matrix screenshots.

Behavioral evidence includes:

- Android Fallback off-window auto-scroll through the app-owned
  `row-autoscroll-10` activation target, with one reorder commit and one
  callback.
- iOS and Android lifecycle cancellation by a real `enabled={false}` change and
  by unmount during an active long press, both with zero callbacks.
- Named component-level public interactions for accessible reorder and
  accepting, rejecting, and unmounting drop destinations.

## Tool boundaries

Agent Device 0.20.2 can perform a stationary long press or an immediate pan,
but does not expose hold-then-move pointer choreography. The iOS off-window
auto-scroll route and screenshot are covered, but its pointer-driven reorder
commit could not be reproduced through that CLI; Android supplies the
device-level behavioral proof. The CLI also cannot invoke a custom React Native
accessibility action, so accessible reorder and accessible drop actions are
exercised on the actual named scenario components in Jest instead of by a
hidden device surface.

No Detox dependency, configuration, test suite, or package script exists in
this repository, so ADR-0006's configured Detox fallback was unavailable.

Android's Agent Device URL launcher mishandles the literal `&` in the canonical
deep link. The canonical URL was therefore launched once through Android's
native activity manager, after which Agent Device verified the visible route,
preset, policy, and canonical link. Parser tests cover the same stable grammar.
