#!/usr/bin/env node

const core = require("@actions/core");
const cp = require("child_process");
const fs = require("fs");

function shouldCollectTerraformOutputs({ code, terraformOutput, argv }) {
  if (code) return false;
  if (String(terraformOutput || "").toLowerCase() !== "true") return false;

  return argv[0] === "apply" || argv[1] === "apply";
}

function shouldPostPrComment({ prComment, argv }) {
  if (String(prComment || "").toLowerCase() !== "true") return false;
  return argv[0] === "plan" || argv[1] === "plan";
}

function setCommandOutputs(coreModule, stdout, stderr, code) {
  coreModule.setOutput("stdout", stdout);
  coreModule.setOutput("stderr", stderr);
  coreModule.setOutput("exitcode", code);
}

function logChunk(consoleModule, chunk) {
  consoleModule.log(chunk.toString().trim());
}

function formatPlanComment(stdout, stderr, exitcode) {
  const marker = "<!-- scalr-action-plan -->";
  const status = exitcode === 0 ? "succeeded" : `failed (exit code ${exitcode})`;
  const parts = [marker, `## Terraform Plan ${status}`, ""];

  if (stdout.trim()) {
    parts.push(
      "<details><summary>Show Plan Output</summary>",
      "",
      "```",
      stdout.trim(),
      "```",
      "",
      "</details>"
    );
  }

  if (stderr.trim()) {
    parts.push(
      "",
      "<details><summary>Show Errors</summary>",
      "",
      "```",
      stderr.trim(),
      "```",
      "",
      "</details>"
    );
  }

  return parts.join("\n");
}

async function postPlanComment({
  exitcode,
  stderr,
  stdout,
  env = process.env,
  fetchImpl = fetch,
  readEventFileImpl = (p) => fs.readFileSync(p, "utf8"),
  warn = () => {},
}) {
  const token = env.GITHUB_TOKEN;
  const eventName = env.GITHUB_EVENT_NAME;
  const repo = env.GITHUB_REPOSITORY;
  const eventPath = env.GITHUB_EVENT_PATH;
  const apiUrl = env.GITHUB_API_URL || "https://api.github.com";

  if (!token || !repo || !eventPath) return;
  if (eventName !== "pull_request" && eventName !== "pull_request_target") return;

  let prNumber;
  try {
    const eventData = JSON.parse(readEventFileImpl(eventPath));
    prNumber = eventData.pull_request && eventData.pull_request.number;
  } catch {
    return;
  }
  if (!prNumber) return;

  const [owner, repoName] = repo.split("/");
  const apiBase = `${apiUrl}/repos/${owner}/${repoName}`;
  const marker = "<!-- scalr-action-plan -->";
  const body = formatPlanComment(stdout, stderr, exitcode);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    const listResp = await fetchImpl(
      `${apiBase}/issues/${prNumber}/comments?per_page=100`,
      { headers }
    );
    if (listResp.ok) {
      const comments = await listResp.json();
      const existing = comments.find((c) => c.body && c.body.includes(marker));
      if (existing) {
        await fetchImpl(`${apiBase}/issues/comments/${existing.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ body }),
        });
        return;
      }
    }

    await fetchImpl(`${apiBase}/issues/${prNumber}/comments`, {
      method: "POST",
      headers,
      body: JSON.stringify({ body }),
    });
  } catch (e) {
    warn(`Failed to post PR plan comment: ${e.message}`);
  }
}

function collectTerraformOutputs(coreModule, cpModule) {
  return new Promise((resolve) => {
    cpModule.execFile(
      "terraform-bin",
      ["output", "-json"],
      (error, outputJson) => {
        if (error) {
          resolve();
          return;
        }
        try {
          const data = JSON.parse(outputJson);
          for (const prop in data) {
            coreModule.setOutput(prop, data[prop].value);
          }
        } catch (parseError) {
          coreModule.warning(
            `Failed to parse terraform output: ${parseError.message}`
          );
        }
        resolve();
      }
    );
  });
}

function runWrapper({
  coreModule = core,
  cpModule = cp,
  argv = process.argv.slice(2),
  env = process.env,
  consoleModule = console,
  exit = process.exit.bind(process),
  fetchImpl = fetch,
  readEventFileImpl = (p) => fs.readFileSync(p, "utf8"),
} = {}) {
  let stderr = "";
  let stdout = "";

  const child = cpModule.spawn("terraform-bin", argv);

  child.on("exit", async function (code) {
    setCommandOutputs(coreModule, stdout, stderr, code);

    if (
      shouldCollectTerraformOutputs({
        code,
        terraformOutput: env.TERRAFORM_OUTPUT,
        argv,
      })
    ) {
      await collectTerraformOutputs(coreModule, cpModule);
      exit(0);
      return;
    }

    if (shouldPostPrComment({ prComment: env.PR_COMMENT, argv })) {
      await postPlanComment({
        exitcode: code,
        env,
        fetchImpl,
        readEventFileImpl,
        stderr,
        stdout,
        warn: (msg) => coreModule.warning(msg),
      });
    }

    exit(code);
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
  formatPlanComment,
  runWrapper,
  setCommandOutputs,
  shouldCollectTerraformOutputs,
  shouldPostPrComment,
};
