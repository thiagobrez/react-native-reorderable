import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { Platform, Pressable, Text } from 'react-native';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import {
  FallbackCommitAcceptanceContainer,
  NativeCommitAcceptanceContainer,
  ReorderableItem,
  ReorderableSection,
} from '../primitives';
import { Commands } from '../ReorderableViewNativeComponent';
import type { ReorderEvent } from '../types';

const order = [
  { sectionId: 'beginning-empty', itemIds: [] },
  { sectionId: 'favorites', itemIds: ['blue', 'green', 'yellow'] },
  { sectionId: 'middle-empty', itemIds: [] },
  { sectionId: 'others', itemIds: ['orange', 'pink'] },
  { sectionId: 'end-empty', itemIds: [] },
] as const;

function contents() {
  return order.map((section) => (
    <ReorderableSection
      header={<Text>{section.sectionId}</Text>}
      id={section.sectionId}
      key={section.sectionId}
    >
      {section.itemIds.map((id) => (
        <ReorderableItem id={id} key={id}>
          <Text>{id}</Text>
        </ReorderableItem>
      ))}
    </ReorderableSection>
  ));
}

async function withNativePlatform(run: () => Promise<void>) {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 27 });
  try {
    await run();
  } finally {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalOS,
    });
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: originalVersion,
    });
  }
}

const canonicalSources = ['blue', 'yellow', 'pink'] as const;

describe('issue 27 shared section and selection contract', () => {
  it.each(['beginning-empty', 'middle-empty', 'end-empty'])(
    'native and fallback commit the same canonical move into %s',
    async (sectionId) => {
      const events: ReorderEvent[] = [];
      const destination = { sectionId, beforeId: null } as const;

      const fallback = await render(
        <GestureHandlerRootView>
          <FallbackCommitAcceptanceContainer
            acceptanceMove={{ sourceIds: canonicalSources, destination }}
            onReorder={(event) => events.push(event)}
            selectedIds={['pink', 'missing', 'blue', 'pink', 'yellow']}
          >
            {contents()}
          </FallbackCommitAcceptanceContainer>
        </GestureHandlerRootView>
      );
      await fireEvent.press(
        fallback.getByRole('button', { name: 'Activate fallback reorder' })
      );
      await fireEvent.press(
        fallback.getByRole('button', { name: 'Move fallback destination' })
      );
      await fireEvent.press(
        fallback.getByRole('button', { name: 'Commit fallback reorder' })
      );
      await fallback.unmount();

      await withNativePlatform(async () => {
        let native: Awaited<ReturnType<typeof render>> | undefined;
        const command = jest
          .spyOn(Commands, 'debugEmitTerminalReorder')
          .mockImplementation(() => {
            if (native == null) throw new Error('Native tree is not mounted.');
            fireEvent(native.getByTestId('native-sections'), 'move', {
              nativeEvent: {
                sourceIdsJson: JSON.stringify(canonicalSources),
                destinationCollectionId: sectionId,
                destinationBeforeId: '',
              },
            });
          });
        try {
          native = await render(
            <NativeCommitAcceptanceContainer
              acceptanceMove={{ sourceIds: canonicalSources, destination }}
              onReorder={(event) => events.push(event)}
              selectedIds={['pink', 'missing', 'blue', 'pink', 'yellow']}
              testID="native-sections"
            >
              {contents()}
            </NativeCommitAcceptanceContainer>
          );
          await fireEvent.press(
            native.getByRole('button', { name: 'Apply native reorder' })
          );
        } finally {
          command.mockRestore();
          await native?.unmount();
        }
      });

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual(events[1]);
      expect(events[0]?.sourceIds).toEqual(canonicalSources);
      expect(
        events[0]?.nextOrder.find((entry) => entry.sectionId === sectionId)
      ).toEqual({ sectionId, itemIds: canonicalSources });
    }
  );

  it('keeps one fallback interaction valid after a child changes size', async () => {
    const onReorder = jest.fn<(event: ReorderEvent) => void>();
    function DynamicScenario() {
      const [expanded, setExpanded] = useState(false);
      return (
        <GestureHandlerRootView>
          <Pressable
            accessibilityLabel="Toggle child size"
            accessibilityRole="button"
            onPress={() => setExpanded((current) => !current)}
          >
            <Text>Toggle</Text>
          </Pressable>
          <FallbackCommitAcceptanceContainer
            acceptanceMove={{
              sourceIds: ['yellow'],
              destination: { sectionId: null, beforeId: 'green' },
            }}
            onReorder={onReorder}
          >
            <ReorderableItem id="blue">
              <Text>blue</Text>
            </ReorderableItem>
            <ReorderableItem id="green" style={{ height: expanded ? 120 : 60 }}>
              <Text>{expanded ? 'green expanded' : 'green'}</Text>
            </ReorderableItem>
            <ReorderableItem id="yellow">
              <Text>yellow</Text>
            </ReorderableItem>
          </FallbackCommitAcceptanceContainer>
        </GestureHandlerRootView>
      );
    }
    const rendered = await render(<DynamicScenario />);
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Activate fallback reorder' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Toggle child size' })
    );
    expect(rendered.getByText('green expanded')).toBeOnTheScreen();
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Move fallback destination' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Commit fallback reorder' })
    );
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith({
      sourceIds: ['yellow'],
      destination: { sectionId: null, beforeId: 'green' },
      nextOrder: [{ sectionId: null, itemIds: ['blue', 'yellow', 'green'] }],
    });
  });
});
