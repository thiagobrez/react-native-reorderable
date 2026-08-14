import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { GestureHandlerRootView } from '../../../node_modules/react-native-gesture-handler';
import type { ReorderableItemLayout } from 'react-native-reorderable';
import { getSectionItemLayout, SectionScenario } from '../reorder-scenarios';
import { createSectionPreset } from '../scenario-catalog';

type RenderedNode = Readonly<{
  children?: readonly (RenderedNode | string)[];
  props?: Readonly<Record<string, unknown>>;
  type?: string;
}>;

function findTextNode(
  node: RenderedNode | readonly RenderedNode[] | null,
  text: string
): RenderedNode | undefined {
  if (node === null) return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findTextNode(child, text);
      if (match !== undefined) return match;
    }
    return undefined;
  }
  const renderedNode = node as RenderedNode;
  if (renderedNode.type === 'Text' && renderedNode.children?.includes(text))
    return renderedNode;
  for (const child of renderedNode.children ?? []) {
    if (typeof child === 'string') continue;
    const match = findTextNode(child, text);
    if (match !== undefined) return match;
  }
  return undefined;
}

jest.mock('react', () =>
  jest.requireActual<typeof import('react')>('../../../node_modules/react')
);

describe('issue 39 section scenario geometry', () => {
  it('supplies exact row anchors including every preceding header and footer', async () => {
    const rendered = await render(
      <GestureHandlerRootView>
        <SectionScenario
          engine="fallback"
          onOutcome={() => undefined}
          resetToken={0}
        />
      </GestureHandlerRootView>
    );
    const viewportLayout = rendered.getByTestId('sections-24x25-list').props
      .getItemLayout as
      ((data: unknown, index: number) => ReorderableItemLayout) | undefined;
    const sections = createSectionPreset();
    const labelText = findTextNode(
      rendered.toJSON() as RenderedNode | readonly RenderedNode[] | null,
      'Section 1, row 1'
    );

    const row = rendered.getByLabelText('Section 1, row 1');

    expect(row).toHaveProp('accessible', true);
    expect(labelText?.props).toMatchObject({
      accessibilityElementsHidden: true,
      accessible: false,
      importantForAccessibility: 'no',
    });
    expect(viewportLayout).toBeDefined();
    expect(getSectionItemLayout(sections, 1, 0)).toEqual({
      length: 52,
      offset: 94,
    });
    expect(getSectionItemLayout(sections, 1, 24)).toEqual({
      length: 52,
      offset: 1342,
    });
    expect(getSectionItemLayout(sections, 2, 0)).toEqual({
      length: 52,
      offset: 1454,
    });
  });
});
