import { test } from '@jest/globals';
import { SectionList, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { measureRenders } from 'reassure';

import { ReorderableSectionList } from '..';

const sections = Array.from({ length: 24 }, (_, sectionIndex) => ({
  id: `section-${sectionIndex}`,
  data: [0, 12, 23].includes(sectionIndex)
    ? []
    : Array.from({ length: 25 }, (_unused, itemIndex) => ({
        id: `section-${sectionIndex}-item-${itemIndex}`,
        label: `Section ${sectionIndex} item ${itemIndex}`,
      })),
}));
const renderItem = ({ item }: { item: { id: string; label: string } }) => (
  <Text>{item.label}</Text>
);
const renderSectionHeader = ({
  section,
}: {
  section: (typeof sections)[number];
}) => <Text>{section.id}</Text>;

test('paired plain SectionList critical render path', async () => {
  await measureRenders(
    <SectionList
      sections={sections}
      initialNumToRender={8}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      windowSize={5}
    />,
    { runs: 5 }
  );
});

test('24-section ReorderableSectionList critical render path', async () => {
  await measureRenders(
    <GestureHandlerRootView>
      <ReorderableSectionList
        sections={sections}
        estimatedItemSize={60}
        initialNumToRender={8}
        keyExtractor={(item) => item.id}
        onReorder={() => undefined}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        windowSize={5}
      />
    </GestureHandlerRootView>,
    { runs: 5 }
  );
});
