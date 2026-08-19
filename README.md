# react-native-reorderable

Virtualized, sectioned and native reorder and drag-and-drop library for React Native.

The native engine is used where that capability is available. The supported cross-platform fallback provides the same portable contract everywhere else.

## Install

```sh
yarn add react-native-reorderable react-native-gesture-handler react-native-reanimated react-native-worklets
```

V1 supports React Native 0.82–0.86 on the New Architecture, React 19.1–19.x, iOS 15.1+, Android API 24+, and Hermes. Bare React Native apps must configure `react-native-worklets/plugin`; Expo apps require a development build because Expo Go cannot load the custom native code.

See the [canonical documentation](https://thiagobrez.github.io/react-native-reorderable/) for the full compatibility matrix and setup.

## Quick start

```tsx
import { useState } from 'react';
import { Text } from 'react-native';
import {
  ReorderableList,
  type ReorderEvent,
} from 'react-native-reorderable';

const initialRows = [
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'yellow', label: 'Yellow' },
];

export function Colors() {
  const [rows, setRows] = useState(initialRows);

  const accept = (event: ReorderEvent) => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    setRows(event.nextOrder[0]!.itemIds.map((id) => byId.get(id)!));
  };

  return (
    <ReorderableList
      data={rows}
      keyExtractor={(row) => row.id}
      onReorder={accept}
      renderItem={({ item }) => <Text>{item.label}</Text>}
    />
  );
}
```

Application data and selection are controlled. Render `event.nextOrder` to accept a reorder commit, delay it, or retain the current data to restore the prior order.

## Interfaces

- `ReorderableContainer`, `ReorderableItem`, and `ReorderableSection` for fully mounted free-form children.
- `ReorderableList` and `ReorderableSectionList` for React Native virtualization.
- `react-native-reorderable/flash-list` and `/legend-list` for isolated optional providers.
- `DragDropContainer`, `DraggableItem`, and `DropZone` for semantic drag-and-drop scopes.

Read the [guides](https://thiagobrez.github.io/react-native-reorderable/guide/introduction), browse the [generated API reference](https://thiagobrez.github.io/react-native-reorderable/api/reference), or run the five [type-checked examples](https://thiagobrez.github.io/react-native-reorderable/examples/).

## Community

See [CONTRIBUTING.md](CONTRIBUTING.md) before sending a change. Use [GitHub Discussions](https://github.com/thiagobrez/react-native-reorderable/discussions) for questions and ideas, and the bug-report form for reproducible contract failures. All participation follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT
