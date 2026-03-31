# Draft Release Notes

## Highlights
- Fixed workspace version autodetection for both OpenTofu and Terraform when the Scalr workspace uses `Auto` or `latest`.
- Added clearer validation for invalid explicit values such as `binary_version=auto`.
- Added a PR integration workflow and much broader unit test coverage.
- Simplified the runtime by removing several unnecessary dependencies and rebuilding the bundled action output.

## User Impact
- Workflows that rely on `scalr_workspace` autodetection should now resolve the actual effective IaC version instead of trying to download `auto`.
- Explicit version installs still work as before, but invalid sentinel values now fail early with a clear message.
- Manual PR testing now supports explicit `binary_version` checks for both Terraform and OpenTofu.

## Internal Changes
- Reworked version resolution logic to handle flattened Scalr CLI responses and sentinel values such as `auto`, `latest`, and `unknown`.
- Extracted action and wrapper logic into testable helpers.
- Updated CI and workflow definitions to current GitHub Actions versions.
- Reduced runtime dependencies and bundle size by switching to built-in platform APIs where possible.

## Recommended Notes For Release Body
- This release fixes the main regression where OpenTofu autodetection attempted to download version `auto` and failed with a 404.
- It also improves explicit-version validation, test coverage, and CI support for PR validation.
