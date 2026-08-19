# Installation

```sh
yarn add react-native-reorderable react-native-gesture-handler react-native-reanimated react-native-worklets
```

For bare React Native, add the Worklets Babel plugin as the final plugin:

```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['react-native-worklets/plugin'],
};
```

And then install CocoaPods:

```sh
npx pod-install
```

## Expo

This package contains custom native code, so you will need to use an Expo development build. Expo Go is unsupported.

Expo's Babel preset already configures Worklets, so do not add a duplicate Worklets plugin unless the Expo/Reanimated documentation for your exact stack requires it.

## Minimal controlled list

```tsx
const [rows, setRows] = useState(initialRows);

<ReorderableList
  data={rows}
  keyExtractor={(row) => row.id}
  renderItem={({ item }) => <Row row={item} />}
  onReorder={(event) => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    setRows(event.nextOrder[0]!.itemIds.map((id) => byId.get(id)!));
  }}
/>;
```

Every item and section needs a stable, non-empty ID. Start with [engine policy](./engine-policy) and [controlled reorder](./controlled-reorder) before choosing an interface.
