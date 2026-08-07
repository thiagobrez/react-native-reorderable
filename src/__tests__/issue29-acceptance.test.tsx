import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { isValidElement } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as publicApi from '..';

import { DragDropContainer, DraggableItem, DropZone, type DropEvent } from '..';
import { ReorderableContainer, ReorderableItem } from '..';
import {
  FallbackDropAcceptanceContainer,
  NativeDropAcceptanceContainer,
} from '../issue29-acceptance';
import { normalizeDragChildren } from '../normalize';

function scenario(
  onDrop: (event: DropEvent) => void,
  canDrop: (ids: readonly string[]) => boolean = () => true
) {
  return (
    <GestureHandlerRootView>
      <FallbackDropAcceptanceContainer
        acceptanceMove={{ sourceId: 'blue', destinationId: 'accepting' }}
        onDrop={onDrop}
      >
        <View testID="source-layout" style={{ padding: 7 }}>
          <DraggableItem id="blue">
            <Text>Blue</Text>
          </DraggableItem>
        </View>
        <View testID="zones-layout" style={{ flexDirection: 'row', gap: 11 }}>
          <DropZone id="accepting" canDrop={canDrop}>
            <Text>Accepting</Text>
          </DropZone>
          <DropZone id="rejecting" canDrop={() => false}>
            <Text>Rejecting</Text>
          </DropZone>
        </View>
      </FallbackDropAcceptanceContainer>
    </GestureHandlerRootView>
  );
}

describe('issue 29 scoped drag and drop', () => {
  it('exports only the frozen v1 drag-and-drop names', () => {
    expect(publicApi).toHaveProperty('DragDropContainer');
    expect(publicApi).toHaveProperty('DraggableItem');
    expect(publicApi).toHaveProperty('DropZone');
    expect(publicApi).not.toHaveProperty('DragContainer');
  });

  it('finds draggable and zone markers through layout descendants', async () => {
    const rendered = await render(
      <GestureHandlerRootView>
        <DragDropContainer onDrop={() => undefined} engine="fallback">
          <Pressable>
            <DraggableItem id="blue">
              <Text>Blue</Text>
            </DraggableItem>
          </Pressable>
          <Animated.View>
            <DropZone id="archive">
              <Text>Archive</Text>
            </DropZone>
          </Animated.View>
        </DragDropContainer>
      </GestureHandlerRootView>
    );
    expect(rendered.getByText('Blue')).toBeOnTheScreen();
    expect(rendered.getByText('Archive')).toBeOnTheScreen();
    const normalized = normalizeDragChildren(
      <View testID="zones-layout" style={{ flexDirection: 'row', gap: 11 }}>
        <DropZone id="archive">
          <Text>Archive</Text>
        </DropZone>
      </View>,
      { Item: DraggableItem, DropZone }
    );
    expect(normalized.entryKinds).toEqual(['layout', 'dropZone']);
    expect(normalized.parentEntryIds).toEqual(['', 'layout:0']);
    const layout = normalized.children[0];
    expect(isValidElement<{ style?: unknown }>(layout)).toBe(true);
    if (!isValidElement<{ style?: unknown }>(layout)) {
      throw new Error('Expected a normalized layout element');
    }
    expect(layout.props.style).toEqual({
      flexDirection: 'row',
      gap: 11,
    });
  });

  it('isolates roots and rejects reorder/drag nesting', () => {
    expect(() =>
      DragDropContainer({
        children: (
          <DragDropContainer onDrop={() => undefined}>
            <DraggableItem id="inner">
              <Text>Inner</Text>
            </DraggableItem>
          </DragDropContainer>
        ),
        onDrop: () => undefined,
      })
    ).toThrow('roots cannot nest');
    expect(() =>
      ReorderableContainer({
        children: (
          <ReorderableItem id="one">
            <DropZone id="zone">
              <Text>Zone</Text>
            </DropZone>
          </ReorderableItem>
        ),
        onReorder: () => undefined,
      })
    ).toThrow('cannot nest or interoperate');
  });

  it('rejects an item identity owned by a sibling drag root', async () => {
    const onDrop = jest.fn<(event: DropEvent) => void>();
    const rendered = await render(
      <GestureHandlerRootView>
        <FallbackDropAcceptanceContainer
          acceptanceMove={{ sourceId: 'foreign', destinationId: 'local-zone' }}
          onDrop={onDrop}
        >
          <DraggableItem id="local">
            <Text>Local</Text>
          </DraggableItem>
          <DropZone id="local-zone">
            <Text>Local zone</Text>
          </DropZone>
        </FallbackDropAcceptanceContainer>
        <DragDropContainer engine="fallback" onDrop={() => undefined}>
          <DraggableItem id="foreign">
            <Text>Foreign</Text>
          </DraggableItem>
          <DropZone id="foreign-zone">
            <Text>Foreign zone</Text>
          </DropZone>
        </DragDropContainer>
      </GestureHandlerRootView>
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Activate fallback drop' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Move fallback drop destination' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Commit fallback drop' })
    );
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('commits an accepted event exactly once and cancels rejected/outside drops', async () => {
    const onDrop = jest.fn<(event: DropEvent) => void>();
    const rendered = await render(scenario(onDrop));
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Activate fallback drop' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Move fallback drop destination' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Commit fallback drop' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Commit fallback drop' })
    );
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith({
      itemIds: ['blue'],
      destinationId: 'accepting',
    });

    await rendered.rerender(scenario(onDrop, () => false));
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Activate fallback drop' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Move fallback drop destination' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Commit fallback drop' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Release fallback drop outside' })
    );
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it('snapshots acceptance at activation despite a prop change', async () => {
    const onDrop = jest.fn<(event: DropEvent) => void>();
    const rendered = await render(scenario(onDrop, () => true));
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Activate fallback drop' })
    );
    await rendered.rerender(scenario(onDrop, () => false));
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Move fallback drop destination' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Commit fallback drop' })
    );
    expect(onDrop).toHaveBeenCalledWith({
      itemIds: ['blue'],
      destinationId: 'accepting',
    });
  });

  it('surfaces a throwing predicate and cancels without a drop event', async () => {
    const onDrop = jest.fn<(event: DropEvent) => void>();
    const rendered = await render(
      scenario(onDrop, () => {
        throw new Error('predicate failed');
      })
    );
    await expect(
      fireEvent.press(
        rendered.getByRole('button', { name: 'Activate fallback drop' })
      )
    ).rejects.toThrow('predicate failed');
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Move fallback drop destination' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Commit fallback drop' })
    );
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('holds the same activation and terminal contract across the native adapter', async () => {
    const originalOS = Platform.OS;
    const originalVersion = Platform.Version;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 27,
    });
    const onDrop = jest.fn<(event: DropEvent) => void>();
    const onInteractionStateChange = jest.fn<(active: boolean) => void>();
    const nativeScenario = (canDrop: () => boolean, includeZone = true) => (
      <NativeDropAcceptanceContainer
        acceptanceMove={{ sourceId: 'blue', destinationId: 'accepting' }}
        interactionStateChange={onInteractionStateChange}
        onDrop={onDrop}
        testID="native-drop"
      >
        <DraggableItem id="blue">
          <Text>Blue</Text>
        </DraggableItem>
        {includeZone ? (
          <DropZone canDrop={canDrop} id="accepting">
            <Text>Accepting</Text>
          </DropZone>
        ) : null}
      </NativeDropAcceptanceContainer>
    );
    let rendered: Awaited<ReturnType<typeof render>> | undefined;
    try {
      rendered = await render(nativeScenario(() => true));
      await fireEvent(rendered.getByTestId('native-drop'), 'dragActivate', {
        nativeEvent: { itemIdsJson: '["blue"]' },
      });
      await rendered.rerender(nativeScenario(() => false));
      await fireEvent(rendered.getByTestId('native-drop'), 'drop', {
        nativeEvent: {
          destinationId: 'accepting',
          itemIdsJson: '["blue"]',
        },
      });
      await fireEvent(rendered.getByTestId('native-drop'), 'drop', {
        nativeEvent: {
          destinationId: 'accepting',
          itemIdsJson: '["blue"]',
        },
      });
      expect(onDrop).toHaveBeenCalledTimes(1);

      await fireEvent(rendered.getByTestId('native-drop'), 'dragActivate', {
        nativeEvent: { itemIdsJson: '["blue"]' },
      });
      await rendered.rerender(nativeScenario(() => true, false));
      await fireEvent(rendered.getByTestId('native-drop'), 'drop', {
        nativeEvent: {
          destinationId: 'accepting',
          itemIdsJson: '["blue"]',
        },
      });
      expect(onDrop).toHaveBeenCalledTimes(1);

      await rendered.rerender(
        nativeScenario(() => {
          throw new Error('native predicate failed');
        })
      );
      await expect(
        fireEvent(rendered.getByTestId('native-drop'), 'dragActivate', {
          nativeEvent: { itemIdsJson: '["blue"]' },
        })
      ).rejects.toThrow('native predicate failed');
      await fireEvent(rendered.getByTestId('native-drop'), 'drop', {
        nativeEvent: {
          destinationId: 'accepting',
          itemIdsJson: '["blue"]',
        },
      });
      expect(onDrop).toHaveBeenCalledTimes(1);

      await rendered.rerender(nativeScenario(() => true));
      await fireEvent(rendered.getByTestId('native-drop'), 'dragActivate', {
        nativeEvent: { itemIdsJson: '["blue"]' },
      });
      await fireEvent(
        rendered.getByTestId('native-drop'),
        'debugInteractionStateChange',
        { nativeEvent: { active: false } }
      );
      expect(onInteractionStateChange).toHaveBeenLastCalledWith(false);
      await fireEvent(rendered.getByTestId('native-drop'), 'drop', {
        nativeEvent: {
          destinationId: 'accepting',
          itemIdsJson: '["blue"]',
        },
      });
      expect(onDrop).toHaveBeenCalledTimes(1);

      await fireEvent(rendered.getByTestId('native-drop'), 'dragActivate', {
        nativeEvent: { itemIdsJson: '["foreign"]' },
      });
      await fireEvent(rendered.getByTestId('native-drop'), 'drop', {
        nativeEvent: {
          destinationId: 'accepting',
          itemIdsJson: '["foreign"]',
        },
      });
      expect(onDrop).toHaveBeenCalledTimes(1);
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
  });
});
