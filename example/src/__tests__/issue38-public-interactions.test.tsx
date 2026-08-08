import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { SectionList, Text, View } from 'react-native';
import { GestureHandlerRootView } from '../../../node_modules/react-native-gesture-handler';
import type { PublicOutcome } from '../components';
import { AccessibilityScenario, DropScenario } from '../drop-scenarios';
import { SectionScenario } from '../reorder-scenarios';

jest.mock('react', () =>
  jest.requireActual<typeof import('react')>('../../../node_modules/react')
);

function OutcomeHarness({
  kind,
}: Readonly<{ kind: 'accessibility' | 'drop' | 'section' }>) {
  const [outcome, setOutcome] = useState<PublicOutcome>({
    order: '',
    selection: '',
    event: 'None',
    callbackCount: 0,
  });
  return (
    <GestureHandlerRootView>
      <View testID={`scenario-${kind}`}>
        <Text testID={`${kind}-visible-event`}>{outcome.event}</Text>
        <Text testID={`${kind}-visible-count`}>{outcome.callbackCount}</Text>
        <Text testID={`${kind}-visible-order`}>{outcome.order}</Text>
        {kind === 'accessibility' ? (
          <AccessibilityScenario
            engine="fallback"
            onOutcome={setOutcome}
            resetToken={0}
          />
        ) : kind === 'drop' ? (
          <DropScenario
            engine="fallback"
            onOutcome={setOutcome}
            resetToken={0}
          />
        ) : (
          <SectionScenario
            engine="fallback"
            onOutcome={setOutcome}
            resetToken={0}
            teaching
          />
        )}
      </View>
    </GestureHandlerRootView>
  );
}

describe('issue 38 named public interaction scenarios', () => {
  it('commits a real semantic reorder through the named accessibility scenario', async () => {
    const rendered = await render(<OutcomeHarness kind="accessibility" />);
    await fireEvent(
      rendered.getByLabelText('blue accessible card, selected'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'reorder-move-later' } }
    );
    await waitFor(() =>
      expect(
        rendered.getByTestId('accessibility-visible-count')
      ).toHaveTextContent('1')
    );
    expect(
      rendered.getByTestId('accessibility-visible-event')
    ).toHaveTextContent(/"sourceIds":\["blue","green"\]/);
  });

  it('accepts, rejects, and removes a real accessible drop destination', async () => {
    const rendered = await render(<OutcomeHarness kind="drop" />);
    await fireEvent(
      rendered.getByLabelText('Rejecting drop zone'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'drag-drop-drop-selected' } }
    );
    expect(rendered.getByTestId('drop-visible-count')).toHaveTextContent('0');

    await fireEvent(
      rendered.getByLabelText('Accepting drop zone'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'drag-drop-drop-selected' } }
    );
    await waitFor(() =>
      expect(rendered.getByTestId('drop-visible-count')).toHaveTextContent('1')
    );
    expect(rendered.getByTestId('drop-visible-event')).toHaveTextContent(
      /"destinationId":"accepting"/
    );

    await fireEvent.press(rendered.getByTestId('drop-zone-visibility'));
    expect(rendered.queryByLabelText('Accepting drop zone')).toBeNull();
  });

  it('changes the named section scenario visible order after a same-section move', async () => {
    const scrollToLocation = jest
      .spyOn(SectionList.prototype, 'scrollToLocation')
      .mockImplementation(() => undefined);
    const rendered = await render(<OutcomeHarness kind="section" />);
    const before = rendered.getByTestId('section-visible-order').props.children;
    const firstRow = rendered.getAllByLabelText('Section 1, row 1')[0]!;

    await fireEvent(firstRow, 'accessibilityAction', {
      nativeEvent: { actionName: 'reorder-move-later' },
    });

    await waitFor(() =>
      expect(rendered.getByTestId('section-visible-count')).toHaveTextContent(
        '1'
      )
    );
    expect(
      rendered.getByTestId('section-visible-order').props.children
    ).not.toEqual(before);
    expect(rendered.getByTestId('section-visible-order')).toHaveTextContent(
      /section-1\[section-1-row-2, section-1-row-1/
    );
    scrollToLocation.mockRestore();
  });
});
