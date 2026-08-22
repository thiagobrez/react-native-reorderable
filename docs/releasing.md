# Releasing

The repository owns the release lifecycle. Maintainers merge release intent; GitHub Actions versions, verifies, publishes, tags, creates the GitHub release, and deploys the matching documentation. A workstation must never publish release code for this package. The sole exception is the one-time, non-release placeholder needed to claim a new npm package name before npm allows trusted publishing to be configured.

## One-time repository and npm configuration

Complete these steps after `.github/workflows/release.yml` has been merged into `main` and before merging the generated release pull request.

### Allow the release pull request

1. Open the repository on GitHub and select **Settings**.
2. In the left sidebar, select **Actions**, then **General**.
3. Under **Workflow permissions**, enable **Allow GitHub Actions to create and approve pull requests**.
4. Select **Save**.

### Protect `main`

GitHub only offers status checks that have run recently. Let the workflows run on at least one pull request after these files reach `main`; if a check below is missing, update that pull request to run the workflows again.

1. Open the repository on GitHub and select **Settings**.
2. In the left sidebar, select **Rules**, then **Rulesets**.
3. Select **New ruleset**, then **New branch ruleset**.
4. Name it `Protect main` and set **Enforcement status** to **Active**.
5. Under **Target branches**, select **Add target**, choose **Include default branch**, and confirm that it resolves to `main`.
6. Under **Branch rules**, enable **Require a pull request before merging**.
7. Enable **Require status checks to pass**. Use **Add checks** to require:
   - The five `CI` jobs: `lint`, `test`, `build-library`, `build-android`, and `build-ios`.
   - The `Documentation` workflow's `build` job. Select the entry whose source is GitHub Actions and whose workflow is `Documentation` if GitHub shows multiple `build` checks.
   - `Approve exact tarball for publication workflow` from `Exact package candidate`. This final job depends on every required package, performance, consumer, and device-contract job in that workflow.
   - `Changeset requirement`, the commit-specific check created by the release-intent workflow.
8. Enable **Require branches to be up to date before merging** so checks from an older head commit cannot authorize a merge.
9. Leave bypass permissions empty unless the repository has a separately documented emergency policy, then select **Create**.

### Create the npm deployment environment

1. In GitHub repository **Settings**, select **Environments**.
2. Select **New environment**, enter `npm`, and select **Configure environment**.
3. Under **Deployment branches and tags**, choose **Selected branches and tags**, add the `main` branch, and save the protection rule.
4. Optionally add required reviewers. A reviewer will then have to approve every real npm publication job.

### Bootstrap the new npm package once

Yes: a package must already exist on npm before its settings page or a trusted-publisher relationship can exist. npm has no pending-publisher mechanism for an unclaimed name. `react-native-reorderable` is not published yet, so claim it with an intentionally empty prerelease placeholder. The `bootstrap` tag keeps it away from `latest`; the repository workflow will still make `1.0.0` the first stable release.

From a maintainer machine with an npm account protected by two-factor authentication:

```sh
npm login --registry https://registry.npmjs.org

bootstrap_dir="$(mktemp -d)"
cd "$bootstrap_dir"
npm init --yes
npm pkg set \
  name=react-native-reorderable \
  version=0.0.0-bootstrap.0 \
  description="Reserved for the verified react-native-reorderable release" \
  license=MIT
printf '%s\n' '# react-native-reorderable' 'Bootstrap placeholder; do not install.' > README.md
npm publish --access public --tag bootstrap
npm deprecate react-native-reorderable@0.0.0-bootstrap.0 \
  "Bootstrap placeholder; install a stable release instead."
```

Do not copy repository source or build output into this directory. This placeholder only establishes package ownership and is not a library release. Confirm that `npm view react-native-reorderable dist-tags --json` contains `bootstrap` and does not contain `latest`.

### Attach the trusted publisher

1. Sign in to npmjs.com and open the `react-native-reorderable` package created above.
2. Open **Settings**, then find **Trusted publishing**.
3. Choose **GitHub Actions** and enter:
   - **Organization or user:** `thiagobrez`
   - **Repository:** `react-native-reorderable`
   - **Workflow filename:** `release.yml`—the filename only, including `.yml`
   - **Environment:** `npm`
   - **Allowed actions:** enable `npm publish`
4. Save the trusted publisher and complete npm's two-factor-authentication prompt.
5. After the first successful OIDC release, return to the package's publishing-access settings and choose **Require two-factor authentication and disallow tokens**.

### Configure documentation deployment

1. In GitHub repository **Settings**, select **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

The release workflow intentionally has no npm token. Its publish job receives a short-lived npm credential through GitHub OIDC and requests npm provenance.

## Stable releases

Every user-visible package change carries a file from `yarn changeset`. After a fully green push to `main`, Changesets creates or updates `changeset-release/main`. This pull request is the on-demand release boundary: leave it open while accumulating changes and merge it when the release should happen.

Merging the release pull request causes the exact-package workflow to build one tarball and run that same tarball through package inspection, clean consumers, the supported React Native compatibility matrix, performance checks, and the four-engine device contract. Publication starts only after that workflow and the ordinary `CI` and `Documentation` workflows are green for the same commit. Immediately before npm, the publisher rechecks the tarball bytes, SHA-256, source commit, package name, and version against its manifest.

Changesets then creates the package tag and GitHub release. The same release workflow builds and deploys the documentation from that tagged commit. Stable versions use the npm `latest` tag.

## Prereleases

To opt into the prerelease channel, enter Changesets prerelease mode and commit the resulting state:

```sh
yarn changeset pre enter next
git add .changeset/pre.json
git commit -m "chore: enter next prerelease mode"
```

The normal release pull request then produces versions such as `1.0.0-next.0`. The publisher derives the npm tag from the version and will only send these versions to `next`; it cannot move `latest`.

To finish the prerelease series, run `yarn changeset pre exit`, commit the state change, and merge the stable release pull request after its checks pass.

## Publication dry run

Dispatch `Exact package candidate` with channel `dry-run`. It runs the full workflow-dispatch compatibility matrix, downloads the approved bytes in the final job, rechecks their immutable manifest, and passes that exact tarball to `npm publish --dry-run --provenance --tag next`. The release workflow ignores dispatch runs, so this path cannot publish a stable release.

## Failed or partial releases

Do not recreate or repack an artifact locally. Re-run the failed job or push a corrective commit so all checks and artifact identity are evaluated together. npm publication is idempotently skipped by Changesets once the package version already exists; tags, GitHub releases, and documentation are created from the release commit by the same workflow.
