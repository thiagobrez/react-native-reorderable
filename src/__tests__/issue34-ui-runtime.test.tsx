import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { FlatList, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { scheduleOnRN } from 'react-native-worklets';

import { ReorderableList } from '..';

const items = Array.from({ length: 1_000 }, (_, index) => ({
  id: `variable-${index}`,
  label: `Variable row ${index}`,
}));

describe('ReorderableList UI-runtime ownership', () => {
  it('does not cross to JavaScript or rerender rows during pointer updates', async () => {
    const onReorder = jest.fn();
    const renderItem = jest.fn(({ item }: { item: (typeof items)[number] }) => (
      <Text>{item.label}</Text>
    ));
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableList
          data={items}
          estimatedItemSize={60}
          initialNumToRender={8}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={renderItem}
          testID="variable-list"
          windowSize={5}
        />
      </GestureHandlerRootView>
    );
    await fireEvent(rendered.getByTestId('variable-list'), 'layout', {
      nativeEvent: { layout: { height: 300, width: 300, x: 0, y: 0 } },
    });
    const scheduled = jest.mocked(scheduleOnRN);
    scheduled.mockClear();
    const rendersBeforeMoves = renderItem.mock.calls.length;
    const handler = getByGestureTestId(
      'reorderable-list-viewport'
    ) as unknown as {
      handlers: {
        onStart?: (event: { y: number }) => void;
        onTouchesMove?: (
          event: { allTouches: { x: number; y: number }[] },
          state: { fail: () => void }
        ) => void;
        onEnd?: (event: { y: number }) => void;
        onFinalize?: (event: { y: number }, success: boolean) => void;
      };
    };
    await act(async () => {
      handler.handlers.onStart?.({ y: 30 });
      for (let y = 40; y <= 240; y += 20) {
        handler.handlers.onTouchesMove?.(
          { allTouches: [{ x: 20, y }] },
          { fail: jest.fn() }
        );
      }
    });
    expect(scheduled).toHaveBeenCalledTimes(1);
    expect(renderItem).toHaveBeenCalledTimes(rendersBeforeMoves + 1);
    const frameControls = (
      globalThis as typeof globalThis & {
        __reorderableFrameControls: Set<{ isActive: boolean }>;
      }
    ).__reorderableFrameControls;
    expect([...frameControls].every((control) => !control.isActive)).toBe(true);

    await act(async () => {
      handler.handlers.onEnd?.({ y: 240 });
      handler.handlers.onFinalize?.({ y: 240 }, true);
    });
    expect(scheduled).toHaveBeenCalledTimes(2);
    expect(onReorder).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it('renders within paired FlatList plus or minus two cells at 1,000 rows', async () => {
    const plainRender = jest.fn(
      ({ item }: { item: (typeof items)[number] }) => <Text>{item.label}</Text>
    );
    const plain = await render(
      <FlatList
        data={items}
        initialNumToRender={8}
        keyExtractor={(item) => item.id}
        renderItem={plainRender}
        windowSize={5}
      />
    );
    const plainCount = plainRender.mock.calls.length;
    await plain.unmount();

    const reorderRender = jest.fn(
      ({ item }: { item: (typeof items)[number] }) => <Text>{item.label}</Text>
    );
    const reorderable = await render(
      <GestureHandlerRootView>
        <ReorderableList
          data={items}
          initialNumToRender={8}
          keyExtractor={(item) => item.id}
          onReorder={jest.fn()}
          renderItem={reorderRender}
          windowSize={5}
        />
      </GestureHandlerRootView>
    );

    expect(
      Math.abs(reorderRender.mock.calls.length - plainCount)
    ).toBeLessThanOrEqual(2);
    await reorderable.unmount();
  });
});
