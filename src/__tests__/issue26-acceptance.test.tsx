import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import { ReorderableContainer, ReorderableItem, type ReorderEvent } from '..';
import {
  activePreviewTranslation,
  destinationFeedbackPosition,
} from '../fallback';
import { FallbackCommitAcceptanceContainer } from '../issue26-acceptance';

async function withPlatform(
  os: typeof Platform.OS,
  version: typeof Platform.Version,
  run: () => Promise<void>
): Promise<void> {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  Object.defineProperty(Platform, 'Version', {
    configurable: true,
    value: version,
  });
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

function cards(onReorder: (event: ReorderEvent) => void, engine?: 'fallback') {
  return (
    <GestureHandlerRootView>
      <ReorderableContainer
        engine={engine}
        onReorder={onReorder}
        testID="fallback-container"
      >
        <ReorderableItem id="blue">
          <Text>Blue</Text>
        </ReorderableItem>
        <ReorderableItem id="green">
          <Text>Green</Text>
        </ReorderableItem>
        <ReorderableItem id="yellow">
          <Text>Yellow</Text>
        </ReorderableItem>
      </ReorderableContainer>
    </GestureHandlerRootView>
  );
}

describe('issue 26 fallback engine contract', () => {
  it('aligns the Android preview center with the live insertion position', () => {
    expect(
      activePreviewTranslation('android', { height: 100, y: 20 }, 300, 140)
    ).toBe(230);
    expect(
      activePreviewTranslation('android', { height: 52, y: 20 }, 300, 140)
    ).toBe(254);
    expect(
      activePreviewTranslation('ios', { height: 100, y: 20 }, 300, 140)
    ).toBe(128);
    expect(destinationFeedbackPosition('android', 300)).toBe(312);
    expect(destinationFeedbackPosition('ios', 300)).toBe(300);
  });

  it('renders forced fallback on capable iOS and auto fallback on Android', async () => {
    await withPlatform('ios', 27, async () => {
      const rendered = await render(cards(() => undefined, 'fallback'));
      expect(rendered.getByText('Blue')).toBeOnTheScreen();
      await rendered.unmount();
    });

    await withPlatform('android', 35, async () => {
      const rendered = await render(cards(() => undefined));
      expect(rendered.getByText('Blue')).toBeOnTheScreen();
      await rendered.unmount();
    });

    await withPlatform('ios', 26, async () => {
      const rendered = await render(cards(() => undefined));
      expect(
        rendered.getByTestId('fallback-destination-feedback')
      ).toBeOnTheScreen();
      await rendered.unmount();
    });
  });

  it('emits one canonical callback for a valid fallback terminal result', async () => {
    const onReorder = jest.fn<(event: ReorderEvent) => void>();
    const rendered = await render(cards(onReorder, 'fallback'));

    await fireEvent(
      rendered.getByTestId('fallback-container'),
      'fallbackMove',
      {
        nativeEvent: {
          sourceIdsJson: '["yellow"]',
          destinationCollectionId: '',
          destinationBeforeId: 'green',
        },
      }
    );

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith({
      sourceIds: ['yellow'],
      destination: { sectionId: null, beforeId: 'green' },
      nextOrder: [{ sectionId: null, itemIds: ['blue', 'yellow', 'green'] }],
    });
  });

  it('emits no callback for invalid or outside fallback terminal results', async () => {
    const onReorder = jest.fn<(event: ReorderEvent) => void>();
    const rendered = await render(cards(onReorder, 'fallback'));
    const container = rendered.getByTestId('fallback-container');

    await fireEvent(container, 'fallbackMove', {
      nativeEvent: {
        sourceIdsJson: '["missing"]',
        destinationCollectionId: '',
        destinationBeforeId: 'green',
      },
    });
    await fireEvent(container, 'fallbackMove', {
      nativeEvent: {
        sourceIdsJson: '["yellow"]',
        destinationCollectionId: '',
        destinationBeforeId: 'outside',
      },
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('renders destination feedback as part of the fallback presentation', async () => {
    const rendered = await render(cards(() => undefined, 'fallback'));
    expect(
      rendered.getByTestId('fallback-destination-feedback')
    ).toBeOnTheScreen();
  });

  it('drives UI-runtime presentation and emits exactly one valid terminal result', async () => {
    const onReorder = jest.fn<(event: ReorderEvent) => void>();
    const acceptanceTree = () => (
      <GestureHandlerRootView>
        <FallbackCommitAcceptanceContainer
          acceptanceMove={{
            sourceIds: ['yellow'],
            destination: { sectionId: null, beforeId: 'green' },
          }}
          onReorder={onReorder}
        >
          <ReorderableItem id="blue">
            <Text>Blue</Text>
          </ReorderableItem>
          <ReorderableItem id="green">
            <Text>Green</Text>
          </ReorderableItem>
          <ReorderableItem id="yellow">
            <Text>Yellow</Text>
          </ReorderableItem>
        </FallbackCommitAcceptanceContainer>
      </GestureHandlerRootView>
    );
    const rendered = await render(acceptanceTree());

    await fireEvent.press(
      rendered.getByRole('button', { name: 'Activate fallback reorder' })
    );
    await rendered.rerender(acceptanceTree());
    expect(
      rendered.getByTestId('fallback-destination-feedback').props.style[1]
    ).toEqual({ opacity: 1, top: 210 });

    await fireEvent.press(
      rendered.getByRole('button', { name: 'Move fallback destination' })
    );
    await rendered.rerender(acceptanceTree());
    expect(
      rendered.getByTestId('fallback-destination-feedback').props.style[1]
    ).toEqual({ opacity: 1, top: 138 });

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

  it.each(['Cancel fallback reorder', 'Release fallback outside'])(
    '%s produces no reorder callback',
    async (terminalAction) => {
      const onReorder = jest.fn<(event: ReorderEvent) => void>();
      const rendered = await render(
        <GestureHandlerRootView>
          <FallbackCommitAcceptanceContainer
            acceptanceMove={{
              sourceIds: ['yellow'],
              destination: { sectionId: null, beforeId: 'green' },
            }}
            onReorder={onReorder}
          >
            <ReorderableItem id="blue">
              <Text>Blue</Text>
            </ReorderableItem>
            <ReorderableItem id="green">
              <Text>Green</Text>
            </ReorderableItem>
            <ReorderableItem id="yellow">
              <Text>Yellow</Text>
            </ReorderableItem>
          </FallbackCommitAcceptanceContainer>
        </GestureHandlerRootView>
      );

      await fireEvent.press(
        rendered.getByRole('button', { name: 'Activate fallback reorder' })
      );
      await fireEvent.press(
        rendered.getByRole('button', { name: 'Move fallback destination' })
      );
      await fireEvent.press(
        rendered.getByRole('button', { name: terminalAction })
      );

      expect(onReorder).not.toHaveBeenCalled();
    }
  );

  it('commits once through the real pan gesture terminal path', async () => {
    const onReorder = jest.fn<(event: ReorderEvent) => void>();
    const rendered = await render(
      <GestureHandlerRootView>
        <FallbackCommitAcceptanceContainer
          acceptanceMove={{
            sourceIds: ['yellow'],
            destination: { sectionId: null, beforeId: 'green' },
          }}
          onReorder={onReorder}
        >
          <ReorderableItem id="blue">
            <Text>Blue</Text>
          </ReorderableItem>
          <ReorderableItem id="green">
            <Text>Green</Text>
          </ReorderableItem>
          <ReorderableItem id="yellow">
            <Text>Yellow</Text>
          </ReorderableItem>
        </FallbackCommitAcceptanceContainer>
      </GestureHandlerRootView>
    );

    // Prime deterministic geometry through the private acceptance surface,
    // then activate, update, and finalize through RNGH itself.
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Activate fallback reorder' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Cancel fallback reorder' })
    );
    await act(async () => {
      fireGestureHandler(getByGestureTestId('fallback-item-yellow'), [
        { state: State.BEGAN, absoluteX: 0, absoluteY: 0, translationY: 0 },
        { state: State.ACTIVE, absoluteX: 0, absoluteY: 0, translationY: 0 },
        { state: State.ACTIVE, absoluteX: 0, absoluteY: 0, translationY: -100 },
        { state: State.END, absoluteX: 0, absoluteY: 0, translationY: -100 },
      ]);
    });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith({
      sourceIds: ['yellow'],
      destination: { sectionId: null, beforeId: 'green' },
      nextOrder: [{ sectionId: null, itemIds: ['blue', 'yellow', 'green'] }],
    });
  });

  it('keeps a center-only predecessor preview visibly inside the destination band', async () => {
    const view = () => (
      <GestureHandlerRootView>
        <ReorderableContainer engine="fallback" onReorder={() => undefined}>
          {['blue', 'green', 'yellow', 'orange'].map((id) => (
            <ReorderableItem id={id} key={id}>
              <Text>{id}</Text>
            </ReorderableItem>
          ))}
        </ReorderableContainer>
      </GestureHandlerRootView>
    );
    const rendered = await render(view());
    const handler = getByGestureTestId('fallback-item-blue') as unknown as {
      handlers: {
        onStart?: () => void;
        onUpdate?: (event: { translationY: number }) => void;
      };
    };

    await act(async () => {
      handler.handlers.onStart?.();
      handler.handlers.onUpdate?.({ translationY: 100 });
    });
    await rendered.rerender(view());

    expect(rendered.getAllByText('blue')).toHaveLength(1);
    expect(
      StyleSheet.flatten(
        rendered.getByTestId('fallback-wrapper-blue').props.style
      )
    ).toMatchObject({
      borderWidth: 3,
      transform: [{ translateY: 88 }, { scale: 1.03 }],
    });
  });

  it('preserves interaction when movement wins before long-press activation', async () => {
    const onPress = jest.fn();
    const onReorder = jest.fn<(event: ReorderEvent) => void>();
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableContainer engine="fallback" onReorder={onReorder}>
          <ReorderableItem id="blue">
            <Pressable onPress={onPress} testID="nested-action">
              <Text>Blue</Text>
            </Pressable>
          </ReorderableItem>
        </ReorderableContainer>
      </GestureHandlerRootView>
    );

    await act(async () => {
      fireGestureHandler(getByGestureTestId('fallback-item-blue'), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.FAILED, translationY: 20 },
      ]);
    });
    await fireEvent.press(rendered.getByTestId('nested-action'));

    expect(onReorder).not.toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('preserves nested short presses inside a fallback item', async () => {
    const onPress = jest.fn();
    const rendered = await render(
      <GestureHandlerRootView>
        <ReorderableContainer engine="fallback" onReorder={() => undefined}>
          <ReorderableItem id="blue">
            <Pressable onPress={onPress} testID="nested-action">
              <Text>Blue</Text>
            </Pressable>
          </ReorderableItem>
        </ReorderableContainer>
      </GestureHandlerRootView>
    );

    await fireEvent.press(rendered.getByTestId('nested-action'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
