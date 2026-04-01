const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectWorkspaceVersion,
  extractDefaultSoftwareVersion,
  getEnvironmentAccountId,
  getWorkspaceEnvironmentId,
  isAutoVersion,
  normalizeIacPlatform,
} = require("../terraform-version");

test("normalizeIacPlatform maps OpenTofu aliases to tofu", () => {
  assert.equal(normalizeIacPlatform("tofu"), "tofu");
  assert.equal(normalizeIacPlatform("opentofu"), "tofu");
  assert.equal(normalizeIacPlatform("terraform"), "terraform");
  assert.equal(normalizeIacPlatform("unexpected"), "terraform");
});

test("flattened CLI helpers extract workspace environment and account ids", () => {
  assert.equal(
    getWorkspaceEnvironmentId({
      environment: { id: "env-flat" },
    }),
    "env-flat"
  );
  assert.equal(
    getEnvironmentAccountId({
      account: { id: "acc-flat" },
    }),
    "acc-flat"
  );
});

test("extractDefaultSoftwareVersion prefers latest version from flattened CLI output", () => {
  assert.equal(
    extractDefaultSoftwareVersion([
      {
        version: "1.9.0",
        default: true,
        latest: false,
      },
      {
        version: "1.11.5",
        default: false,
        latest: true,
      },
    ]),
    "1.11.5"
  );
});

test("isAutoVersion treats auto, latest, unknown, and empty values as unresolved", () => {
  assert.equal(isAutoVersion("auto"), true);
  assert.equal(isAutoVersion("latest"), true);
  assert.equal(isAutoVersion("Unknown"), true);
  assert.equal(isAutoVersion(""), true);
  assert.equal(isAutoVersion("1.6.3"), false);
});

test("detectWorkspaceVersion returns explicit workspace version without fallback", async () => {
  const calls = [];
  const spawnCommand = async (_command, args) => {
    calls.push(args);
    return Buffer.from(
      JSON.stringify({
        "iac-platform": "opentofu",
        "terraform-version": "1.8.6",
      })
    );
  };

  const detected = await detectWorkspaceVersion({
    workspace: "ws-explicit",
    spawnCommand,
  });

  assert.deepEqual(detected, {
    iacPlatform: "tofu",
    version: "1.8.6",
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["get-workspace", "-workspace=ws-explicit"]);
});

test("detectWorkspaceVersion resolves auto through default software versions", async () => {
  const calls = [];
  const spawnCommand = async (_command, args) => {
    calls.push(args);

    if (calls.length === 1) {
      return Buffer.from(
        JSON.stringify({
          name: "example-workspace",
          environment: {
            id: "env-123",
          },
          "iac-platform": "opentofu",
          "terraform-version": "auto",
        })
      );
    }

    if (calls.length === 2) {
      return Buffer.from(
        JSON.stringify({
          account: {
            id: "acc-123",
          },
        })
      );
    }

    if (calls.length === 3) {
      return Buffer.from(JSON.stringify({ data: [] }));
    }

    return Buffer.from(
      JSON.stringify({
        data: [
          {
            attributes: {
              default: true,
              version: "1.11.5",
            },
          },
        ],
      })
    );
  };

  const detected = await detectWorkspaceVersion({
    workspace: "ws-auto",
    spawnCommand,
  });

  assert.deepEqual(detected, {
    iacPlatform: "tofu",
    version: "1.11.5",
  });
  assert.deepEqual(calls[1], ["get-environment", "-environment=env-123"]);
  assert.deepEqual(calls[2], [
    "list-terraform-versions-usage",
    "-filter-account=acc-123",
    "-filter-environment=env-123",
    "-filter-iac-platform=opentofu",
    "-include=workspace",
  ]);
  assert.deepEqual(calls[3], [
    "list-software-versions",
    "-filter-software-type=opentofu",
    "-filter-status=active",
  ]);
});

test("detectWorkspaceVersion fails when no default software version is returned", async () => {
  let callCount = 0;
  const spawnCommand = async () => {
    callCount += 1;

    if (callCount === 1) {
      return Buffer.from(
        JSON.stringify({
          name: "example-workspace",
          environment: {
            id: "env-123",
          },
          "iac-platform": "opentofu",
          "terraform-version": "auto",
        })
      );
    }

    if (callCount === 2) {
      return Buffer.from(
        JSON.stringify({
          account: {
            id: "acc-123",
          },
        })
      );
    }

    if (callCount === 3) {
      return Buffer.from(JSON.stringify({ data: [] }));
    }

    return Buffer.from(JSON.stringify({ data: [] }));
  };

  await assert.rejects(
    detectWorkspaceVersion({
      workspace: "ws-missing-default",
      spawnCommand,
    }),
    /Unable to resolve default OpenTofu version/
  );
});

test("detectWorkspaceVersion surfaces CLI stderr on command failure", async () => {
  const spawnCommand = async () => {
    const error = new Error("child exited with code 2");
    error.stderr = Buffer.from("flag provided but not defined: -filter[software-type]");
    throw error;
  };

  await assert.rejects(
    detectWorkspaceVersion({
      workspace: "ws-cli-error",
      spawnCommand,
    }),
    /flag provided but not defined: -filter\[software-type\]/
  );
});

test("detectWorkspaceVersion prefers workspace usage report for auto versions", async () => {
  const calls = [];
  const spawnCommand = async (_command, args) => {
    calls.push(args);

    if (calls.length === 1) {
      return Buffer.from(
        JSON.stringify({
          name: "example-workspace",
          environment: {
            id: "env-123",
          },
          "iac-platform": "opentofu",
          "terraform-version": "auto",
        })
      );
    }

    if (calls.length === 2) {
      return Buffer.from(
        JSON.stringify({
          account: {
            id: "acc-123",
          },
        })
      );
    }

    return Buffer.from(
      JSON.stringify([
        {
          version: "Unknown",
          workspace: {
            id: "ws-other",
          },
        },
        {
          version: "1.11.5",
          workspace: {
            id: "ws-auto",
          },
        },
      ])
    );
  };

  const detected = await detectWorkspaceVersion({
    workspace: "ws-auto",
    spawnCommand,
  });

  assert.deepEqual(detected, {
    iacPlatform: "tofu",
    version: "1.11.5",
  });
  assert.equal(calls.length, 3);
});

test("detectWorkspaceVersion treats latest workspace and usage values as unresolved and falls back to latest software version", async () => {
  const calls = [];
  const spawnCommand = async (_command, args) => {
    calls.push(args);

    if (calls.length === 1) {
      return Buffer.from(
        JSON.stringify({
          environment: {
            id: "env-123",
          },
          "iac-platform": "opentofu",
          "terraform-version": "latest",
        })
      );
    }

    if (calls.length === 2) {
      return Buffer.from(
        JSON.stringify({
          account: {
            id: "acc-123",
          },
        })
      );
    }

    if (calls.length === 3) {
      return Buffer.from(
        JSON.stringify([
          {
            version: "latest",
            workspace: {
              id: "ws-latest",
            },
          },
        ])
      );
    }

    return Buffer.from(
      JSON.stringify({
        data: [
          {
            version: "1.9.0",
            default: true,
            latest: false,
          },
          {
            version: "1.11.5",
            default: false,
            latest: true,
          },
        ],
      })
    );
  };

  const detected = await detectWorkspaceVersion({
    workspace: "ws-latest",
    spawnCommand,
  });

  assert.deepEqual(detected, {
    iacPlatform: "tofu",
    version: "1.11.5",
  });
  assert.equal(calls.length, 4);
});

test("detectWorkspaceVersion resolves terraform latest through software versions fallback", async () => {
  const calls = [];
  const spawnCommand = async (_command, args) => {
    calls.push(args);

    if (calls.length === 1) {
      return Buffer.from(
        JSON.stringify({
          environment: {
            id: "env-terraform",
          },
          "iac-platform": "terraform",
          "terraform-version": "latest",
        })
      );
    }

    if (calls.length === 2) {
      return Buffer.from(
        JSON.stringify({
          account: {
            id: "acc-terraform",
          },
        })
      );
    }

    if (calls.length === 3) {
      return Buffer.from(
        JSON.stringify([
          {
            version: "Unknown",
            workspace: {
              id: "ws-terraform",
            },
          },
        ])
      );
    }

    return Buffer.from(
      JSON.stringify([
        {
          version: "1.4.7",
          default: true,
          latest: false,
        },
        {
          version: "1.5.7",
          default: false,
          latest: true,
        },
      ])
    );
  };

  const detected = await detectWorkspaceVersion({
    workspace: "ws-terraform",
    spawnCommand,
  });

  assert.deepEqual(detected, {
    iacPlatform: "terraform",
    version: "1.5.7",
  });
  assert.deepEqual(calls[2], [
    "list-terraform-versions-usage",
    "-filter-account=acc-terraform",
    "-filter-environment=env-terraform",
    "-filter-iac-platform=terraform",
    "-include=workspace",
  ]);
  assert.deepEqual(calls[3], [
    "list-software-versions",
    "-filter-software-type=terraform",
    "-filter-status=active",
  ]);
});
