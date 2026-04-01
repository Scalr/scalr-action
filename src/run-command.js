const util = require("util");
const childProcess = require("child_process");

const execFile = util.promisify(childProcess.execFile);

async function runCommand(command, args) {
  const { stdout } = await execFile(command, args);
  return stdout;
}

module.exports = {
  runCommand,
};
