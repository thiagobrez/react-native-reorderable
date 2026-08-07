import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { AppState, BackHandler, Keyboard, Platform, Text } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import { ReorderableItem, type ReorderEvent } from '..';
import { FallbackCommitAcceptanceContainer } from '../issue26-acceptance';

const initialOrder = ['blue', 'green', 'yellow'] as const;

function LifecycleScenario({
  enabled = true,
  onReorderObserved,
}: {
  enabled?: boolean;
  onReorderObserved?: () => void;
}) {
  const [order, setOrder] = useState<readonly string[]>(initialOrder);
  const [callbackCount, setCallbackCount] = useState(0);
  const handleReorder = (event: ReorderEvent) => {
    onReorderObserved?.();
    setOrder(event.nextOrder[0]?.itemIds ?? order);
    setCallbackCount((count) => count + 1);
  };
  return (
    <GestureHandlerRootView>
      <Text testID="visible-order">Order: {order.join(', ')}</Text>
      <Text testID="callback-count">Reorder callbacks: {callbackCount}</Text>
      <FallbackCommitAcceptanceContainer
        acceptanceMove={{
          sourceIds: ['yellow'],
          destination: { sectionId: null, beforeId: 'green' },
        }}
        enabled={enabled}
        onReorder={handleReorder}
      >
        {order.map((id) => (
          <ReorderableItem id={id} key={id}>
            <Text>{id}</Text>
          </ReorderableItem>
        ))}
      </FallbackCommitAcceptanceContainer>
    </GestureHandlerRootView>
  );
}

type Rendered = Awaited<ReturnType<typeof render>>;

function expectCancelled(rendered: Rendered) {
  expect(rendered.getByTestId('visible-order')).toHaveTextContent(
    'Order: blue, green, yellow'
  );
  expect(rendered.getByTestId('callback-count')).toHaveTextContent(
    'Reorder callbacks: 0'
  );
}

async function activate(rendered: Rendered) {
  await fireEvent.press(
    rendered.getByRole('button', { name: 'Activate fallback reorder' })
  );
  await fireEvent.press(
    rendered.getByRole('button', { name: 'Move fallback destination' })
  );
}

describe('issue 28 visible fallback lifecycle contract', () => {
  it('gesture interruption cancels and leaves controlled order unchanged', async () => {
    const rendered = await render(<LifecycleScenario />);
    await act(async () => {
      fireGestureHandler(getByGestureTestId('fallback-item-yellow'), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: -80 },
        { state: State.CANCELLED, translationY: -80 },
      ]);
    });
    expectCancelled(rendered);
  });

  it.each([
    ['ios', 'change', 'inactive'],
    ['ios', 'change', 'background'],
    ['android', 'change', 'background'],
    ['android', 'blur', undefined],
  ] as Array<
    [
      'ios' | 'android',
      'change' | 'blur',
      'inactive' | 'background' | undefined,
    ]
  >)('%s %s %s cancels before commit', async (os, eventName, state) => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    const listeners = new Map<string, (...args: never[]) => void>();
    const addListener = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((event, listener) => {
        listeners.set(event, listener as (...args: never[]) => void);
        return { remove: jest.fn() };
      });
    try {
      const rendered = await render(<LifecycleScenario />);
      await activate(rendered);
      await act(async () => {
        listeners.get(eventName)?.(state as never);
      });
      expectCancelled(rendered);
      await rendered.unmount();
    } finally {
      addListener.mockRestore();
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalOS,
      });
    }
  });

  it('first Android Back cancels and is consumed only while active', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    let backHandler: (() => boolean | null | undefined) | undefined;
    const backListener = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, listener) => {
        backHandler = listener;
        return { remove: jest.fn() };
      });
    try {
      const rendered = await render(<LifecycleScenario />);
      expect(backHandler?.()).toBe(false);
      await activate(rendered);
      expect(backHandler?.()).toBe(true);
      expect(backHandler?.()).toBe(false);
      expectCancelled(rendered);
      await rendered.unmount();
    } finally {
      backListener.mockRestore();
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalOS,
      });
    }
  });

  it('disabled container cancels and cleans up before commit', async () => {
    const rendered = await render(<LifecycleScenario />);
    await activate(rendered);
    await rendered.rerender(<LifecycleScenario enabled={false} />);
    expectCancelled(rendered);
  });

  it('lifecycle inputs after an accepted commit cannot undo it', async () => {
    const rendered = await render(<LifecycleScenario />);
    await activate(rendered);
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Commit fallback reorder' })
    );
    await rendered.rerender(<LifecycleScenario enabled={false} />);

    expect(rendered.getByTestId('visible-order')).toHaveTextContent(
      'Order: blue, yellow, green'
    );
    expect(rendered.getByTestId('callback-count')).toHaveTextContent(
      'Reorder callbacks: 1'
    );
  });

  it('unmount cleanup emits no public callback', async () => {
    const onReorderObserved = jest.fn();
    const rendered = await render(
      <LifecycleScenario onReorderObserved={onReorderObserved} />
    );
    await activate(rendered);
    await rendered.unmount();
    await act(async () => undefined);

    expect(onReorderObserved).not.toHaveBeenCalled();
  });

  it('does not install keyboard handling or expose cancellation API', async () => {
    const keyboardListener = jest.spyOn(Keyboard, 'addListener');
    try {
      await render(<LifecycleScenario />);
      expect(keyboardListener).not.toHaveBeenCalled();
      expect(Object.keys(await import('..')).sort()).toEqual([
        'DragDropContainer',
        'DraggableItem',
        'DropZone',
        'ReorderableContainer',
        'ReorderableItem',
        'ReorderableSection',
      ]);
    } finally {
      keyboardListener.mockRestore();
    }
  });
});
