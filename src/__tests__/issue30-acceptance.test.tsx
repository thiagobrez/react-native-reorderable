import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { Platform, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DraggableItem, DropZone, type DropEvent } from '..';
import {
  FallbackDropAcceptanceContainer,
  NativeDropAcceptanceContainer,
} from '../issue29-acceptance';
import { Commands } from '../ReorderableViewNativeComponent';

const items = [
  ['blue', 'Blue'],
  ['green', 'Green'],
  ['yellow', 'Yellow'],
  ['pink', 'Pink'],
] as const;

async function withNativeIOS(run: () => Promise<void>): Promise<void> {
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

type DropPredicate = (ids: readonly string[]) => boolean;

interface ScenarioChildrenOptions {
  canAccept: DropPredicate;
  canReject: DropPredicate;
  includeAccepting?: boolean;
}

function scenarioChildren({
  canAccept,
  canReject,
  includeAccepting = true,
}: ScenarioChildrenOptions) {
  return (
    <>
      <View>
        {items.map(([id, label]) => (
          <DraggableItem id={id} key={id}>
            <Text>{label}</Text>
          </DraggableItem>
        ))}
      </View>
      {includeAccepting ? (
        <DropZone id="accepting" canDrop={canAccept}>
          <Text>Accepting</Text>
        </DropZone>
      ) : null}
      <DropZone id="rejecting" canDrop={canReject}>
        <Text>Rejecting</Text>
      </DropZone>
    </>
  );
}

type ContractEngine = 'fallback' | 'native';

interface ContractScenarioOptions extends ScenarioChildrenOptions {
  activatedId: string;
  destinationId: string;
  selectedIds: readonly string[];
  onDrop: (event: DropEvent) => void;
}

type RenderedScenario = Awaited<ReturnType<typeof render>>;

interface ContractHarness {
  exercise(run: () => Promise<void>): Promise<void>;
  scenario(options: ContractScenarioOptions): React.JSX.Element;
  activate(
    rendered: RenderedScenario,
    itemIds: readonly string[]
  ): Promise<void>;
  commit(
    rendered: RenderedScenario,
    destinationId: string,
    itemIds: readonly string[]
  ): Promise<void>;
  expectNormalizedSelection(
    rendered: RenderedScenario,
    itemIds: readonly string[]
  ): void;
}

function fallbackScenario({
  activatedId,
  destinationId,
  selectedIds,
  onDrop,
  ...childrenOptions
}: ContractScenarioOptions) {
  const children = scenarioChildren(childrenOptions);
  const acceptanceMove = { sourceId: activatedId, destinationId } as const;
  return (
    <GestureHandlerRootView>
      <FallbackDropAcceptanceContainer
        acceptanceMove={acceptanceMove}
        onDrop={onDrop}
        selectedIds={selectedIds}
      >
        {children}
      </FallbackDropAcceptanceContainer>
    </GestureHandlerRootView>
  );
}

function nativeScenario({
  activatedId,
  destinationId,
  selectedIds,
  onDrop,
  ...childrenOptions
}: ContractScenarioOptions) {
  const children = scenarioChildren(childrenOptions);
  const acceptanceMove = { sourceId: activatedId, destinationId } as const;
  return (
    <NativeDropAcceptanceContainer
      acceptanceMove={acceptanceMove}
      onDrop={onDrop}
      selectedIds={selectedIds}
      testID="shared-native-drop"
    >
      {children}
    </NativeDropAcceptanceContainer>
  );
}

const contractHarnesses: Record<ContractEngine, ContractHarness> = {
  fallback: {
    exercise: async (run) => run(),
    scenario: fallbackScenario,
    activate: async (rendered) => {
      await fireEvent.press(
        rendered.getByRole('button', { name: 'Activate fallback drop' })
      );
    },
    commit: async (rendered) => {
      await fireEvent.press(
        rendered.getByRole('button', {
          name: 'Move fallback drop destination',
        })
      );
      await fireEvent.press(
        rendered.getByRole('button', { name: 'Commit fallback drop' })
      );
    },
    expectNormalizedSelection: () => undefined,
  },
  native: {
    exercise: withNativeIOS,
    scenario: nativeScenario,
    activate: async (rendered, itemIds) => {
      await fireEvent(
        rendered.getByTestId('shared-native-drop'),
        'dragActivate',
        { nativeEvent: { itemIdsJson: JSON.stringify(itemIds) } }
      );
    },
    commit: async (rendered, destinationId, itemIds) => {
      await fireEvent(rendered.getByTestId('shared-native-drop'), 'drop', {
        nativeEvent: {
          destinationId,
          itemIdsJson: JSON.stringify(itemIds),
        },
      });
    },
    expectNormalizedSelection: (rendered, itemIds) => {
      expect(
        rendered.getByTestId('shared-native-drop').props.selectedIds
      ).toEqual(itemIds);
    },
  },
};

describe('issue 30 selected drop move sets', () => {
  it.each<ContractEngine>(['fallback', 'native'])(
    '%s shares selected, unselected, accepting, and rejecting move-set semantics',
    async (engine) => {
      const harness = contractHarnesses[engine];
      await harness.exercise(async () => {
        const selectedIds = ['pink', 'missing', 'blue', 'pink', 'yellow'];
        const canonicalIds = ['blue', 'yellow', 'pink'];
        const accepted = jest.fn(() => true);
        const rejected = jest.fn(() => false);
        const onDrop = jest.fn<(event: DropEvent) => void>();
        const selected = await render(
          harness.scenario({
            activatedId: 'pink',
            destinationId: 'accepting',
            selectedIds,
            onDrop,
            canAccept: accepted,
            canReject: rejected,
          })
        );
        harness.expectNormalizedSelection(selected, canonicalIds);
        await harness.activate(selected, canonicalIds);
        expect(accepted).toHaveBeenCalledTimes(1);
        expect(rejected).toHaveBeenCalledTimes(1);
        expect(accepted).toHaveBeenCalledWith(canonicalIds);
        expect(rejected).toHaveBeenCalledWith(canonicalIds);
        await harness.commit(selected, 'accepting', canonicalIds);
        await harness.commit(selected, 'accepting', canonicalIds);
        expect(onDrop).toHaveBeenCalledTimes(1);
        expect(onDrop).toHaveBeenCalledWith({
          itemIds: canonicalIds,
          destinationId: 'accepting',
        });

        const unselectedDrop = jest.fn<(event: DropEvent) => void>();
        const unselected = await render(
          harness.scenario({
            activatedId: 'green',
            destinationId: 'accepting',
            selectedIds: ['blue', 'pink'],
            onDrop: unselectedDrop,
            canAccept: () => true,
            canReject: () => false,
          })
        );
        await harness.activate(unselected, ['green']);
        await harness.commit(unselected, 'accepting', ['green']);
        expect(unselectedDrop).toHaveBeenCalledWith({
          itemIds: ['green'],
          destinationId: 'accepting',
        });

        const rejectedDrop = jest.fn<(event: DropEvent) => void>();
        const rejecting = await render(
          harness.scenario({
            activatedId: 'pink',
            destinationId: 'rejecting',
            selectedIds,
            onDrop: rejectedDrop,
            canAccept: () => true,
            canReject: () => false,
          })
        );
        await harness.activate(rejecting, canonicalIds);
        await harness.commit(rejecting, 'rejecting', canonicalIds);
        expect(rejectedDrop).not.toHaveBeenCalled();
      });
    }
  );

  it.each<ContractEngine>(['fallback', 'native'])(
    '%s removes an accepted disappearing destination from the shared contract',
    async (engine) => {
      const harness = contractHarnesses[engine];
      await harness.exercise(async () => {
        const onDrop = jest.fn<(event: DropEvent) => void>();
        const scenario = (includeAccepting: boolean) =>
          harness.scenario({
            activatedId: 'pink',
            destinationId: 'accepting',
            selectedIds: ['pink', 'blue', 'yellow'],
            onDrop,
            canAccept: () => true,
            canReject: () => false,
            includeAccepting,
          });
        const rendered = await render(scenario(true));
        await harness.activate(rendered, ['blue', 'yellow', 'pink']);
        await rendered.rerender(scenario(false));
        expect(rendered.queryByText('Accepting')).toBeNull();
        await harness.commit(rendered, 'accepting', ['blue', 'yellow', 'pink']);
        expect(onDrop).not.toHaveBeenCalled();
      });
    }
  );

  it('fallback surfaces a move-set predicate error and emits nothing', async () => {
    const applicationError = new Error('selected predicate failed');
    const predicate = jest.fn((ids: readonly string[]) => {
      expect(ids).toEqual(['blue', 'yellow', 'pink']);
      throw applicationError;
    });
    const onDrop = jest.fn<(event: DropEvent) => void>();
    const rendered = await render(
      <GestureHandlerRootView>
        <FallbackDropAcceptanceContainer
          acceptanceMove={{ sourceId: 'pink', destinationId: 'accepting' }}
          onDrop={onDrop}
          selectedIds={['pink', 'blue', 'yellow']}
        >
          {scenarioChildren({ canAccept: predicate, canReject: () => false })}
        </FallbackDropAcceptanceContainer>
      </GestureHandlerRootView>
    );
    await expect(
      fireEvent.press(
        rendered.getByRole('button', { name: 'Activate fallback drop' })
      )
    ).rejects.toBe(applicationError);
    expect(predicate).toHaveBeenCalledTimes(1);
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Move fallback drop destination' })
    );
    await fireEvent.press(
      rendered.getByRole('button', { name: 'Commit fallback drop' })
    );
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('native cancels and surfaces a move-set predicate error', async () => {
    const applicationError = new Error('native selected predicate failed');
    const predicate = jest.fn((ids: readonly string[]) => {
      expect(ids).toEqual(['blue', 'yellow', 'pink']);
      throw applicationError;
    });
    const cancel = jest.spyOn(Commands, 'cancelInteraction');
    const onDrop = jest.fn<(event: DropEvent) => void>();
    try {
      await withNativeIOS(async () => {
        const rendered = await render(
          <NativeDropAcceptanceContainer
            acceptanceMove={{ sourceId: 'pink', destinationId: 'accepting' }}
            onDrop={onDrop}
            selectedIds={['pink', 'blue', 'yellow']}
            testID="native-drop-error"
          >
            {scenarioChildren({ canAccept: predicate, canReject: () => false })}
          </NativeDropAcceptanceContainer>
        );
        await expect(
          fireEvent(rendered.getByTestId('native-drop-error'), 'dragActivate', {
            nativeEvent: { itemIdsJson: '["blue","yellow","pink"]' },
          })
        ).rejects.toBe(applicationError);
        expect(predicate).toHaveBeenCalledTimes(1);
        expect(cancel).toHaveBeenCalledTimes(1);
        await fireEvent(rendered.getByTestId('native-drop-error'), 'drop', {
          nativeEvent: {
            destinationId: 'accepting',
            itemIdsJson: '["blue","yellow","pink"]',
          },
        });
        expect(onDrop).not.toHaveBeenCalled();
      });
    } finally {
      cancel.mockRestore();
    }
  });
});
