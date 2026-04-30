const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  formatPlanComment,
  runWrapper,
  setCommandOutputs,
  shouldCollectTerraformOutputs,
  shouldPostPrComment,
} = require("../wrapper");

function createChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

test("shouldCollectTerraformOutputs only allows successful apply runs with output enabled", () => {
  assert.equal(
    shouldCollectTerraformOutputs({
      argv: ["apply"],
      code: 0,
      terraformOutput: "true",
    }),
    true
  );
  assert.equal(
    shouldCollectTerraformOutputs({
      argv: ["plan"],
      code: 0,
      terraformOutput: "true",
    }),
    false
  );
  assert.equal(
    shouldCollectTerraformOutputs({
      argv: ["apply"],
      code: 1,
      terraformOutput: "true",
    }),
    false
  );
  assert.equal(
    shouldCollectTerraformOutputs({
      argv: ["apply"],
      code: 0,
      terraformOutput: "false",
    }),
    false
  );
});

test("shouldPostPrComment only allows plan commands with pr_comment enabled", () => {
  assert.equal(shouldPostPrComment({ argv: ["plan"], prComment: "true" }), true);
  assert.equal(
    shouldPostPrComment({ argv: ["-chdir=.", "plan"], prComment: "true" }),
    true
  );
  assert.equal(shouldPostPrComment({ argv: ["apply"], prComment: "true" }), false);
  assert.equal(shouldPostPrComment({ argv: ["plan"], prComment: "false" }), false);
  assert.equal(shouldPostPrComment({ argv: ["plan"], prComment: "" }), false);
  assert.equal(shouldPostPrComment({ argv: ["plan"] }), false);
});

test("setCommandOutputs writes stdout, stderr, and exitcode outputs", () => {
  const outputs = [];
  setCommandOutputs(
    {
      setOutput: (name, value) => outputs.push({ name, value }),
    },
    "stdout text",
    "stderr text",
    1
  );

  assert.deepEqual(outputs, [
    { name: "stdout", value: "stdout text" },
    { name: "stderr", value: "stderr text" },
    { name: "exitcode", value: 1 },
  ]);
});

test("formatPlanComment includes stdout and stderr sections with exit code", () => {
  const comment = formatPlanComment("Plan: 1 to add", "some error", 1);
  assert.match(comment, /<!-- scalr-action-plan -->/);
  assert.match(comment, /failed \(exit code 1\)/);
  assert.match(comment, /Plan: 1 to add/);
  assert.match(comment, /some error/);
  assert.match(comment, /<details>/);
});

test("formatPlanComment omits stderr section when empty", () => {
  const comment = formatPlanComment("Plan: 0 to change", "", 0);
  assert.match(comment, /succeeded/);
  assert.match(comment, /Plan: 0 to change/);
  assert.doesNotMatch(comment, /Show Errors/);
});

test("runWrapper exits without collecting Terraform outputs for non-apply commands", async () => {
  const child = createChild();
  const outputs = [];
  const exits = [];
  const logs = [];
  let execFileCalled = false;

  runWrapper({
    consoleModule: { log: (message) => logs.push(message) },
    coreModule: {
      setFailed: () => {},
      setOutput: (name, value) => outputs.push({ name, value }),
      warning: () => {},
    },
    cpModule: {
      execFile: () => {
        execFileCalled = true;
      },
      spawn: () => child,
    },
    env: { TERRAFORM_OUTPUT: "true" },
    exit: (code) => exits.push(code),
    argv: ["plan"],
  });

  child.stdout.emit("data", Buffer.from("hello"));
  child.stderr.emit("data", Buffer.from("warn"));
  child.emit("exit", 0);

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(execFileCalled, false);
  assert.deepEqual(outputs, [
    { name: "stdout", value: "hello" },
    { name: "stderr", value: "warn" },
    { name: "exitcode", value: 0 },
  ]);
  assert.deepEqual(exits, [0]);
  assert.deepEqual(logs, ["hello", "warn"]);
});

test("runWrapper collects Terraform outputs after successful apply", async () => {
  const child = createChild();
  const outputs = [];
  const exits = [];

  runWrapper({
    consoleModule: { log: () => {} },
    coreModule: {
      setFailed: () => {},
      setOutput: (name, value) => outputs.push({ name, value }),
      warning: () => {},
    },
    cpModule: {
      execFile: (_command, _args, callback) =>
        callback(
          null,
          JSON.stringify({
            endpoint: { value: "example.com" },
          }),
          ""
        ),
      spawn: () => child,
    },
    env: { TERRAFORM_OUTPUT: "true" },
    exit: (code) => exits.push(code),
    argv: ["apply", "-auto-approve"],
  });

  child.stdout.emit("data", Buffer.from("apply output"));
  child.emit("exit", 0);

  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(outputs, [
    { name: "stdout", value: "apply output" },
    { name: "stderr", value: "" },
    { name: "exitcode", value: 0 },
    { name: "endpoint", value: "example.com" },
  ]);
  assert.deepEqual(exits, [0]);
});

test("runWrapper emits warning when terraform output -json is not valid JSON", async () => {
  const child = createChild();
  const exits = [];
  const warnings = [];

  runWrapper({
    consoleModule: { log: () => {} },
    coreModule: {
      setFailed: () => {},
      setOutput: () => {},
      warning: (msg) => warnings.push(msg),
    },
    cpModule: {
      execFile: (_command, _args, callback) =>
        callback(null, "not valid JSON at all", ""),
      spawn: () => child,
    },
    env: { TERRAFORM_OUTPUT: "true" },
    exit: (code) => exits.push(code),
    argv: ["apply"],
  });

  child.emit("exit", 0);

  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(exits, [0]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Failed to parse terraform output/);
});

test("runWrapper posts PR comment after plan command", async () => {
  const child = createChild();
  const outputs = [];
  const exits = [];
  const fetchCalls = [];

  runWrapper({
    consoleModule: { log: () => {} },
    coreModule: {
      setFailed: () => {},
      setOutput: (name, value) => outputs.push({ name, value }),
      warning: () => {},
    },
    cpModule: {
      execFile: () => {},
      spawn: () => child,
    },
    env: {
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REPOSITORY: "org/repo",
      GITHUB_EVENT_PATH: "/event.json",
      GITHUB_TOKEN: "gh-token",
      PR_COMMENT: "true",
    },
    exit: (code) => exits.push(code),
    argv: ["plan"],
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, method: (options && options.method) || "GET" });
      if (url.includes("/comments?")) {
        return { ok: true, json: async () => [] };
      }
      return { ok: true };
    },
    readEventFileImpl: () => JSON.stringify({ pull_request: { number: 42 } }),
  });

  child.stdout.emit("data", Buffer.from("Plan: 1 to add"));
  child.emit("exit", 0);

  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(exits, [0]);
  assert.deepEqual(outputs, [
    { name: "stdout", value: "Plan: 1 to add" },
    { name: "stderr", value: "" },
    { name: "exitcode", value: 0 },
  ]);
  assert.equal(fetchCalls.length, 2);
  assert.match(fetchCalls[0].url, /\/issues\/42\/comments\?/);
  assert.equal(fetchCalls[0].method, "GET");
  assert.match(fetchCalls[1].url, /\/issues\/42\/comments$/);
  assert.equal(fetchCalls[1].method, "POST");
});

test("runWrapper updates existing PR comment on re-run", async () => {
  const child = createChild();
  const exits = [];
  const fetchCalls = [];

  runWrapper({
    consoleModule: { log: () => {} },
    coreModule: {
      setFailed: () => {},
      setOutput: () => {},
      warning: () => {},
    },
    cpModule: {
      execFile: () => {},
      spawn: () => child,
    },
    env: {
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REPOSITORY: "org/repo",
      GITHUB_EVENT_PATH: "/event.json",
      GITHUB_TOKEN: "gh-token",
      PR_COMMENT: "true",
    },
    exit: (code) => exits.push(code),
    argv: ["plan"],
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, method: (options && options.method) || "GET" });
      if (url.includes("/comments?")) {
        return {
          ok: true,
          json: async () => [
            { id: 99, body: "<!-- scalr-action-plan -->\nold content" },
          ],
        };
      }
      return { ok: true };
    },
    readEventFileImpl: () => JSON.stringify({ pull_request: { number: 7 } }),
  });

  child.emit("exit", 0);

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(fetchCalls.length, 2);
  assert.match(fetchCalls[1].url, /\/issues\/comments\/99$/);
  assert.equal(fetchCalls[1].method, "PATCH");
});

test("runWrapper skips PR comment when not in a PR context", async () => {
  const child = createChild();
  const exits = [];
  const fetchCalls = [];

  runWrapper({
    consoleModule: { log: () => {} },
    coreModule: {
      setFailed: () => {},
      setOutput: () => {},
      warning: () => {},
    },
    cpModule: {
      execFile: () => {},
      spawn: () => child,
    },
    env: {
      GITHUB_EVENT_NAME: "push",
      GITHUB_REPOSITORY: "org/repo",
      GITHUB_TOKEN: "gh-token",
      PR_COMMENT: "true",
    },
    exit: (code) => exits.push(code),
    argv: ["plan"],
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, method: (options && options.method) || "GET" });
      return { ok: true, json: async () => [] };
    },
    readEventFileImpl: () => JSON.stringify({}),
  });

  child.emit("exit", 0);

  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(exits, [0]);
  assert.equal(fetchCalls.length, 0);
});

test("runWrapper reports terraform-bin spawn failures", async () => {
  const child = createChild();
  const failures = [];

  runWrapper({
    coreModule: {
      setFailed: (message) => failures.push(message),
      setOutput: () => {},
      warning: () => {},
    },
    cpModule: {
      execFile: () => {},
      spawn: () => child,
    },
    consoleModule: { log: () => {} },
    exit: () => {},
  });

  child.emit("error", new Error("missing"));

  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(failures, ["Unable to find terraform-bin in PATH"]);
});
