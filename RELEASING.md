# Release process

This document keeps KeyP releases reproducible and makes download and adoption metrics verifiable.

## Versioning

Use Semantic Versioning. While the project is in alpha, breaking changes may occur in 0.x minor releases and must be clearly documented.

## Pre-release checklist

1. Confirm that the target branch contains no secrets, production database files, logs, or user data.
2. Run `pnpm run ci`.
3. Confirm the GitHub Actions CI and CodeQL checks pass.
4. Review dependency alerts and unresolved security reports.
5. Verify that README, `.env.example`, `docs/API.md`, and `docs/openapi.yaml` match runtime behavior.
6. Move relevant entries from `[Unreleased]` in `CHANGELOG.md` into the new version section.
7. Update `package.json` with the intended version.
8. Build and smoke-test any release artifacts in a clean environment.

## Publishing a GitHub release

1. Create a signed or annotated tag such as `v0.1.0` from the verified commit.
2. Create a GitHub Release for that tag.
3. Use the matching `CHANGELOG.md` section as the release notes.
4. Attach only reproducible artifacts; include checksums when binary artifacts are provided.
5. Mark alpha or pre-release builds as pre-releases.
6. Verify installation instructions against the published artifact.

## After release

- Open an issue for any deferred work or known limitation.
- Monitor issues, security reports, and failed deployments.
- Report stars, forks, release downloads, external deployments, and active contributors exactly as observed; never estimate or combine unrelated product metrics.


## Automated release workflow

Merging a change to `package.json`, `CHANGELOG.md`, or the release workflow on `main` runs `.github/workflows/publish-release.yml`. The workflow reads the version from `package.json` and creates the matching `v<version>` GitHub pre-release only when that release does not already exist. Bump the package version and finalize the changelog before relying on this automation. Promote a verified pre-release to a stable release from the GitHub Releases interface when appropriate.
