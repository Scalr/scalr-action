const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const { runCommand, COMMAND_MAX_BUFFER } = require("../run-command");

test("runCommand returns stdout for small outputs", async () => {
  const stdout = await runCommand(process.execPath, [
    "-e",
    'process.stdout.write("hello world")',
  ]);
  assert.equal(stdout.toString(), "hello world");
});

test("runCommand allows outputs larger than Node's 1 MiB execFile default", async () => {
  // Generate roughly 2 MiB of stdout. The previous implementation, which
  // relied on the 1 MiB execFile default, would have failed here with
  // ERR_CHILD_PROCESS_STDIO_MAXBUFFER and truncated the output. With the
  // raised maxBuffer (CLOUD-4956), this should now succeed cleanly.
  const stdout = await runCommand(process.execPath, [
    "-e",
    "process.stdout.write('x'.repeat(2 * 1024 * 1024))",
  ]);
  assert.equal(stdout.length, 2 * 1024 * 1024);
});

test("runCommand translates ERR_CHILD_PROCESS_STDIO_MAXBUFFER into an actionable error", async () => {
  // Drive the child process past COMMAND_MAX_BUFFER to confirm the truncation
  // error gets re-thrown as a clear message instead of a partial dump.
  const scriptPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "scalr-action-test-")),
    "overflow.js"
  );
  fs.writeFileSync(
    scriptPath,
    `const chunk = "y".repeat(1024 * 1024);
const target = ${COMMAND_MAX_BUFFER + 8 * 1024 * 1024};
let written = 0;
function pump() {
  while (written < target) {
    if (!process.stdout.write(chunk)) {
      process.stdout.once("drain", pump);
      return;
    }
    written += chunk.length;
  }
}
pump();
`
  );

  await assert.rejects(
    runCommand(process.execPath, [scriptPath]),
    /produced more than \d+ bytes of output and was truncated/
  );

  fs.rmSync(path.dirname(scriptPath), { recursive: true, force: true });
});
