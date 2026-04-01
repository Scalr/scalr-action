const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getHomeDir,
  getTerraformRcPath,
  getWrapperSourcePath,
  main,
  resolveLatestScalrCliVersion,
  runAction,
  validateWorkspaceInputs,
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

test("validateWorkspaceInputs rejects conflicting or incomplete workspace selectors", () => {
  assert.throws(
    () =>
      validateWorkspaceInputs({
        environmentName: "prod",
        workspace: "ws-123",
        workspaceName: "network",
      }),
    /Provide either scalr_workspace or both scalr_workspace_name and scalr_environment_name, not both/
  );

  assert.throws(
    () =>
      validateWorkspaceInputs({
        environmentName: "",
        workspace: "",
        workspaceName: "network",
      }),
    /Provide both scalr_workspace_name and scalr_environment_name/
  );

  assert.doesNotThrow(() =>
    validateWorkspaceInputs({
      environmentName: "",
      workspace: "",
      workspaceName: "",
    })
  );
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

test("runAction resolves workspace id from environment and workspace names", async () => {
  const coreModule = createCore({
    scalr_environment_name: "prod",
    scalr_hostname: "example.scalr.io",
    scalr_token: "secret",
    scalr_workspace_name: "network",
  });
  const toolcacheModule = createToolcache();
  const fsModule = createFs();
  let detectArgs;

  const result = await runAction({
    coreModule,
    detectWorkspaceVersionImpl: async (args) => {
      detectArgs = args;
      return { iacPlatform: "terraform", version: "1.4.7" };
    },
    env: { HOME: "/tmp/home" },
    fetchImpl: async () => ({
      ok: true,
      url: "https://github.com/Scalr/scalr-cli/releases/tag/v0.17.7",
    }),
    fsModule,
    ioModule: {
      cp: async () => {},
      mkdirP: async () => {},
      mv: async () => {},
    },
    osModule: {
      arch: () => "x64",
      platform: () => "linux",
    },
    resolveWorkspaceIdByNameImpl: async ({ environmentName, workspaceName }) => {
      assert.equal(environmentName, "prod");
      assert.equal(workspaceName, "network");
      return "ws-lookup";
    },
    toolcacheModule,
  });

  assert.equal(result.workspace, "ws-lookup");
  assert.equal(detectArgs.workspace, "ws-lookup");
  assert.equal(typeof detectArgs.spawnCommand, "function");
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

test("runAction uses USERPROFILE for Scalr config on Windows when HOME is unset", async () => {
  const coreModule = createCore({
    binary_output: "false",
    binary_version: "1.4.7",
    iac_platform: "terraform",
    scalr_hostname: "example.scalr.io",
    scalr_token: "secret",
  });
  const toolcacheModule = createToolcache();
  const fsModule = createFs();
  const createdDirs = [];

  const result = await runAction({
    coreModule,
    env: {
      APPDATA: "C:\\Users\\runner\\AppData\\Roaming",
      USERPROFILE: "C:\\Users\\runneradmin",
    },
    fetchImpl: async () => ({
      ok: true,
      url: "https://github.com/Scalr/scalr-cli/releases/tag/v0.17.7",
    }),
    fsModule,
    ioModule: {
      cp: async () => {},
      mkdirP: async (dir) => createdDirs.push(dir),
      mv: async () => {},
    },
    osModule: {
      arch: () => "x64",
      homedir: () => "C:\\fallback-home",
      platform: () => "win32",
    },
    toolcacheModule,
  });

  assert.equal(result.terraformRcPath, "C:\\Users\\runner\\AppData\\Roaming/terraform.rc");
  assert.deepEqual(createdDirs, ["C:\\Users\\runneradmin/.scalr", "C:\\Users\\runner\\AppData\\Roaming"]);
  assert.equal(fsModule.writes[0].file, "C:\\Users\\runneradmin/.scalr/scalr.conf");
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

test("main reports a clear error when workspace id and name inputs are both provided", async () => {
  const coreModule = createCore({
    scalr_environment_name: "prod",
    scalr_hostname: "example.scalr.io",
    scalr_token: "secret",
    scalr_workspace: "ws-123",
    scalr_workspace_name: "network",
  });

  await main({
    coreModule,
    env: { HOME: "/tmp/home" },
    fetchImpl: async () => {
      throw new Error("fetch should not run");
    },
  });

  assert.deepEqual(coreModule.failures, [
    "Provide either scalr_workspace or both scalr_workspace_name and scalr_environment_name, not both",
  ]);
});

test("main reports a clear error when only one workspace name input is provided", async () => {
  const coreModule = createCore({
    scalr_hostname: "example.scalr.io",
    scalr_token: "secret",
    scalr_workspace_name: "network",
  });

  await main({
    coreModule,
    env: { HOME: "/tmp/home" },
    fetchImpl: async () => {
      throw new Error("fetch should not run");
    },
  });

  assert.deepEqual(coreModule.failures, [
    "Provide both scalr_workspace_name and scalr_environment_name to resolve a workspace by name",
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

test("getHomeDir falls back across common runner env vars", () => {
  assert.equal(
    getHomeDir({
      env: { HOME: "/home/runner" },
      osModule: { homedir: () => "/fallback" },
    }),
    "/home/runner"
  );
  assert.equal(
    getHomeDir({
      env: { USERPROFILE: "C:\\Users\\runneradmin" },
      osModule: { homedir: () => "C:\\fallback" },
    }),
    "C:\\Users\\runneradmin"
  );
  assert.equal(
    getHomeDir({
      env: { HOMEDRIVE: "C:", HOMEPATH: "\\Users\\runneradmin" },
      osModule: { homedir: () => "C:\\fallback" },
    }),
    "C:\\Users\\runneradmin"
  );
  assert.equal(
    getHomeDir({
      env: {},
      osModule: { homedir: () => "/fallback" },
    }),
    "/fallback"
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
