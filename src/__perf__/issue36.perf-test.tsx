import { test } from '@jest/globals';
import { FlashList } from '@shopify/flash-list';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { measureRenders } from 'reassure';

import {
  ReorderableFlashList,
  ReorderableFlashSectionList,
} from '../flash-list';

const items = Array.from({ length: 1_000 }, (_, index) => ({
  id: `flash-${index}`,
  label: `Flash row ${index}`,
}));
const sections = Array.from({ length: 24 }, (_, sectionIndex) => ({
  id: `flash-section-${sectionIndex}`,
  data: [0, 12, 23].includes(sectionIndex)
    ? []
    : items.slice(sectionIndex * 25, sectionIndex * 25 + 25),
}));
const renderItem = ({ item }: { item: (typeof items)[number] }) => (
  <Text>{item.label}</Text>
);

test('paired plain FlashList provider render path', async () => {
  await measureRenders(
    <FlashList
      data={items}
      drawDistance={240}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
    />,
    { runs: 5 }
  );
}, 60_000);

test('1,000-row ReorderableFlashList provider render path', async () => {
  await measureRenders(
    <GestureHandlerRootView>
      <ReorderableFlashList
        data={items}
        drawDistance={240}
        estimatedItemSize={60}
        keyExtractor={(item) => item.id}
        onReorder={() => undefined}
        renderItem={renderItem}
      />
    </GestureHandlerRootView>,
    { runs: 5 }
  );
}, 60_000);

test('24-section ReorderableFlashSectionList provider render path', async () => {
  await measureRenders(
    <GestureHandlerRootView>
      <ReorderableFlashSectionList
        sections={sections}
        drawDistance={240}
        estimatedItemSize={60}
        keyExtractor={(item) => item.id}
        onReorder={() => undefined}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => <Text>{section.id}</Text>}
      />
    </GestureHandlerRootView>,
    { runs: 5 }
  );
}, 60_000);
