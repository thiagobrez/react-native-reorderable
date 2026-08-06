# Snapshot drop acceptance at activation

Each drop zone may synchronously decide whether it accepts a move set, and that result is fixed when a pointer drag activates; accessible drops evaluate acceptance when invoked. Snapshotting lets both the SwiftUI-native and fallback engines present truthful destination feedback without repeatedly executing arbitrary JavaScript during hover, at the cost of applying acceptance-prop changes only to the next pointer interaction.
