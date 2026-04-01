const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildOpenTofuDownloadUrl,
  buildScalrCliDownloadUrl,
  buildTerraformDownloadUrl,
} = require("../download-url");

test("buildScalrCliDownloadUrl uses GitHub release archives", () => {
  assert.equal(
    buildScalrCliDownloadUrl("0.17.7", "linux", "amd64"),
    "https://github.com/Scalr/scalr-cli/releases/download/v0.17.7/scalr-cli_0.17.7_linux_amd64.zip"
  );
});

test("buildTerraformDownloadUrl uses releases.hashicorp.com archives", () => {
  assert.equal(
    buildTerraformDownloadUrl("1.4.7", "darwin", "arm64"),
    "https://releases.hashicorp.com/terraform/1.4.7/terraform_1.4.7_darwin_arm64.zip"
  );
});

test("buildOpenTofuDownloadUrl uses GitHub release archives", () => {
  assert.equal(
    buildOpenTofuDownloadUrl("1.11.5", "windows", "amd64"),
    "https://github.com/opentofu/opentofu/releases/download/v1.11.5/tofu_1.11.5_windows_amd64.zip"
  );
});
