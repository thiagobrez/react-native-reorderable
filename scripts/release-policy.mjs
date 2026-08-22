const CHANGESET_FILE = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;

const RELEASE_ROOT_FILES = new Set(['package.json', 'Reorderable.podspec']);
const RELEASE_DIRECTORIES = ['android/', 'cpp/', 'ios/', 'src/'];

export const OVERRIDE_COMMENT = 'No changeset needed';

export function isChangesetFile(filename) {
  return CHANGESET_FILE.test(filename);
}

export function isReleaseSurface(filename) {
  return (
    RELEASE_ROOT_FILES.has(filename) ||
    RELEASE_DIRECTORIES.some((directory) => filename.startsWith(directory))
  );
}

export function isAutomatedReleasePullRequest(pullRequest) {
  return (
    pullRequest.user?.login === 'github-actions[bot]' &&
    pullRequest.head?.ref === 'changeset-release/main'
  );
}

export function evaluateReleaseIntent({
  pullRequest,
  files,
  authorizedOverrideComments = [],
}) {
  if (isAutomatedReleasePullRequest(pullRequest)) {
    return {
      accepted: true,
      reason:
        'The automated Changesets release pull request consumes release intent.',
      releaseFiles: [],
    };
  }

  const releaseFiles = files
    .map((file) => file.filename)
    .filter(isReleaseSurface);
  if (releaseFiles.length === 0) {
    return {
      accepted: true,
      reason: 'This pull request changes only documented release-exempt files.',
      releaseFiles,
    };
  }

  const hasChangeset = files.some(
    (file) => file.status !== 'removed' && isChangesetFile(file.filename)
  );
  if (hasChangeset) {
    return {
      accepted: true,
      reason: 'Release intent is recorded in a Changeset.',
      releaseFiles,
    };
  }

  const validOverride = authorizedOverrideComments.find(
    (comment) => comment.body === OVERRIDE_COMMENT
  );
  if (validOverride != null) {
    return {
      accepted: true,
      reason: `Maintainer @${validOverride.user.login} overrode the requirement for the current head commit.`,
      releaseFiles,
    };
  }

  return {
    accepted: false,
    reason:
      'Published-package files changed without a Changeset or a current maintainer override.',
    releaseFiles,
  };
}
