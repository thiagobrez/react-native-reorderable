import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
jest.mock('react', () =>
  jest.requireActual<typeof import('react')>('../../../node_modules/react')
);
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('react-native-reorderable', () => {
  const View =
    jest.requireActual<typeof import('react-native')>('react-native').View;
  return {
    DragDropContainer: View,
    DraggableItem: View,
    DropZone: View,
    ReorderableContainer: View,
    ReorderableItem: View,
    ReorderableList: View,
    ReorderableSectionList: View,
  };
});
jest.mock(
  'react-native-reorderable/flash-list',
  () => ({
    ReorderableFlashList:
      jest.requireActual<typeof import('react-native')>('react-native').View,
    ReorderableFlashSectionList:
      jest.requireActual<typeof import('react-native')>('react-native').View,
  }),
  { virtual: true }
);
jest.mock(
  'react-native-reorderable/legend-list',
  () => ({
    ReorderableLegendList:
      jest.requireActual<typeof import('react-native')>('react-native').View,
    ReorderableLegendSectionList:
      jest.requireActual<typeof import('react-native')>('react-native').View,
  }),
  { virtual: true }
);

import App from '../App';
import { ScenarioFrame } from '../components';

describe('issue 38 example application', () => {
  it('navigates the three visible catalogs without exposing an engine control', async () => {
    const rendered = await render(<App />);
    expect(rendered.getAllByTestId(/^open-/)).toHaveLength(5);
    expect(rendered.queryByTestId('lab-engine-policy')).toBeNull();

    await fireEvent.press(rendered.getByTestId('area-tab-lab'));
    expect(rendered.getAllByTestId(/^open-/)).toHaveLength(14);
    await fireEvent.press(rendered.getByTestId('area-tab-integrations'));
    expect(rendered.getAllByTestId(/^open-/)).toHaveLength(4);
    expect(rendered.queryByTestId('lab-engine-policy')).toBeNull();
  });

  it('exposes Auto and Fallback only inside a named Lab scenario', async () => {
    const rendered = await render(<App />);
    await fireEvent.press(rendered.getByTestId('area-tab-lab'));
    await fireEvent.press(rendered.getByTestId('open-controlled-order'));

    expect(rendered.getByTestId('lab-engine-policy')).toBeOnTheScreen();
    expect(
      rendered.getByTestId('engine-auto').props.accessibilityState
    ).toEqual({ checked: true });
    await fireEvent.press(rendered.getByTestId('engine-fallback'));
    expect(
      rendered.getByTestId('engine-fallback').props.accessibilityState
    ).toEqual({ checked: true });
    await waitFor(() =>
      expect(
        rendered.getByTestId('scenario-controlled-order-deep-link')
      ).toHaveTextContent(/preset=accept&engine=fallback/)
    );
  });

  it('gives every visible scenario the public outcome and reset surface', async () => {
    const rendered = await render(<App />);
    await fireEvent.press(rendered.getByTestId('open-free-form'));
    expect(rendered.getByTestId('scenario-free-form-order')).toBeOnTheScreen();
    expect(
      rendered.getByTestId('scenario-free-form-selection')
    ).toBeOnTheScreen();
    expect(
      rendered.getByTestId('scenario-free-form-last-event')
    ).toBeOnTheScreen();
    expect(
      rendered.getByTestId('scenario-free-form-callback-count')
    ).toBeOnTheScreen();
    expect(rendered.getByTestId('scenario-free-form-reset')).toBeOnTheScreen();
    expect(rendered.queryByTestId('lab-engine-policy')).toBeNull();
  });

  it('keeps a full long section order in a bounded user-scrollable panel', async () => {
    const finalSection = 'section-24[section-24-row-25]';
    const rendered = await render(
      <ScenarioFrame
        area="lab"
        engine="fallback"
        onBack={() => undefined}
        onReset={() => undefined}
        outcome={{
          order: `${'section-1[row-1] · '.repeat(40)}${finalSection}`,
          selection: 'none',
          event: 'None',
          callbackCount: 0,
        }}
        preset="default"
        scenario="sections-24x25"
        title="24 × 25 sections"
      >
        {null}
      </ScenarioFrame>
    );

    expect(
      rendered.getByTestId('scenario-sections-24x25-order-scroll')
    ).toHaveProp('accessibilityLabel', 'Scrollable current order');
    expect(
      JSON.stringify(
        rendered.getByTestId('scenario-sections-24x25-order').props.children
      )
    ).toContain(finalSection);
  });
});
