import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@shopify/flash-list', () => {
  throw new Error('optional FlashList peer was loaded by the root entrypoint');
});

describe('root package isolation from FlashList', () => {
  it('imports the root without resolving the optional peer or exporting wrappers', () => {
    const root = require('..') as Record<string, unknown>;
    expect(root.ReorderableList).toEqual(expect.any(Function));
    expect(root.ReorderableSectionList).toEqual(expect.any(Function));
    expect(root.ReorderableFlashList).toBeUndefined();
    expect(root.ReorderableFlashSectionList).toBeUndefined();
  });
});
