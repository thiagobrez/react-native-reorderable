import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { Platform, View } from 'react-native';

import { NativeCommitAcceptanceContainer } from '../issue25-acceptance';
import { Commands } from '../ReorderableViewNativeComponent';
import { ReorderableItem } from '../primitives';
import type { ReorderEvent } from '../types';

describe('issue 25 native acceptance harness', () => {
  it('emits one reconciled callback after the native adapter returns a terminal outcome', async () => {
    const originalOS = Platform.OS;
    const originalVersion = Platform.Version;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 27,
    });
    const onReorder = jest.fn<(event: ReorderEvent) => void>();
    let rendered: Awaited<ReturnType<typeof render>> | undefined;
    const acceptanceMove = jest
      .spyOn(Commands, 'debugEmitTerminalReorder')
      .mockImplementation(() => {
        if (rendered == null)
          throw new Error('Acceptance view is not mounted.');
        fireEvent(rendered.getByTestId('reorderable'), 'move', {
          nativeEvent: {
            sourceIdsJson: '["yellow"]',
            destinationCollectionId: '',
            destinationBeforeId: 'green',
          },
        });
      });

    try {
      rendered = await render(
        <NativeCommitAcceptanceContainer
          acceptanceMove={{
            sourceIds: ['yellow'],
            destination: { sectionId: null, beforeId: 'green' },
          }}
          onReorder={onReorder}
          testID="reorderable"
        >
          <ReorderableItem id="blue">
            <View />
          </ReorderableItem>
          <ReorderableItem id="green">
            <View />
          </ReorderableItem>
          <ReorderableItem id="yellow">
            <View />
          </ReorderableItem>
        </NativeCommitAcceptanceContainer>
      );

      fireEvent.press(
        rendered.getByRole('button', { name: 'Apply native reorder' })
      );

      expect(onReorder).toHaveBeenCalledTimes(1);
      expect(onReorder).toHaveBeenCalledWith({
        sourceIds: ['yellow'],
        destination: { sectionId: null, beforeId: 'green' },
        nextOrder: [{ sectionId: null, itemIds: ['blue', 'yellow', 'green'] }],
      });
    } finally {
      acceptanceMove.mockRestore();
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
