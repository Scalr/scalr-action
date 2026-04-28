const util = require("util");
const childProcess = require("child_process");

const execFile = util.promisify(childProcess.execFile);

// Node's default execFile maxBuffer is 1 MiB. JSON responses from the Scalr CLI
// (for example `get-workspaces` against an environment with hundreds of
// workspaces) can exceed that, which causes Node to reject with
// ERR_CHILD_PROCESS_STDIO_MAXBUFFER and truncate the captured output. Allow a
// generous limit so large responses succeed, and translate the truncation
// error into something actionable when it does happen.
const COMMAND_MAX_BUFFER = 100 * 1024 * 1024;

async function runCommand(command, args) {
  try {
    const { stdout } = await execFile(command, args, {
      maxBuffer: COMMAND_MAX_BUFFER,
    });
    return stdout;
  } catch (error) {
    if (error && error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      const wrapped = new Error(
        `Command '${command} ${args.join(" ")}' produced more than ${COMMAND_MAX_BUFFER} bytes of output and was truncated. ` +
          "Narrow the request (for example by passing the workspace ID input directly) or report this to Scalr support."
      );
      wrapped.cause = error;
      throw wrapped;
    }
    throw error;
  }
}

module.exports = {
  runCommand,
  COMMAND_MAX_BUFFER,
};
