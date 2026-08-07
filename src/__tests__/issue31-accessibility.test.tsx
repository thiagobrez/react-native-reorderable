import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import {
  ReorderableContainer,
  ReorderableItem,
  ReorderableSection,
} from '../primitives';
import type { ReorderEvent } from '../types';

function item(id: string, extraProps = {}) {
  return (
    <ReorderableItem accessibilityLabel={id} id={id} key={id} {...extraProps}>
      <Text>{id}</Text>
    </ReorderableItem>
  );
}

function gestureRoot(children: React.ReactNode) {
  return <GestureHandlerRootView>{children}</GestureHandlerRootView>;
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

describe('issue 31 portable accessible reorder', () => {
  it('exposes only valid localized actions and composes app actions', async () => {
    const onAppAction = jest.fn();
    const rendered = await render(
      gestureRoot(
        <ReorderableContainer
          accessibilityStrings={{
            moveEarlierAction: 'Mover antes',
            moveLaterAction: 'Mover depois',
          }}
          engine="fallback"
          onReorder={jest.fn()}
        >
          {item('blue', {
            accessibilityActions: [{ name: 'favorite', label: 'Favorite' }],
            accessibilityValue: { text: 'Application value' },
            onAccessibilityAction: onAppAction,
          })}
          {item('green')}
        </ReorderableContainer>
      )
    );

    expect(rendered.getByLabelText('blue').props.accessibilityActions).toEqual([
      { name: 'favorite', label: 'Favorite' },
      { name: 'reorder-move-later', label: 'Mover depois' },
    ]);
    expect(rendered.getByLabelText('green').props.accessibilityActions).toEqual(
      [{ name: 'reorder-move-earlier', label: 'Mover antes' }]
    );
    expect(rendered.getByLabelText('blue').props.accessibilityValue).toEqual({
      min: 1,
      max: 2,
      now: 1,
    });
    expect(rendered.getByLabelText('green').props.accessibilityValue).toEqual({
      min: 1,
      max: 2,
      now: 2,
    });

    await fireEvent(rendered.getByLabelText('blue'), 'accessibilityAction', {
      nativeEvent: { actionName: 'favorite' },
    });
    expect(onAppAction).toHaveBeenCalledTimes(1);
  });

  it('preserves an app action that collides with the library base name', async () => {
    const onAppAction = jest.fn();
    const onReorder = jest.fn<(event: ReorderEvent) => void>();
    const rendered = await render(
      gestureRoot(
        <ReorderableContainer engine="fallback" onReorder={onReorder}>
          {item('blue', {
            accessibilityActions: [
              { name: 'reorder-move-later', label: 'App move' },
            ],
            onAccessibilityAction: onAppAction,
          })}
          {item('green')}
        </ReorderableContainer>
      )
    );
    const blue = rendered.getByLabelText('blue');
    expect(blue.props.accessibilityActions).toEqual([
      { name: 'reorder-move-later', label: 'App move' },
      { name: 'reorder-move-later.1', label: 'Move later' },
    ]);

    await fireEvent(blue, 'accessibilityAction', {
      nativeEvent: { actionName: 'reorder-move-later' },
    });
    expect(onAppAction).toHaveBeenCalledTimes(1);
    expect(onReorder).not.toHaveBeenCalled();

    await fireEvent(blue, 'accessibilityAction', {
      nativeEvent: { actionName: 'reorder-move-later.1' },
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
  });

  it('exposes Android collection and section coordinates from owned order', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    try {
      const rendered = await render(
        gestureRoot(
          <ReorderableContainer engine="fallback" onReorder={jest.fn()}>
            <ReorderableSection id="empty">{null}</ReorderableSection>
            <ReorderableSection id="favorites">
              {item('blue')}
              {item('green')}
            </ReorderableSection>
            <ReorderableSection id="others">{item('pink')}</ReorderableSection>
          </ReorderableContainer>
        )
      );

      expect(
        rendered.getByLabelText('green').props.accessibilityCollectionItem
      ).toEqual({
        columnIndex: 1,
        columnSpan: 1,
        heading: false,
        itemIndex: 1,
        rowIndex: 1,
        rowSpan: 1,
      });
      expect(
        rendered.getByLabelText('pink').props.accessibilityCollectionItem
      ).toEqual({
        columnIndex: 2,
        columnSpan: 1,
        heading: false,
        itemIndex: 0,
        rowIndex: 0,
        rowSpan: 1,
      });
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalOS,
      });
    }
  });

  it('commits a selected move through the real React Native semantic action path', async () => {
    const onReorder = jest.fn<(event: ReorderEvent) => void>();
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const focus = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => {});
    const rendered = await render(
      gestureRoot(
        <ReorderableContainer
          engine="fallback"
          onReorder={onReorder}
          selectedIds={['blue', 'pink']}
        >
          <ReorderableSection id="empty-before">{null}</ReorderableSection>
          <ReorderableSection id="one">
            {item('blue')}
            {item('green')}
          </ReorderableSection>
          <ReorderableSection id="empty-middle">{null}</ReorderableSection>
          <ReorderableSection id="two">{item('pink')}</ReorderableSection>
        </ReorderableContainer>
      )
    );

    await fireEvent(rendered.getByLabelText('pink'), 'accessibilityAction', {
      nativeEvent: { actionName: 'reorder-move-earlier' },
    });

    expect(onReorder).toHaveBeenCalledWith({
      sourceIds: ['blue', 'pink'],
      destination: { sectionId: 'empty-before', beforeId: null },
      nextOrder: [
        { sectionId: 'empty-before', itemIds: ['blue', 'pink'] },
        { sectionId: 'one', itemIds: ['green'] },
        { sectionId: 'empty-middle', itemIds: [] },
        { sectionId: 'two', itemIds: [] },
      ],
    });
    expect(announce).toHaveBeenCalledWith('Moved 2 items to position 1 of 2.');
    await waitFor(() => expect(focus).toHaveBeenCalled());
    announce.mockRestore();
    focus.mockRestore();
  });

  it('gives the native engine the same semantic outcome and callback', async () => {
    await withNativePlatform(async () => {
      const onReorder = jest.fn<(event: ReorderEvent) => void>();
      const announce = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => {});
      const rendered = await render(
        <ReorderableContainer engine="auto" onReorder={onReorder}>
          {item('blue')}
          {item('green')}
          {item('yellow')}
        </ReorderableContainer>
      );

      await fireEvent(rendered.getByLabelText('green'), 'accessibilityAction', {
        nativeEvent: { actionName: 'reorder-move-earlier' },
      });

      expect(onReorder).toHaveBeenCalledWith({
        sourceIds: ['green'],
        destination: { sectionId: null, beforeId: 'blue' },
        nextOrder: [{ sectionId: null, itemIds: ['green', 'blue', 'yellow'] }],
      });
      expect(announce).toHaveBeenCalledWith('Moved item to position 1 of 3.');
      announce.mockRestore();
    });
  });

  it('atomically rejects a stale action and announces unavailability', async () => {
    const onReorder = jest.fn<(event: ReorderEvent) => void>();
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const rendered = await render(
      gestureRoot(
        <ReorderableContainer engine="fallback" onReorder={onReorder}>
          {item('blue')}
          {item('green')}
        </ReorderableContainer>
      )
    );
    const staleHandler =
      rendered.getByLabelText('green').props.onAccessibilityAction;

    await rendered.rerender(
      gestureRoot(
        <ReorderableContainer engine="fallback" onReorder={onReorder}>
          {item('green')}
        </ReorderableContainer>
      )
    );
    staleHandler({
      nativeEvent: { actionName: 'reorder-move-earlier' },
    });

    expect(onReorder).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith(
      'This action is no longer available.'
    );
    announce.mockRestore();
  });

  it('rejects stale action snapshots even when every referenced id still exists', async () => {
    const onReorder = jest.fn<(event: ReorderEvent) => void>();
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const rendered = await render(
      gestureRoot(
        <ReorderableContainer engine="fallback" onReorder={onReorder}>
          {item('blue')}
          {item('green')}
          {item('yellow')}
        </ReorderableContainer>
      )
    );
    const staleHandler =
      rendered.getByLabelText('green').props.onAccessibilityAction;

    await rendered.rerender(
      gestureRoot(
        <ReorderableContainer engine="fallback" onReorder={onReorder}>
          {item('blue')}
          {item('yellow')}
          {item('green')}
        </ReorderableContainer>
      )
    );
    staleHandler({
      nativeEvent: { actionName: 'reorder-move-earlier' },
    });

    expect(onReorder).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith(
      'This action is no longer available.'
    );
    announce.mockRestore();
  });

  it('rejects a queued action after reorder is disabled', async () => {
    const onReorder = jest.fn<(event: ReorderEvent) => void>();
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const rendered = await render(
      gestureRoot(
        <ReorderableContainer engine="fallback" onReorder={onReorder}>
          {item('blue')}
          {item('green')}
        </ReorderableContainer>
      )
    );
    const queuedHandler =
      rendered.getByLabelText('green').props.onAccessibilityAction;
    await rendered.rerender(
      gestureRoot(
        <ReorderableContainer
          enabled={false}
          engine="fallback"
          onReorder={onReorder}
        >
          {item('blue')}
          {item('green')}
        </ReorderableContainer>
      )
    );

    queuedHandler({
      nativeEvent: { actionName: 'reorder-move-earlier' },
    });
    expect(onReorder).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith(
      'This action is no longer available.'
    );
    announce.mockRestore();
  });

  it('announces correction when the application rejects the proposed order', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const rendered = await render(
      gestureRoot(
        <ReorderableContainer engine="fallback" onReorder={jest.fn()}>
          {item('blue')}
          {item('green')}
        </ReorderableContainer>
      )
    );

    await fireEvent(rendered.getByLabelText('green'), 'accessibilityAction', {
      nativeEvent: { actionName: 'reorder-move-earlier' },
    });
    await rendered.rerender(
      gestureRoot(
        <ReorderableContainer engine="fallback" onReorder={jest.fn()}>
          {item('blue')}
          {item('green')}
        </ReorderableContainer>
      )
    );

    await waitFor(() =>
      expect(announce).toHaveBeenLastCalledWith('Order updated.')
    );
    announce.mockRestore();
  });

  it('announces when application-owned order corrects a committed outcome', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const onReorder = jest.fn<(event: ReorderEvent) => void>();
    const rendered = await render(
      gestureRoot(
        <ReorderableContainer engine="fallback" onReorder={onReorder}>
          {item('blue')}
          {item('green')}
          {item('yellow')}
        </ReorderableContainer>
      )
    );
    await fireEvent(rendered.getByLabelText('green'), 'accessibilityAction', {
      nativeEvent: { actionName: 'reorder-move-earlier' },
    });
    await rendered.rerender(
      gestureRoot(
        <ReorderableContainer engine="fallback" onReorder={onReorder}>
          {item('yellow')}
          {item('green')}
          {item('blue')}
        </ReorderableContainer>
      )
    );

    await waitFor(() =>
      expect(announce).toHaveBeenLastCalledWith('Order updated.')
    );
    announce.mockRestore();
  });
});
