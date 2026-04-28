const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveEnvironmentIdByName,
  resolveWorkspaceIdByName,
} = require("../workspace");

test("resolveEnvironmentIdByName returns the only matching environment id", async () => {
  const calls = [];

  const environmentId = await resolveEnvironmentIdByName({
    environmentName: "prod",
    spawnCommand: async (command, args) => {
      calls.push([command, args]);
      return JSON.stringify([{ id: "env-123", name: "prod" }]);
    },
  });

  assert.equal(environmentId, "env-123");
  assert.deepEqual(calls, [[
    "scalr",
    ["list-environments", "-filter-name=prod"],
  ]]);
});

test("resolveEnvironmentIdByName fails when no environment matches", async () => {
  await assert.rejects(
    resolveEnvironmentIdByName({
      environmentName: "prod",
      spawnCommand: async () => JSON.stringify([]),
    }),
    /No environment named 'prod' found/
  );
});

test("resolveEnvironmentIdByName fails when multiple environments match", async () => {
  await assert.rejects(
    resolveEnvironmentIdByName({
      environmentName: "prod",
      spawnCommand: async () =>
        JSON.stringify([
          { id: "env-1", name: "prod" },
          { id: "env-2", name: "prod" },
        ]),
    }),
    /Multiple environments named 'prod' found; use scalr_workspace instead/
  );
});

test("resolveWorkspaceIdByName returns the only matching workspace id", async () => {
  const calls = [];

  const workspaceId = await resolveWorkspaceIdByName({
    environmentName: "prod",
    spawnCommand: async (command, args) => {
      calls.push([command, args]);
      if (args[0] === "list-environments") {
        return JSON.stringify([{ id: "env-123", name: "prod" }]);
      }

      return JSON.stringify([{ id: "ws-123", name: "network" }]);
    },
    workspaceName: "network",
  });

  assert.equal(workspaceId, "ws-123");
  assert.deepEqual(calls, [
    ["scalr", ["list-environments", "-filter-name=prod"]],
    [
      "scalr",
      [
        "get-workspaces",
        "-filter-environment=env-123",
        "-filter-name=network",
      ],
    ],
  ]);
});

test("resolveWorkspaceIdByName filters by name server-side to bound the response size", async () => {
  const calls = [];

  await resolveWorkspaceIdByName({
    environmentName: "prod",
    spawnCommand: async (command, args) => {
      calls.push([command, args]);
      if (args[0] === "list-environments") {
        return JSON.stringify([{ id: "env-123", name: "prod" }]);
      }

      return JSON.stringify([{ id: "ws-123", name: "network" }]);
    },
    workspaceName: "network",
  });

  const getWorkspacesCall = calls.find(
    ([, args]) => args[0] === "get-workspaces"
  );
  assert.ok(getWorkspacesCall, "expected a get-workspaces call");
  assert.ok(
    getWorkspacesCall[1].includes("-filter-name=network"),
    "expected -filter-name=<workspaceName> to be passed to get-workspaces"
  );
});

test("resolveWorkspaceIdByName ignores items with no name (regression: filterByName fall-through)", async () => {
  // Regression test for CLOUD-4956. Previously filterByName returned items
  // whose name was empty, so a no-name item could pollute the candidate set
  // and cause "Multiple workspaces" or wrong-id resolution. The server-side
  // filter should drop them, and the client-side filter must do the same.
  const workspaceId = await resolveWorkspaceIdByName({
    environmentName: "prod",
    spawnCommand: async (command, args) => {
      if (args[0] === "list-environments") {
        return JSON.stringify([{ id: "env-123", name: "prod" }]);
      }

      return JSON.stringify([
        { id: "ws-noisy", name: "" },
        { id: "ws-123", name: "network" },
      ]);
    },
    workspaceName: "network",
  });

  assert.equal(workspaceId, "ws-123");
});

test("resolveWorkspaceIdByName fails when no workspace matches", async () => {
  await assert.rejects(
    resolveWorkspaceIdByName({
      environmentName: "prod",
      spawnCommand: async (command, args) => {
        if (args[0] === "list-environments") {
          return JSON.stringify([{ id: "env-123", name: "prod" }]);
        }

        return JSON.stringify([]);
      },
      workspaceName: "network",
    }),
    /No workspace named 'network' found in environment 'prod'/
  );
});

test("resolveWorkspaceIdByName fails when multiple workspaces match", async () => {
  await assert.rejects(
    resolveWorkspaceIdByName({
      environmentName: "prod",
      spawnCommand: async (command, args) => {
        if (args[0] === "list-environments") {
          return JSON.stringify([{ id: "env-123", name: "prod" }]);
        }

        return JSON.stringify([
          { id: "ws-1", name: "network" },
          { id: "ws-2", name: "network" },
        ]);
      },
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
