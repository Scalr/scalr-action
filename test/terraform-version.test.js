const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectWorkspaceVersion,
  normalizeIacPlatform,
} = require("../src/terraform-version");

test("normalizeIacPlatform maps OpenTofu aliases to tofu", () => {
  assert.equal(normalizeIacPlatform("tofu"), "tofu");
  assert.equal(normalizeIacPlatform("opentofu"), "tofu");
  assert.equal(normalizeIacPlatform("terraform"), "terraform");
  assert.equal(normalizeIacPlatform("unexpected"), "terraform");
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
          "iac-platform": "opentofu",
          "terraform-version": "auto",
        })
      );
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
  assert.deepEqual(calls[1], [
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
          "iac-platform": "opentofu",
          "terraform-version": "auto",
        })
      );
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
