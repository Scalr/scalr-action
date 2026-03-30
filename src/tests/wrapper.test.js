const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  runWrapper,
  setCommandOutputs,
  shouldCollectTerraformOutputs,
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

test("runWrapper exits without collecting Terraform outputs for non-apply commands", async () => {
  const child = createChild();
  const outputs = [];
  const exits = [];
  const logs = [];
  let execCalled = false;

  runWrapper({
    consoleModule: { log: (message) => logs.push(message) },
    coreModule: {
      setFailed: () => {},
      setOutput: (name, value) => outputs.push({ name, value }),
    },
    cpModule: {
      exec: () => {
        execCalled = true;
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

  assert.equal(execCalled, false);
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
    },
    cpModule: {
      exec: (_command, callback) =>
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

test("runWrapper reports terraform-bin spawn failures", async () => {
  const child = createChild();
  const failures = [];

  runWrapper({
    coreModule: {
      setFailed: (message) => failures.push(message),
      setOutput: () => {},
    },
    cpModule: {
      exec: () => {},
      spawn: () => child,
    },
    consoleModule: { log: () => {} },
    exit: () => {},
  });

  child.emit("error", new Error("missing"));

  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(failures, ["Unable to find terraform-bin in PATH"]);
});
