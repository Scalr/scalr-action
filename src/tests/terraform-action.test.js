const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getTerraformRcPath,
  getWrapperSourcePath,
  main,
  resolveLatestScalrCliVersion,
  runAction,
  validateRequestedVersion,
} = require("../terraform");

function createCore(inputs = {}) {
  const infoMessages = [];
  const exports = [];
  const outputs = [];
  const failures = [];

  return {
    addPath: () => {},
    exportVariable: (name, value) => exports.push({ name, value }),
    getInput: (name) => inputs[name] || "",
    info: (message) => infoMessages.push(message),
    setFailed: (message) => failures.push(message),
    setOutput: (name, value) => outputs.push({ name, value }),
    exports,
    failures,
    infoMessages,
    outputs,
  };
}

function createToolcache() {
  const downloads = [];
  const extracts = [];

  return {
    downloadTool: async (url) => {
      downloads.push(url);
      return `archive:${downloads.length}`;
    },
    extractZip: async (archive) => {
      extracts.push(archive);
      return `/tool/${extracts.length}`;
    },
    downloads,
    extracts,
  };
}

function createFs() {
  const writes = [];
  return {
    writeFile: async (file, contents) => {
      writes.push({ file, contents });
    },
    writes,
  };
}

test("resolveLatestScalrCliVersion fails on non-OK response", async () => {
  await assert.rejects(
    resolveLatestScalrCliVersion(async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    })),
    /Failed to resolve latest Scalr CLI version: 500 Internal Server Error/
  );
});

test("validateRequestedVersion rejects auto-like explicit versions", () => {
  assert.throws(
    () => validateRequestedVersion("auto"),
    /binary_version does not support auto\/latest values/
  );
  assert.throws(
    () => validateRequestedVersion("latest"),
    /binary_version does not support auto\/latest values/
  );
  assert.doesNotThrow(() => validateRequestedVersion("1.4.7"));
});

test("runAction skips autodetect when explicit binary_version is provided", async () => {
  const coreModule = createCore({
    binary_output: "false",
    binary_version: "1.11.5",
    iac_platform: "tofu",
    scalr_hostname: "example.scalr.io",
    scalr_token: "secret",
  });
  const toolcacheModule = createToolcache();
  const ioModule = {
    cp: async () => {
      throw new Error("wrapper copy should not be called");
    },
    mkdirP: async () => {},
    mv: async () => {
      throw new Error("wrapper move should not be called");
    },
  };
  const fsModule = createFs();
  let detectCalled = false;

  const result = await runAction({
    coreModule,
    detectWorkspaceVersionImpl: async () => {
      detectCalled = true;
      throw new Error("should not run");
    },
    env: { HOME: "/tmp/home" },
    fetchImpl: async () => ({
      ok: true,
      url: "https://github.com/Scalr/scalr-cli/releases/tag/v0.17.7",
    }),
    fsModule,
    ioModule,
    osModule: {
      arch: () => "x64",
      platform: () => "linux",
    },
    toolcacheModule,
  });

  assert.equal(detectCalled, false);
  assert.equal(result.iacPlatform, "tofu");
  assert.equal(result.version, "1.11.5");
  assert.deepEqual(toolcacheModule.downloads, [
    "https://github.com/Scalr/scalr-cli/releases/download/v0.17.7/scalr-cli_0.17.7_linux_amd64.zip",
    "https://github.com/opentofu/opentofu/releases/download/v1.11.5/tofu_1.11.5_linux_amd64.zip",
  ]);
  assert.deepEqual(coreModule.exports, [
    { name: "TF_IN_AUTOMATION", value: "TRUE" },
    { name: "TERRAFORM_OUTPUT", value: "false" },
  ]);
  assert.equal(fsModule.writes.length, 2);
});

test("main reports a clear error when binary_version is set to auto", async () => {
  const coreModule = createCore({
    binary_version: "auto",
    scalr_hostname: "example.scalr.io",
    scalr_token: "secret",
  });

  await main({
    coreModule,
    env: { HOME: "/tmp/home" },
    fetchImpl: async () => {
      throw new Error("fetch should not run");
    },
  });

  assert.deepEqual(coreModule.failures, [
    "binary_version does not support auto/latest values; leave it empty and provide scalr_workspace for autodetect",
  ]);
});

test("runAction autodetects Terraform version and installs wrapper using custom rc path", async () => {
  const coreModule = createCore({
    binary_output: "true",
    binary_wrapper: "true",
    scalr_hostname: "example.scalr.io",
    scalr_token: "secret",
    scalr_workspace: "ws-123",
  });
  const toolcacheModule = createToolcache();
  const fsModule = createFs();
  const copied = [];
  const moved = [];
  const createdDirs = [];

  const result = await runAction({
    coreModule,
    detectWorkspaceVersionImpl: async ({ workspace, spawnCommand }) => {
      assert.equal(workspace, "ws-123");
      assert.equal(typeof spawnCommand, "function");
      return { iacPlatform: "terraform", version: "1.4.7" };
    },
    entryFilePath: "/workspace/src/terraform.js",
    env: {
      HOME: "/tmp/home",
      TF_CLI_CONFIG_FILE: "/tmp/custom.tfrc",
    },
    fetchImpl: async () => ({
      ok: true,
      url: "https://github.com/Scalr/scalr-cli/releases/tag/v0.17.7",
    }),
    fsModule,
    ioModule: {
      cp: async (source, target) => copied.push({ source, target }),
      mkdirP: async (dir) => createdDirs.push(dir),
      mv: async (source, target) => moved.push({ source, target }),
    },
    osModule: {
      arch: () => "x64",
      platform: () => "win32",
    },
    toolcacheModule,
  });

  assert.equal(result.iacPlatform, "terraform");
  assert.equal(result.version, "1.4.7");
  assert.equal(result.terraformRcPath, "/tmp/custom.tfrc");
  assert.deepEqual(toolcacheModule.downloads, [
    "https://github.com/Scalr/scalr-cli/releases/download/v0.17.7/scalr-cli_0.17.7_windows_amd64.zip",
    "https://releases.hashicorp.com/terraform/1.4.7/terraform_1.4.7_windows_amd64.zip",
  ]);
  assert.deepEqual(moved, [
    {
      source: "/tool/2/terraform.exe",
      target: "/tool/2/terraform-bin.exe",
    },
  ]);
  assert.equal(copied.length, 1);
  assert.match(copied[0].source, /src[\\/]wrapper\.js$/);
  assert.equal(copied[0].target, "/tool/2/terraform");
  assert.deepEqual(createdDirs, ["/tmp/home/.scalr", "/tmp"]);
});

test("main reports missing workspace when autodetect is requested", async () => {
  const coreModule = createCore({
    scalr_hostname: "example.scalr.io",
    scalr_token: "secret",
  });

  await main({
    coreModule,
    env: { HOME: "/tmp/home" },
    fetchImpl: async () => ({
      ok: true,
      url: "https://github.com/Scalr/scalr-cli/releases/tag/v0.17.7",
    }),
    fsModule: { writeFile: async () => {} },
    ioModule: { cp: async () => {}, mkdirP: async () => {}, mv: async () => {} },
    osModule: {
      arch: () => "x64",
      platform: () => "linux",
    },
    toolcacheModule: {
      downloadTool: async () => "archive",
      extractZip: async () => "/tool/path",
    },
  });

  assert.deepEqual(coreModule.failures, [
    "Please specify workspace to autodetect OpenTofu/Terraform version",
  ]);
});

test("getTerraformRcPath uses platform defaults when TF_CLI_CONFIG_FILE is unset", () => {
  assert.equal(
    getTerraformRcPath({
      env: { APPDATA: "C:\\Users\\runner\\AppData\\Roaming" },
      iacPlatform: "terraform",
      platform: "windows",
    }),
    "C:\\Users\\runner\\AppData\\Roaming/terraform.rc"
  );
  assert.equal(
    getTerraformRcPath({
      env: { HOME: "/home/runner" },
      iacPlatform: "tofu",
      platform: "linux",
    }),
    "/home/runner/.tofurc"
  );
});

test("getWrapperSourcePath resolves source and bundled wrapper locations", () => {
  assert.match(
    getWrapperSourcePath(
      {
        basename: (value) => value.split("/").pop(),
        dirname: (value) => value.split("/").slice(0, -1).join("/"),
        resolve: (...parts) => parts.join("/"),
      },
      "/workspace/src/terraform.js"
    ),
    /\/workspace\/src\/wrapper\.js$/
  );

  assert.match(
    getWrapperSourcePath(
      {
        basename: (value) => value.split("/").pop(),
        dirname: (value) => value.split("/").slice(0, -1).join("/"),
        resolve: (...parts) => parts.join("/"),
      },
      "/workspace/dist/terraform/index.js"
    ),
    /\/workspace\/dist\/terraform\/\.\.\/wrapper\/index\.js$/
  );
});
