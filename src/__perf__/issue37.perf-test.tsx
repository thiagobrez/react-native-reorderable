import { test } from '@jest/globals';
import { LegendList } from '@legendapp/list/react-native';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { measureRenders } from 'reassure';

import {
  ReorderableLegendList,
  ReorderableLegendSectionList,
} from '../legend-list';

const items = Array.from({ length: 1_000 }, (_, index) => ({
  id: `legend-${index}`,
  label: `Legend row ${index}`,
}));
const sections = Array.from({ length: 24 }, (_, sectionIndex) => ({
  id: `legend-section-${sectionIndex}`,
  data: [0, 12, 23].includes(sectionIndex)
    ? []
    : items.slice(sectionIndex * 25, sectionIndex * 25 + 25),
}));
const renderItem = ({ item }: { item: (typeof items)[number] }) => (
  <Text>{item.label}</Text>
);

test('paired plain Legend List provider render path', async () => {
  await measureRenders(
    <LegendList
      data={items}
      drawDistance={240}
      estimatedItemSize={60}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
    />,
    { runs: 5 }
  );
}, 60_000);

test('1,000-row ReorderableLegendList provider render path', async () => {
  await measureRenders(
    <GestureHandlerRootView>
      <ReorderableLegendList
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

test('24-section ReorderableLegendSectionList provider render path', async () => {
  await measureRenders(
    <GestureHandlerRootView>
      <ReorderableLegendSectionList
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
