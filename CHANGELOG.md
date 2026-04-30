# Changelog

## 1.8.0

### Security

- **Token masking** — the Scalr API token is now registered with `core.setSecret()` immediately on retrieval, ensuring it is redacted in all subsequent GitHub Actions log output.
- **Credential file permissions** — `~/.scalr/scalr.conf` and the Terraform/OpenTofu RC file are now written with mode `0600` (owner-read-only) instead of the default umask permissions, preventing other processes on the same runner from reading them.
- **Injection-safe credential construction** — `scalr.conf` is now written via `JSON.stringify` instead of template-literal interpolation, and the HCL credentials block escapes `"` and `\` characters in hostname and token values. Crafted inputs could previously produce malformed files or inject extra configuration keys.
- **`execFile` instead of `exec` in wrapper** — `terraform output -json` is now invoked without a shell, eliminating the shell-injection surface in the binary wrapper.
- **Credential cleanup on job completion** — a new `post:` step (`dist/cleanup/index.js`) deletes `~/.scalr/scalr.conf` and the Terraform/OpenTofu RC file after every job, including on failure. This prevents credentials from accumulating on self-hosted runners.

  > **⚠️ Breaking change for self-hosted runners:** If your workflow relied on credential files persisting across jobs without re-running the action (e.g., reusing runner state between workflow runs), those files will no longer be present after the job that set them up. Re-run the action in each job that needs credentials.

### Added

- **PR plan comments** — set `pr_comment: true` on a `pull_request` or `pull_request_target` workflow to have plan output automatically posted as a PR comment. Comments are updated in-place on subsequent runs (idempotent). No extra token configuration required; `GITHUB_TOKEN` is used automatically.
- **Tool caching** — the Scalr CLI and Terraform/OpenTofu binary are now cached in the runner tool cache (`@actions/tool-cache`) and reused on subsequent runs with the same version, skipping re-downloads. Particularly beneficial for self-hosted runners and matrix builds.
- **Declared action outputs** — `stdout`, `stderr`, and `exitcode` are now formally declared in `action.yml`, enabling IDE autocomplete for `${{ steps.<id>.outputs.stdout }}` and correct documentation generation.
- **Dependabot** — added `.github/dependabot.yml` to automate weekly dependency update PRs for both npm packages and GitHub Actions workflow pins.

### Fixed

- **Workspace name resolution fallback removed** — `resolveEnvironmentIdByName` and `resolveWorkspaceIdByName` previously fell back to the full unfiltered API result list when no exact name match was found. This could silently resolve to the wrong entity or produce a confusing "multiple found" error. Resolution is now strictly exact-match only.

  > **⚠️ Edge-case breaking change:** Workflows that depended on the unintended fallback (i.e., the CLI's `-filter-name=` returned results but none matched the exact name) will now receive a clear "No environment/workspace named X found" error. Supply the correct exact name or use `scalr_workspace` with the workspace ID directly.

- **`JSON.parse` crash in wrapper** — malformed output from `terraform output -json` (e.g. warnings mixed into stdout) previously threw an uncaught exception and left the step hanging. A parse failure now emits a `core.warning()` and exits cleanly.

## 1.7.1

### Fixed
- Fixed `scalr_workspace_name` / `scalr_environment_name` resolution failing in environments with a large number of workspaces. The action now passes `-filter-name=<workspaceName>` to `get-workspaces` so the response is bounded server-side, and raises the child-process output buffer with a clear error if the limit is ever exceeded.
- Fixed `filterByName` falling through to include items with empty names, which could produce false "Multiple workspaces" errors or resolve the wrong workspace id.

## 1.7.0

### Added
- Added support for resolving a workspace by `scalr_environment_name` and `scalr_workspace_name`, so workflows can use human-readable Scalr identifiers instead of opaque workspace IDs.

### Fixed
- Added validation for conflicting workspace selectors so workflows fail clearly when `scalr_workspace` is combined with the new name-based inputs or when only one name-based input is provided.

## 1.6.1

### Fixed
- Fixed Windows runner home directory detection so the action creates `scalr.conf` and Terraform/OpenTofu CLI config files correctly when `HOME` is unset.
- Fixed Windows autodetect failures caused by the Scalr CLI being left unconfigured on hosted Windows runners.

### Changed
- Switched bundled artifact builds back to deterministic `ncc` output while keeping Bun as the package manager and workflow runtime.
- Aligned the release verification workflow with committed `dist/` artifacts so release builds no longer fail on generated bundle formatting differences.

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
