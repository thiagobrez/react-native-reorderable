# Contributing

Contributions are welcome. Be respectful and follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

Use [GitHub Discussions](https://github.com/thiagobrez/react-native-reorderable/discussions) for usage questions and ideas. Use the public bug-report form for reproducible behavior that violates the documented contract. Internal agent files and maintainer triage labels are not contributor workflows or support commitments.

## Development setup

This Yarn workspace contains the library at the repository root and its React Native example app in `example/`. Install the Node version from [`.nvmrc`](./.nvmrc), then:

```sh
yarn
yarn example start
```

In another terminal, run `yarn example ios` or `yarn example android`. Install iOS pods after dependency or native changes. JavaScript changes Fast Refresh; native changes require rebuilding the app.

## Before opening a pull request

Keep a pull request focused on one change and discuss new public API in GitHub Discussions first. Add or update user-observable tests and documentation. User-visible package changes need a Changeset:

```sh
yarn changeset
```

The release surface is `src/`, `ios/`, `android/`, `cpp/`, `Reorderable.podspec`, and `package.json`. Changes confined to tests, examples, benchmarks, documentation, CI, agent metadata, or development tooling are exempt. If a release-surface change deliberately needs no release note, a maintainer with write access may post the exact comment `No changeset needed`; that approval applies only to the current pull-request commit and a new push invalidates it.

Run the relevant checks:

```sh
yarn typecheck
yarn lint
yarn test
yarn prepare
yarn docs:build
```

Changes to native interaction behavior may also need the device-contract or performance checks described by the pull-request template. Do not make test outcomes depend on undocumented manual QA.

## Documentation

The Rspress site in `docs/site/content/` is the canonical documentation surface; the README stays a quick start. Run `yarn docs:dev` while editing and `yarn docs:build` before submission.

The API page is generated from the three public entrypoints. Update `scripts/generate-api-docs.mjs` when a deliberately approved export changes, run `yarn docs:api`, and commit the generated page. `yarn docs:api:check` rejects export or generated-file drift.

Teaching examples live in the example app so normal TypeScript checks keep them executable. Documentation may link to their type-checked source but should not use app deep links.

## Commits and pull requests

Use Conventional Commit subjects such as `fix:`, `feat:`, `docs:`, `test:`, `refactor:`, or `chore:`. Explain the public behavior, evidence, and documentation impact in the pull request. Maintainers decide release timing; the compatibility matrix is not a maintenance cadence, SLA, continuity, or backport promise. The repository-owned maintainer procedure is documented in [Releasing](./docs/releasing.md).
