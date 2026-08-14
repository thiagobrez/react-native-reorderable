import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import * as publicApi from '../index';
import {
  NativeCommitAcceptanceContainer,
  ReorderableItem,
} from '../primitives';
import type { ReorderEvent } from '../types';

async function withIOS27(run: () => Promise<void>) {
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

const children = ['a', 'b', 'c', 'd'].map((id) => (
  <ReorderableItem id={id} key={id}>
    <Text>{id}</Text>
  </ReorderableItem>
));

describe('issue 39 selected reorder engine policy', () => {
  it('routes an app-owned reorder selection through fallback atomically', async () => {
    await withIOS27(async () => {
      const onReorder = jest.fn<(event: ReorderEvent) => void>();
      const rendered = await render(
        <GestureHandlerRootView>
          <NativeCommitAcceptanceContainer
            acceptanceMove={{
              sourceIds: ['b', 'd'],
              destination: { sectionId: null, beforeId: 'a' },
            }}
            onReorder={onReorder}
            selectedIds={['b', 'd']}
          >
            {children}
          </NativeCommitAcceptanceContainer>
        </GestureHandlerRootView>
      );

      expect(
        rendered.getByRole('button', { name: 'Activate fallback reorder' })
      ).toBeOnTheScreen();
      expect(
        rendered.queryByRole('button', { name: 'Apply native reorder' })
      ).not.toBeOnTheScreen();
      await fireEvent.press(
        rendered.getByRole('button', { name: 'Activate fallback reorder' })
      );
      await fireEvent.press(
        rendered.getByRole('button', { name: 'Move fallback destination' })
      );
      await fireEvent.press(
        rendered.getByRole('button', { name: 'Commit fallback reorder' })
      );
      expect(onReorder).toHaveBeenCalledWith({
        sourceIds: ['b', 'd'],
        destination: { sectionId: null, beforeId: 'a' },
        nextOrder: [{ sectionId: null, itemIds: ['b', 'd', 'a', 'c'] }],
      });
    });
  });

  it('keeps native reorder eligible when the app-owned selection is empty', async () => {
    await withIOS27(async () => {
      const rendered = await render(
        <NativeCommitAcceptanceContainer
          acceptanceMove={{
            sourceIds: ['b'],
            destination: { sectionId: null, beforeId: 'a' },
          }}
          onReorder={jest.fn()}
          selectedIds={[]}
        >
          {children}
        </NativeCommitAcceptanceContainer>
      );

      expect(
        rendered.getByRole('button', { name: 'Apply native reorder' })
      ).toBeOnTheScreen();
      expect(
        rendered.queryByRole('button', { name: 'Activate fallback reorder' })
      ).not.toBeOnTheScreen();
    });
  });

  it('does not expose engine selection policy publicly', () => {
    expect(publicApi).not.toHaveProperty('shouldUseFallbackReorderEngine');
  });
});
