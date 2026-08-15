import { test } from '@jest/globals';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { measureRenders } from 'reassure';

import { ReorderableContainer, ReorderableItem } from '..';

const itemIds = Array.from({ length: 12 }, (_, index) => `child-${index}`);

test('paired plain children critical render path', async () => {
  await measureRenders(
    <View>
      {itemIds.map((id) => (
        <View key={id}>
          <Text>{id}</Text>
        </View>
      ))}
    </View>,
    { runs: 5 }
  );
});

test('12-item ReorderableContainer critical render path', async () => {
  await measureRenders(
    <GestureHandlerRootView>
      <ReorderableContainer engine="fallback" onReorder={() => undefined}>
        {itemIds.map((id) => (
          <ReorderableItem id={id} key={id}>
            <View>
              <Text>{id}</Text>
            </View>
          </ReorderableItem>
        ))}
      </ReorderableContainer>
    </GestureHandlerRootView>,
    { runs: 5 }
  );
});
