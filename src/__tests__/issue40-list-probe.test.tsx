import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { scheduleOnRN } from 'react-native-worklets';

import {
  ReorderableListRuntime,
  type ReorderableListPerformanceSample,
} from '../reorderable-list';

const items = Array.from({ length: 10_000 }, (_, index) => ({
  id: `item-${index}`,
  label: `Item ${index}`,
}));

describe('issue #40 production list performance probe', () => {
  it('reports bounded UI work through the existing single terminal bridge', async () => {
    const onGestureTerminal =
      jest.fn<(sample: ReorderableListPerformanceSample) => void>();
    const onReorder = jest.fn();
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableListRuntime
          __performanceProbe={{ onGestureTerminal }}
          data={items}
          engine="fallback"
          getItemLayout={(_data, index) => ({
            index,
            length: 52,
            offset: index * 52,
          })}
          initialNumToRender={8}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          testID="performance-list"
          windowSize={5}
        />
      </GestureHandlerRootView>
    );
    await fireEvent(rendered.getByTestId('performance-list'), 'layout', {
      nativeEvent: { layout: { height: 300, width: 300, x: 0, y: 0 } },
    });
    const scheduled = jest.mocked(scheduleOnRN);
    scheduled.mockClear();
    const handler = getByGestureTestId(
      'reorderable-list-viewport'
    ) as unknown as {
      handlers: {
        onStart?: (event: { absoluteY: number; y: number }) => void;
        onTouchesMove?: (
          event: {
            allTouches: {
              absoluteY: number;
              x: number;
              y: number;
            }[];
          },
          state: { fail: () => void }
        ) => void;
        onEnd?: (event: { absoluteY: number; y: number }) => void;
      };
    };

    await act(async () => {
      handler.handlers.onStart?.({ absoluteY: 30, y: 30 });
      for (let y = 50; y <= 230; y += 20) {
        handler.handlers.onTouchesMove?.(
          { allTouches: [{ absoluteY: y, x: 20, y }] },
          { fail: jest.fn() }
        );
      }
      handler.handlers.onEnd?.({ absoluteY: 230, y: 230 });
    });

    expect(onGestureTerminal).toHaveBeenCalledTimes(1);
    expect(onGestureTerminal).toHaveBeenCalledWith({
      maximumLookupSteps: expect.any(Number),
      p95LibraryUiWorkMs: expect.any(Number),
      pointerJsCalls: 0,
      terminalJsResults: 1,
    });
    expect(
      onGestureTerminal.mock.calls[0]![0].maximumLookupSteps
    ).toBeLessThanOrEqual(15);
    expect(scheduled).toHaveBeenCalledTimes(2);
    expect(onReorder).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });
});
