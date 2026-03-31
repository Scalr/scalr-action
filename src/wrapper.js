#!/usr/bin/env node

const core = require("@actions/core");
const cp = require("child_process");

function shouldCollectTerraformOutputs({ code, terraformOutput, argv }) {
  if (code) return false;
  if (String(terraformOutput || "").toLowerCase() !== "true") return false;

  return argv[0] === "apply" || argv[1] === "apply";
}

function setCommandOutputs(coreModule, stdout, stderr, code) {
  coreModule.setOutput("stdout", stdout);
  coreModule.setOutput("stderr", stderr);
  coreModule.setOutput("exitcode", code);
}

function logChunk(consoleModule, chunk) {
  consoleModule.log(chunk.toString().trim());
}

function runWrapper({
  coreModule = core,
  cpModule = cp,
  argv = process.argv.slice(2),
  env = process.env,
  consoleModule = console,
  exit = process.exit.bind(process),
} = {}) {
  let stderr = "";
  let stdout = "";

  const child = cpModule.spawn("terraform-bin", argv);

  child.on("exit", function (code) {
    setCommandOutputs(coreModule, stdout, stderr, code);

    if (
      !shouldCollectTerraformOutputs({
        code,
        terraformOutput: env.TERRAFORM_OUTPUT,
        argv,
      })
    ) {
      exit(code);
      return;
    }

    cpModule.exec("terraform-bin output -json", (error, outputJson) => {
      if (error) {
        exit(code || 0);
        return;
      }

      const data = JSON.parse(outputJson);
      for (const prop in data) {
        coreModule.setOutput(prop, data[prop].value);
      }

      exit(0);
    });
  });

  child.on("error", function () {
    coreModule.setFailed("Unable to find terraform-bin in PATH");
  });

  child.stdout.on("data", (data) => {
    logChunk(consoleModule, data);
    stdout += data;
  });

  child.stderr.on("data", (data) => {
    logChunk(consoleModule, data);
    stderr += data;
  });

  return child;
}

if (require.main === module) {
  runWrapper();
}

module.exports = {
  runWrapper,
  setCommandOutputs,
  shouldCollectTerraformOutputs,
};
