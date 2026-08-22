import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const arguments_ = process.argv.slice(2);
const dryRun = arguments_.includes('--dry-run');
const tagFlag = arguments_.indexOf('--tag');
const requestedTag = tagFlag === -1 ? undefined : arguments_[tagFlag + 1];
const positional = arguments_.filter(
  (argument, index) =>
    argument !== '--dry-run' &&
    argument !== '--tag' &&
    arguments_[index - 1] !== '--tag'
);
const tarball = resolve(
  positional[0] ?? 'artifacts/candidate/react-native-reorderable.tgz'
);
const manifestPath = join(dirname(tarball), 'manifest.json');
const expectedCommit = process.env.RELEASE_COMMIT ?? process.env.GITHUB_SHA;

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const repositoryPackage = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf8')
);
const bytes = readFileSync(tarball);
const packedPackage = JSON.parse(
  execFileSync('tar', ['-xOzf', tarball, 'package/package.json'], {
    encoding: 'utf8',
  })
);

assert.equal(manifest.schemaVersion, 1, 'Unsupported candidate manifest');
assert.equal(
  manifest.filename,
  basename(tarball),
  'Candidate filename drifted'
);
assert.equal(manifest.bytes, bytes.byteLength, 'Candidate byte length drifted');
assert.equal(
  manifest.sha256,
  createHash('sha256').update(bytes).digest('hex'),
  'Candidate SHA-256 drifted'
);
assert.ok(expectedCommit, 'RELEASE_COMMIT or GITHUB_SHA is required');
assert.equal(
  manifest.sourceCommit,
  expectedCommit,
  'Candidate was not built from the release commit'
);
assert.equal(
  packedPackage.name,
  repositoryPackage.name,
  'Package name drifted'
);
assert.equal(
  packedPackage.version,
  repositoryPackage.version,
  'Package version drifted'
);
assert.equal(manifest.package, packedPackage.name, 'Manifest package drifted');
assert.equal(
  manifest.version,
  packedPackage.version,
  'Manifest version drifted'
);

const isNext = /^\d+\.\d+\.\d+-next\.\d+$/.test(packedPackage.version);
const isStable = /^\d+\.\d+\.\d+$/.test(packedPackage.version);
assert.ok(
  isStable || isNext,
  `Only stable or next prerelease versions can be published: ${packedPackage.version}`
);
const tag = requestedTag ?? (isNext ? 'next' : 'latest');
if (!dryRun) {
  assert.equal(
    tag,
    isNext ? 'next' : 'latest',
    'Production publication must use the version-derived npm tag'
  );
}

const npmArguments = [
  'publish',
  tarball,
  '--access',
  'public',
  '--tag',
  tag,
  '--provenance',
];
if (dryRun) npmArguments.push('--dry-run');

process.stdout.write(
  `Publishing verified ${packedPackage.name}@${packedPackage.version} (${manifest.sha256}) to ${tag}${dryRun ? ' [dry run]' : ''}\n`
);
if (dryRun) {
  execFileSync('npm', npmArguments, { stdio: 'inherit' });
} else {
  let publishedIntegrity;
  try {
    publishedIntegrity = JSON.parse(
      execFileSync(
        'npm',
        [
          'view',
          `${packedPackage.name}@${packedPackage.version}`,
          'dist.integrity',
          '--json',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      )
    );
  } catch {
    publishedIntegrity = undefined;
  }

  if (publishedIntegrity == null) {
    execFileSync('npm', npmArguments, { stdio: 'inherit' });
  } else {
    const candidateIntegrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    assert.equal(
      publishedIntegrity,
      candidateIntegrity,
      'The registry already has different bytes for this package version'
    );
    process.stdout.write(
      'npm already contains these exact package bytes; publication is complete.\n'
    );
  }
}
