import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@legendapp/list/react-native', () => {
  throw new Error(
    'optional Legend List peer was loaded by the root entrypoint'
  );
});

describe('root package isolation from Legend List', () => {
  it('imports the root without resolving the optional peer or exporting wrappers', () => {
    const root = require('..') as Record<string, unknown>;
    expect(root.ReorderableList).toEqual(expect.any(Function));
    expect(root.ReorderableSectionList).toEqual(expect.any(Function));
    expect(root.ReorderableLegendList).toBeUndefined();
    expect(root.ReorderableLegendSectionList).toBeUndefined();
  });
});
