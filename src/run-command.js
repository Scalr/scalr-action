const util = require("util");
const childProcess = require("child_process");

const execFile = util.promisify(childProcess.execFile);

async function runCommand(command, args) {
  try {
    const { stdout } = await execFile(command, args);
    return stdout;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  runCommand,
};
