import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { ReorderableList } from '..';

const items = Array.from({ length: 8 }, (_, index) => ({
  id: `item-${index}`,
  label: `Item ${index}`,
}));
const getItemLayout = (
  _data: readonly (typeof items)[number][],
  index: number
) => ({ index, length: 50, offset: index * 50 });

type ViewportHandler = {
  handlers: {
    onTouchesDown?: (event: {
      allTouches: { absoluteY: number; x: number; y: number }[];
    }) => void;
    onStart?: (event: { absoluteY: number; y: number }) => void;
    onTouchesMove?: (
      event: { allTouches: { absoluteY: number; x: number; y: number }[] },
      state: { fail: () => void }
    ) => void;
    onEnd?: (event: { absoluteY: number; y: number }) => void;
  };
};

describe('issue 67 drag render-path backstop', () => {
  it('activates the drag preview and destination feedback during a drag and hides both at release', async () => {
    const onReorder = jest.fn();
    const view = () => (
      <GestureHandlerRootView>
        <ReorderableList
          data={items}
          getItemLayout={getItemLayout}
          keyExtractor={(item) => item.id}
          onReorder={onReorder}
          renderItem={({ item }) => <Text>{item.label}</Text>}
          testID="backstop-list"
        />
      </GestureHandlerRootView>
    );
    const rendered = await render(view());
    await fireEvent(rendered.getByTestId('backstop-list'), 'layout', {
      nativeEvent: { layout: { height: 200, width: 300, x: 0, y: 0 } },
    });
    const feedbackStyle = () =>
      StyleSheet.flatten(
        rendered.getByTestId('reorderable-list-destination-feedback', {
          includeHiddenElements: true,
        }).props.style
      );
    const sourceCopies = () =>
      rendered.getAllByText('Item 0', { includeHiddenElements: true });
    const previewCopy = () =>
      sourceCopies().find(
        ({ parent }) => parent?.props.accessibilityElementsHidden === true
      );

    expect(sourceCopies()).toHaveLength(1);
    expect(previewCopy()).toBeUndefined();
    expect(feedbackStyle().opacity).toBe(0);

    const handler = getByGestureTestId(
      'reorderable-list-viewport'
    ) as unknown as ViewportHandler;
    // Grab item-0 (rows are 50 tall, so viewport y 25 is its middle). While
    // the pointer is over the grabbed row, the destination is the following
    // boundary: index 1 at content offset 50.
    await act(async () => {
      handler.handlers.onTouchesDown?.({
        allTouches: [{ absoluteY: 500, x: 20, y: 25 }],
      });
      handler.handlers.onStart?.({ absoluteY: 500, y: 25 });
    });
    await rendered.rerender(view());

    expect(sourceCopies()).toHaveLength(2);
    const activePreview = previewCopy();
    expect(activePreview).toBeDefined();
    expect(activePreview?.parent?.props.pointerEvents).toBe('none');
    expect(
      StyleSheet.flatten(activePreview?.parent?.props.style)
    ).toMatchObject({ height: 50 });
    expect(feedbackStyle()).toMatchObject({
      opacity: 1,
      transform: [{ translateY: 50 }],
    });

    // Move the touch down by 85 (absoluteY 500 -> 585): the pointer lands at
    // viewport y 110, inside the leading half of item-2, so the insertion
    // destination is index 2 and the feedback sits on its boundary at 100.
    await act(async () => {
      handler.handlers.onTouchesMove?.(
        { allTouches: [{ absoluteY: 585, x: 20, y: 0 }] },
        { fail: jest.fn() }
      );
    });
    await rendered.rerender(view());

    expect(feedbackStyle()).toMatchObject({
      opacity: 1,
      transform: [{ translateY: 100 }],
    });
    const movedPreviewStyle = StyleSheet.flatten(
      previewCopy()?.parent?.props.style
    );
    expect(movedPreviewStyle).toBeDefined();
    // The preview tracks the pointer translation (85) plus the iOS active
    // preview visual offset of -12: 0 (origin) + 85 - 12 = 73.
    expect(movedPreviewStyle?.transform).toEqual([{ translateY: 73 }]);

    await act(async () => handler.handlers.onEnd?.({ absoluteY: 585, y: 110 }));
    expect(onReorder).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceIds: ['item-0'],
        destination: { sectionId: null, beforeId: 'item-2' },
      })
    );
    await rendered.rerender(view());

    expect(sourceCopies()).toHaveLength(1);
    expect(previewCopy()).toBeUndefined();
    expect(feedbackStyle().opacity).toBe(0);
    await rendered.unmount();
  });
});
