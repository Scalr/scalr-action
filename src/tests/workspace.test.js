const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveWorkspaceIdByName } = require("../workspace");

test("resolveWorkspaceIdByName returns the only matching workspace id", async () => {
  const calls = [];

  const workspaceId = await resolveWorkspaceIdByName({
    environmentName: "prod",
    spawnCommand: async (command, args) => {
      calls.push([command, args]);
      return JSON.stringify([
        { id: "ws-123", name: "network", environment: { name: "prod" } },
      ]);
    },
    workspaceName: "network",
  });

  assert.equal(workspaceId, "ws-123");
  assert.deepEqual(calls, [[
    "scalr",
    [
      "get-workspaces",
      "-filter-environment-name=prod",
      "-filter-name=network",
    ],
  ]]);
});

test("resolveWorkspaceIdByName fails when no workspace matches", async () => {
  await assert.rejects(
    resolveWorkspaceIdByName({
      environmentName: "prod",
      spawnCommand: async () => JSON.stringify([]),
      workspaceName: "network",
    }),
    /No workspace named 'network' found in environment 'prod'/
  );
});

test("resolveWorkspaceIdByName fails when multiple workspaces match", async () => {
  await assert.rejects(
    resolveWorkspaceIdByName({
      environmentName: "prod",
      spawnCommand: async () =>
        JSON.stringify([
          { id: "ws-1", name: "network", environment: { name: "prod" } },
          { id: "ws-2", name: "network", environment: { name: "prod" } },
        ]),
      workspaceName: "network",
    }),
    /Multiple workspaces named 'network' found in environment 'prod'; use scalr_workspace instead/
  );
});

test("resolveWorkspaceIdByName surfaces CLI stderr output", async () => {
  await assert.rejects(
    resolveWorkspaceIdByName({
      environmentName: "prod",
      spawnCommand: async () => {
        const error = new Error("bad");
        error.stderr = Buffer.from("permission denied");
        throw error;
      },
      workspaceName: "network",
    }),
    /permission denied/
  );
});
