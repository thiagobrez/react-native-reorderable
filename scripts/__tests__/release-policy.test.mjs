import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateReleaseIntent,
  isChangesetFile,
  isReleaseSurface,
} from '../release-policy.mjs';

const pullRequest = {
  user: { login: 'contributor' },
  head: { ref: 'feature', sha: 'abc' },
};

test('identifies package release surfaces and Changesets', () => {
  assert.equal(isReleaseSurface('src/index.tsx'), true);
  assert.equal(isReleaseSurface('ios/ReorderableView.mm'), true);
  assert.equal(isReleaseSurface('docs/site/content/index.md'), false);
  assert.equal(isReleaseSurface('.github/workflows/ci.yml'), false);
  assert.equal(isChangesetFile('.changeset/public-behavior.md'), true);
  assert.equal(isChangesetFile('.changeset/config.json'), false);
});

test('requires release intent for package changes', () => {
  const result = evaluateReleaseIntent({
    pullRequest,
    files: [{ filename: 'src/index.tsx', status: 'modified' }],
  });
  assert.equal(result.accepted, false);
});

test('accepts a Changeset and documented exempt changes', () => {
  assert.equal(
    evaluateReleaseIntent({
      pullRequest,
      files: [
        { filename: 'src/index.tsx', status: 'modified' },
        { filename: '.changeset/behavior.md', status: 'added' },
      ],
    }).accepted,
    true
  );
  assert.equal(
    evaluateReleaseIntent({
      pullRequest,
      files: [{ filename: 'docs/site/content/index.md', status: 'modified' }],
    }).accepted,
    true
  );
});

test('accepts only an authorized override supplied for this check run', () => {
  const base = {
    pullRequest,
    files: [{ filename: 'package.json', status: 'modified' }],
  };
  assert.equal(
    evaluateReleaseIntent({
      ...base,
      authorizedOverrideComments: [
        {
          body: 'No changeset needed',
          user: { login: 'maintainer' },
        },
      ],
    }).accepted,
    true
  );
  assert.equal(evaluateReleaseIntent(base).accepted, false);
});

test('exempts only the bot-owned Changesets release branch', () => {
  const result = evaluateReleaseIntent({
    pullRequest: {
      user: { login: 'github-actions[bot]' },
      head: { ref: 'changeset-release/main', sha: 'abc' },
    },
    files: [{ filename: 'package.json', status: 'modified' }],
  });
  assert.equal(result.accepted, true);
});
