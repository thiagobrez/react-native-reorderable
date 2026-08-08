import { test } from '@jest/globals';
import { FlatList, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { measureRenders } from 'reassure';

import { ReorderableList } from '..';

const items = Array.from({ length: 1_000 }, (_, index) => ({
  id: `variable-${index}`,
  label: `Variable row ${index}`,
}));
const renderItem = ({ item }: { item: (typeof items)[number] }) => (
  <Text>{item.label}</Text>
);

test('paired plain FlatList critical render path', async () => {
  await measureRenders(
    <FlatList
      data={items}
      initialNumToRender={8}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      windowSize={5}
    />,
    { runs: 5 }
  );
});

test('1,000-row variable-height ReorderableList critical render path', async () => {
  await measureRenders(
    <GestureHandlerRootView>
      <ReorderableList
        data={items}
        estimatedItemSize={60}
        initialNumToRender={8}
        keyExtractor={(item) => item.id}
        onReorder={() => undefined}
        renderItem={renderItem}
        windowSize={5}
      />
    </GestureHandlerRootView>,
    { runs: 5 }
  );
});
