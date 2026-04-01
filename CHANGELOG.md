# Changelog

## 1.6.0

### Fixed
- Fixed Terraform and OpenTofu autodetection for Scalr workspaces whose IaC version is set to `Auto` or `latest`.
- Fixed OpenTofu platform normalization so Scalr `opentofu` values resolve to the correct `tofu` binary.
- Fixed fallback version resolution to prefer workspace usage data first and active software versions second.
- Fixed invalid explicit values such as `binary_version=auto` and `binary_version=latest` by failing fast with a clear validation error instead of attempting broken downloads.

### Added
- Added a PR integration workflow for same-repo pull request validation.
- Added manual PR workflow inputs for testing explicit `binary_version` installs for both Terraform and OpenTofu.
- Added unit coverage for action orchestration, wrapper behavior, direct download URL generation, and version autodetection edge cases.
- Added consumer test workflows in a separate test repository to validate real-world action usage, wrapper behavior, and remote-backend runs.

### Changed
- Refactored the main action entrypoint into testable helpers in [`src/terraform.js`](/Users/ilyaneron-mac/Work/scalr-action/src/terraform.js).
- Refactored the wrapper logic into testable helpers in [`src/wrapper.js`](/Users/ilyaneron-mac/Work/scalr-action/src/wrapper.js).
- Updated workflow actions to current majors, including `actions/checkout@v6` and `actions/setup-node@v6`.
- Updated the action runtime in [`action.yml`](/Users/ilyaneron-mac/Work/scalr-action/action.yml) to `node24`.

### Dependencies
- Updated the GitHub Actions toolkit dependencies to current compatible majors.
- Removed unnecessary runtime dependencies by replacing:
  - `axios` with built-in `fetch`
  - `await-spawn` with `child_process.execFile`
  - `@hashicorp/js-releases` with direct Terraform and OpenTofu download URL builders
- Rebuilt bundled artifacts in [`dist/terraform/index.js`](/Users/ilyaneron-mac/Work/scalr-action/dist/terraform/index.js) and [`dist/wrapper/index.js`](/Users/ilyaneron-mac/Work/scalr-action/dist/wrapper/index.js).
