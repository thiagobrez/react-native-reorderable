import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DragDropContainer, DraggableItem, DropZone, type DropEvent } from '..';

type Engine = 'fallback' | 'native';
const itemIds = ['blue', 'green', 'yellow', 'pink'] as const;

async function withEngine(
  engine: Engine,
  run: () => Promise<void>
): Promise<void> {
  if (engine === 'fallback') return run();
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  Object.defineProperty(Platform, 'Version', {
    configurable: true,
    value: 27,
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

function scenario({
  canAccept,
  canReject = () => false,
  engine,
  includeAccepting = true,
  onDrop,
  selectedIds,
}: {
  canAccept: (ids: readonly string[]) => boolean;
  canReject?: (ids: readonly string[]) => boolean;
  engine: Engine;
  includeAccepting?: boolean;
  onDrop: (event: DropEvent) => void;
  selectedIds: readonly string[];
}) {
  const container = (
    <DragDropContainer
      engine={engine === 'native' ? 'auto' : 'fallback'}
      onDrop={onDrop}
      selectedIds={selectedIds}
    >
      <View>
        {itemIds.map((id) => (
          <DraggableItem id={id} key={id}>
            <Text>{id}</Text>
          </DraggableItem>
        ))}
      </View>
      {includeAccepting ? (
        <DropZone
          accessibilityActions={[{ name: 'archive', label: 'Archive' }]}
          accessibilityLabel="Accepting zone"
          canDrop={canAccept}
          id="accepting"
        >
          <Text>Accepting</Text>
        </DropZone>
      ) : null}
      <DropZone
        accessibilityLabel="Rejecting zone"
        canDrop={canReject}
        id="rejecting"
      >
        <Text>Rejecting</Text>
      </DropZone>
    </DragDropContainer>
  );
  return engine === 'fallback' ? (
    <GestureHandlerRootView>{container}</GestureHandlerRootView>
  ) : (
    container
  );
}

describe('issue 32 portable accessible drop', () => {
  it.each<Engine>(['fallback', 'native'])(
    '%s exposes and commits one canonical multi-item drop through a semantic action',
    async (engine) =>
      withEngine(engine, async () => {
        const onDrop = jest.fn<(event: DropEvent) => void>();
        const canAccept = jest.fn(() => true);
        const announce = jest
          .spyOn(AccessibilityInfo, 'announceForAccessibility')
          .mockImplementation(() => {});
        const focus = jest
          .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
          .mockImplementation(() => {});
        const rendered = await render(
          scenario({
            canAccept,
            engine,
            onDrop,
            selectedIds: ['pink', 'missing', 'blue', 'pink', 'yellow'],
          })
        );
        const zone = rendered.getByLabelText('Accepting zone');

        expect(zone.props.accessibilityActions).toEqual([
          { name: 'archive', label: 'Archive' },
          {
            name: 'drag-drop-drop-selected',
            label: 'Drop selected items here',
          },
        ]);
        expect(
          rendered.getByLabelText('Rejecting zone').props.accessibilityActions
        ).toEqual([]);
        expect(canAccept).toHaveBeenLastCalledWith(['blue', 'yellow', 'pink']);

        await fireEvent(zone, 'accessibilityAction', {
          nativeEvent: { actionName: 'drag-drop-drop-selected' },
        });

        expect(onDrop).toHaveBeenCalledTimes(1);
        expect(onDrop).toHaveBeenCalledWith({
          itemIds: ['blue', 'yellow', 'pink'],
          destinationId: 'accepting',
        });
        expect(announce).toHaveBeenCalledWith('Dropped 3 items.');
        await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
        announce.mockRestore();
        focus.mockRestore();
      })
  );

  it.each([
    { engine: 'fallback' as const, selection: ['green'] },
    { engine: 'fallback' as const, selection: ['pink', 'blue'] },
    { engine: 'native' as const, selection: ['green'] },
    { engine: 'native' as const, selection: ['pink', 'blue'] },
  ])(
    '$engine gives $selection the same accepting/rejecting contract',
    async ({ engine, selection }) =>
      withEngine(engine, async () => {
        const onDrop = jest.fn<(event: DropEvent) => void>();
        const rendered = await render(
          scenario({
            canAccept: () => true,
            canReject: () => false,
            engine,
            onDrop,
            selectedIds: selection,
          })
        );
        await fireEvent(
          rendered.getByLabelText('Accepting zone'),
          'accessibilityAction',
          { nativeEvent: { actionName: 'drag-drop-drop-selected' } }
        );
        expect(onDrop).toHaveBeenCalledTimes(1);
        expect(onDrop.mock.calls[0]?.[0].itemIds).toEqual(
          selection.length === 1 ? ['green'] : ['blue', 'pink']
        );
        expect(
          rendered.getByLabelText('Rejecting zone').props.accessibilityActions
        ).toEqual([]);
      })
  );

  it.each<Engine>(['fallback', 'native'])(
    '%s reevaluates acceptance when invoked and settles rejection as unavailable',
    async (engine) =>
      withEngine(engine, async () => {
        let accepted = true;
        const canAccept = jest.fn(() => accepted);
        const onDrop = jest.fn<(event: DropEvent) => void>();
        const announce = jest
          .spyOn(AccessibilityInfo, 'announceForAccessibility')
          .mockImplementation(() => {});
        const rendered = await render(
          scenario({ canAccept, engine, onDrop, selectedIds: ['green'] })
        );
        const zone = rendered.getByLabelText('Accepting zone');
        accepted = false;

        await fireEvent(zone, 'accessibilityAction', {
          nativeEvent: { actionName: 'drag-drop-drop-selected' },
        });

        expect(canAccept).toHaveBeenCalledTimes(2);
        expect(onDrop).not.toHaveBeenCalled();
        expect(announce).toHaveBeenCalledWith(
          'This action is no longer available.'
        );
        announce.mockRestore();
      })
  );

  it('surfaces an invocation-time predicate error and emits no drop', async () => {
    const applicationError = new Error('accessible predicate failed');
    let shouldThrow = false;
    const onDrop = jest.fn<(event: DropEvent) => void>();
    const rendered = await render(
      scenario({
        canAccept: () => {
          if (shouldThrow) throw applicationError;
          return true;
        },
        engine: 'fallback',
        onDrop,
        selectedIds: ['blue'],
      })
    );
    shouldThrow = true;

    await expect(
      fireEvent(
        rendered.getByLabelText('Accepting zone'),
        'accessibilityAction',
        { nativeEvent: { actionName: 'drag-drop-drop-selected' } }
      )
    ).rejects.toBe(applicationError);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('surfaces an availability predicate error and renders no false action', async () => {
    const applicationError = new Error('availability predicate failed');
    await expect(
      render(
        scenario({
          canAccept: () => {
            throw applicationError;
          },
          engine: 'fallback',
          onDrop: jest.fn(),
          selectedIds: ['blue'],
        })
      )
    ).rejects.toBe(applicationError);
  });

  it('removes stale selection and disappearing-zone actions without a callback', async () => {
    const onDrop = jest.fn<(event: DropEvent) => void>();
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const rendered = await render(
      scenario({
        canAccept: () => true,
        engine: 'fallback',
        onDrop,
        selectedIds: ['blue'],
      })
    );
    await rendered.rerender(
      scenario({
        canAccept: () => true,
        engine: 'fallback',
        onDrop,
        selectedIds: ['missing'],
      })
    );
    expect(
      rendered.getByLabelText('Accepting zone').props.accessibilityActions
    ).toEqual([{ name: 'archive', label: 'Archive' }]);
    await rendered.rerender(
      scenario({
        canAccept: () => true,
        engine: 'fallback',
        includeAccepting: false,
        onDrop,
        selectedIds: ['blue'],
      })
    );
    expect(rendered.queryByLabelText('Accepting zone')).toBeNull();
    expect(onDrop).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    announce.mockRestore();
  });

  it('composes colliding app actions and localized drop semantics', async () => {
    const onAppAction = jest.fn();
    const onDrop = jest.fn<(event: DropEvent) => void>();
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const rendered = await render(
      <GestureHandlerRootView>
        <DragDropContainer
          accessibilityStrings={{
            dropAnnouncement: () => 'Itens entregues.',
            dropSelectedItemsAction: 'Entregar itens aqui',
          }}
          engine="fallback"
          onDrop={onDrop}
          selectedIds={['blue']}
        >
          <DraggableItem id="blue">
            <Text>Blue</Text>
          </DraggableItem>
          <DropZone
            accessibilityActions={[
              { name: 'drag-drop-drop-selected', label: 'App drop' },
            ]}
            accessibilityLabel="Localized zone"
            id="localized"
            onAccessibilityAction={onAppAction}
          >
            <Text>Localized</Text>
          </DropZone>
        </DragDropContainer>
      </GestureHandlerRootView>
    );
    const zone = rendered.getByLabelText('Localized zone');
    expect(zone.props.accessibilityActions).toEqual([
      { name: 'drag-drop-drop-selected', label: 'App drop' },
      {
        name: 'drag-drop-drop-selected.1',
        label: 'Entregar itens aqui',
      },
    ]);

    await fireEvent(zone, 'accessibilityAction', {
      nativeEvent: { actionName: 'drag-drop-drop-selected' },
    });
    expect(onAppAction).toHaveBeenCalledTimes(1);
    expect(onDrop).not.toHaveBeenCalled();
    await fireEvent(zone, 'accessibilityAction', {
      nativeEvent: { actionName: 'drag-drop-drop-selected.1' },
    });
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Itens entregues.');
    announce.mockRestore();
  });

  it('does not expose a drop action for disabled or wholly unknown selection', async () => {
    const rendered = await render(
      <GestureHandlerRootView>
        <DragDropContainer
          enabled={false}
          engine="fallback"
          onDrop={jest.fn()}
          selectedIds={['blue']}
        >
          <DraggableItem id="blue">
            <Text>Blue</Text>
          </DraggableItem>
          <DropZone accessibilityLabel="Disabled zone" id="disabled">
            <Text>Disabled</Text>
          </DropZone>
        </DragDropContainer>
      </GestureHandlerRootView>
    );
    expect(
      rendered.getByLabelText('Disabled zone').props.accessibilityActions
    ).toBeUndefined();

    await rendered.rerender(
      scenario({
        canAccept: () => true,
        engine: 'fallback',
        onDrop: jest.fn(),
        selectedIds: ['missing'],
      })
    );
    expect(
      rendered.getByLabelText('Accepting zone').props.accessibilityActions
    ).toEqual([{ name: 'archive', label: 'Archive' }]);
  });

  it('refreshes action availability from application rerenders', async () => {
    const rendered = await render(
      scenario({
        canAccept: () => true,
        engine: 'fallback',
        onDrop: jest.fn(),
        selectedIds: ['blue'],
      })
    );
    expect(
      rendered.getByLabelText('Accepting zone').props.accessibilityActions
    ).toHaveLength(2);

    await rendered.rerender(
      scenario({
        canAccept: () => false,
        engine: 'fallback',
        onDrop: jest.fn(),
        selectedIds: ['blue'],
      })
    );
    expect(
      rendered.getByLabelText('Accepting zone').props.accessibilityActions
    ).toEqual([{ name: 'archive', label: 'Archive' }]);
  });
});
