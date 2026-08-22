import assert from 'node:assert/strict';

import { evaluateReleaseIntent, OVERRIDE_COMMENT } from './release-policy.mjs';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const pullNumber = Number(process.env.PR_NUMBER);
const eventName = process.env.REQUIREMENT_EVENT;
const commentAction = process.env.COMMENT_ACTION;
const commentLogin = process.env.COMMENT_LOGIN;

assert.ok(token, 'GITHUB_TOKEN is required');
assert.match(
  repository ?? '',
  /^[^/]+\/[^/]+$/,
  'GITHUB_REPOSITORY is required'
);
assert.ok(
  Number.isInteger(pullNumber) && pullNumber > 0,
  'PR_NUMBER is required'
);

const [owner, repo] = repository.split('/');
const apiRoot = 'https://api.github.com';
const headers = {
  'Accept': 'application/vnd.github+json',
  'Authorization': `Bearer ${token}`,
  'User-Agent': 'react-native-reorderable-release-policy',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function request(path, options = {}) {
  const response = await fetch(`${apiRoot}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (!response.ok) {
    throw new Error(
      `GitHub API ${options.method ?? 'GET'} ${path} failed: ${response.status} ${await response.text()}`
    );
  }
  return response.json();
}

async function allPages(path) {
  const values = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const result = await request(
      `${path}${separator}per_page=100&page=${page}`
    );
    values.push(...result);
    if (result.length < 100) return values;
  }
}

async function hasWritePermission(login) {
  const result = await request(
    `/repos/${owner}/${repo}/collaborators/${encodeURIComponent(login)}/permission`
  );
  return ['admin', 'maintain', 'write'].includes(result.permission);
}

const [pullRequest, files] = await Promise.all([
  request(`/repos/${owner}/${repo}/pulls/${pullNumber}`),
  allPages(`/repos/${owner}/${repo}/pulls/${pullNumber}/files`),
]);

const authorizedOverrideComments = [];
if (
  eventName === 'issue_comment' &&
  ['created', 'edited'].includes(commentAction) &&
  commentLogin &&
  (await hasWritePermission(commentLogin))
) {
  authorizedOverrideComments.push({
    body: OVERRIDE_COMMENT,
    user: { login: commentLogin },
  });
}

if (eventName === 'issue_comment') {
  assert.ok(
    ['created', 'edited', 'deleted'].includes(commentAction),
    'Unsupported comment action'
  );
  if (commentAction !== 'deleted') {
    assert.ok(commentLogin, 'COMMENT_LOGIN is required for comment events');
  }
}

const result = evaluateReleaseIntent({
  pullRequest,
  files,
  authorizedOverrideComments,
});

const changedSurface = result.releaseFiles.length
  ? `\n\nRelease-surface files:\n${result.releaseFiles.map((file) => `- \`${file}\``).join('\n')}`
  : '';
const summary = `${result.reason}${changedSurface}`;

await request(`/repos/${owner}/${repo}/check-runs`, {
  method: 'POST',
  body: JSON.stringify({
    name: 'Changeset requirement',
    head_sha: pullRequest.head.sha,
    status: 'completed',
    conclusion: result.accepted ? 'success' : 'failure',
    external_id: `changeset-requirement-${pullNumber}`,
    output: {
      title: result.accepted
        ? 'Release intent is accounted for'
        : 'A Changeset is required',
      summary,
    },
  }),
});

process.stdout.write(`${summary}\n`);
if (!result.accepted) process.exitCode = 1;
