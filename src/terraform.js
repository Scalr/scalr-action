const os = require("os");
const fs = require("fs").promises;
const path = require("path");

const core = require("@actions/core");
const toolcache = require("@actions/tool-cache");
const io = require("@actions/io");
const {
  buildOpenTofuDownloadUrl,
  buildScalrCliDownloadUrl,
  buildTerraformDownloadUrl,
} = require("./download-url");
const { runCommand } = require("./run-command");
const {
  detectWorkspaceVersion,
  isAutoVersion,
  normalizeIacPlatform,
} = require("./terraform-version");
const { resolveWorkspaceIdByName } = require("./workspace");

function getPlatform(osModule = os) {
  return { win32: "windows" }[osModule.platform()] || osModule.platform();
}

function getArch(osModule = os) {
  return { x32: "386", x64: "amd64" }[osModule.arch()] || osModule.arch();
}

async function resolveLatestScalrCliVersion(fetchImpl = fetch) {
  const latest = await fetchImpl(
    "https://github.com/Scalr/scalr-cli/releases/latest",
    { method: "HEAD" }
  );

  if (!latest.ok) {
    throw new Error(
      `Failed to resolve latest Scalr CLI version: ${latest.status} ${latest.statusText}`
    );
  }

  return new URL(latest.url).pathname.split("/").pop().replace("v", "");
}

function getTerraformRcPath({ env = process.env, platform, iacPlatform }) {
  if (env.TF_CLI_CONFIG_FILE) return env.TF_CLI_CONFIG_FILE;

  const homeDir = getHomeDir({ env, osModule: os });

  return platform === "windows"
    ? `${env.APPDATA || homeDir}/${iacPlatform}.rc`
    : `${homeDir}/.${iacPlatform}rc`;
}

function getHomeDir({ env = process.env, osModule = os }) {
  if (env.HOME) return env.HOME;
  if (env.USERPROFILE) return env.USERPROFILE;
  if (env.HOMEDRIVE && env.HOMEPATH) return `${env.HOMEDRIVE}${env.HOMEPATH}`;
  return osModule.homedir();
}

function validateRequestedVersion(version) {
  if (version && isAutoVersion(version)) {
    throw new Error(
      "binary_version does not support auto/latest values; leave it empty and provide scalr_workspace for autodetect"
    );
  }
}

function validateWorkspaceInputs({
  workspace,
  workspaceName,
  environmentName,
}) {
  const hasWorkspaceId = Boolean(workspace);
  const hasWorkspaceName = Boolean(workspaceName);
  const hasEnvironmentName = Boolean(environmentName);

  if (hasWorkspaceId && (hasWorkspaceName || hasEnvironmentName)) {
    throw new Error(
      "Provide either scalr_workspace or both scalr_workspace_name and scalr_environment_name, not both"
    );
  }

  if (hasWorkspaceName !== hasEnvironmentName) {
    throw new Error(
      "Provide both scalr_workspace_name and scalr_environment_name to resolve a workspace by name"
    );
  }
}

function hclEscape(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getWrapperSourcePath(pathModule = path, entryFilePath) {
  const resolvedEntryFilePath =
    entryFilePath || process.argv[1] || pathModule.resolve(process.cwd(), "src", "terraform.js");
  const entryDir = pathModule.dirname(resolvedEntryFilePath);

  return pathModule.basename(entryDir) === "src"
    ? pathModule.resolve(entryDir, "wrapper.js")
    : pathModule.resolve(entryDir, "..", "wrapper", "index.js");
}

async function runAction({
  coreModule = core,
  toolcacheModule = toolcache,
  ioModule = io,
  fsModule = fs,
  pathModule = path,
  osModule = os,
  env = process.env,
  fetchImpl = fetch,
  detectWorkspaceVersionImpl = detectWorkspaceVersion,
  resolveWorkspaceIdByNameImpl = resolveWorkspaceIdByName,
  runCommandImpl = runCommand,
  buildOpenTofuDownloadUrlImpl = buildOpenTofuDownloadUrl,
  buildScalrCliDownloadUrlImpl = buildScalrCliDownloadUrl,
  buildTerraformDownloadUrlImpl = buildTerraformDownloadUrl,
  entryFilePath,
} = {}) {
  const hostname = coreModule.getInput("scalr_hostname", { required: true });
  const token = coreModule.getInput("scalr_token", { required: true });
  coreModule.setSecret(token);
  let workspace = coreModule.getInput("scalr_workspace");
  const workspaceName = coreModule.getInput("scalr_workspace_name");
  const environmentName = coreModule.getInput("scalr_environment_name");

  let iacPlatform = normalizeIacPlatform(coreModule.getInput("iac_platform"));
  let version =
    coreModule.getInput("binary_version") ||
    coreModule.getInput("terraform_version");
  const wrapper =
    coreModule.getInput("binary_wrapper") === "true" ||
    coreModule.getInput("terraform_wrapper") === "true";
  const output =
    coreModule.getInput("binary_output") || coreModule.getInput("terraform_output");
  const prComment = coreModule.getInput("pr_comment");

  validateRequestedVersion(version);
  validateWorkspaceInputs({ workspace, workspaceName, environmentName });

  const platform = getPlatform(osModule);
  const arch = getArch(osModule);

  coreModule.info("Fetch latest version of Scalr CLI");
  const scalrCliVersion = await resolveLatestScalrCliVersion(fetchImpl);
  const scalrCliUrl = buildScalrCliDownloadUrlImpl(
    scalrCliVersion,
    platform,
    arch
  );

  let scalrCliPath = toolcacheModule.find("scalr-cli", scalrCliVersion, arch);
  if (scalrCliPath) {
    coreModule.info(`Using cached Scalr CLI ${scalrCliVersion}`);
  } else {
    coreModule.info(
      `Downloading compressed Scalr CLI binary from ${scalrCliUrl}`
    );
    const scalrCliArchive = await toolcacheModule.downloadTool(scalrCliUrl);
    if (!scalrCliArchive) throw new Error("Failed to download Scalr CLI");

    coreModule.info("Decompressing Scalr CLI binary");
    scalrCliPath = await toolcacheModule.extractZip(scalrCliArchive);
    if (!scalrCliPath) throw new Error("Failed to decompress Scalr CLI");

    scalrCliPath = await toolcacheModule.cacheDir(
      scalrCliPath,
      "scalr-cli",
      scalrCliVersion,
      arch
    );
  }

  coreModule.info("Add Scalr CLI to PATH");
  coreModule.addPath(scalrCliPath);

  const homeDir = getHomeDir({ env, osModule });
  const scalrConfigPath = `${homeDir}/.scalr/scalr.conf`;
  coreModule.info(`Generating Scalr CLI credentials file at ${scalrConfigPath}`);
  await ioModule.mkdirP(pathModule.dirname(scalrConfigPath));
  await fsModule.writeFile(
    scalrConfigPath,
    JSON.stringify({ hostname, token }),
    { mode: 0o600 }
  );

  if (workspaceName && environmentName) {
    coreModule.info(
      `Resolving workspace ID for workspace '${workspaceName}' in environment '${environmentName}'`
    );
    workspace = await resolveWorkspaceIdByNameImpl({
      environmentName,
      spawnCommand: runCommandImpl,
      workspaceName,
    });
    coreModule.info(
      `Resolved workspace '${workspaceName}' in environment '${environmentName}' to ${workspace}`
    );
  }

  if (!version) {
    coreModule.info(
      "No OpenTofu/Terraform version specified. Will try to autodetect using Scalr CLI."
    );

    if (!workspace) {
      throw new Error(
        "Please specify workspace to autodetect OpenTofu/Terraform version"
      );
    }

    try {
      coreModule.info(
        `Fetching OpenTofu/Terraform version for workspace ${workspace}`
      );
      const detected = await detectWorkspaceVersionImpl({
        workspace,
        spawnCommand: runCommandImpl,
      });
      iacPlatform = detected.iacPlatform;
      version = detected.version;
      coreModule.info(`Resolved OpenTofu/Terraform version ${version}`);
    } catch (error) {
      throw new Error(
        `Unable to autodetect OpenTofu/Terraform version: ${error.message}`
      );
    }
  }

  let downloadUrl = "";
  if (iacPlatform === "terraform") {
    coreModule.info(`Preparing to download Terraform version ${version}`);
    downloadUrl = buildTerraformDownloadUrlImpl(version, platform, arch);
  } else {
    coreModule.info(`Preparing to download OpenTofu version ${version}`);
    downloadUrl = buildOpenTofuDownloadUrlImpl(version, platform, arch);
  }

  const binaryToolName = wrapper ? `${iacPlatform}-wrapped` : iacPlatform;
  let binaryPath = toolcacheModule.find(binaryToolName, version, arch);

  if (binaryPath) {
    coreModule.info(`Using cached ${iacPlatform} ${version}`);
  } else {
    coreModule.info(
      `Downloading compressed tofu/terraform binary from ${downloadUrl}`
    );
    const binaryArchive = await toolcacheModule.downloadTool(downloadUrl);
    if (!binaryArchive) throw new Error("Failed to download tofu/terraform");

    coreModule.info("Decompressing OpenTofu/Terraform binary");
    binaryPath = await toolcacheModule.extractZip(binaryArchive);
    if (!binaryPath) throw new Error("Failed to decompress tofu/terraform");

    if (wrapper) {
      coreModule.info("Rename tofu/terraform binary to make way for the wrapper");
      const exeSuffix = osModule.platform().startsWith("win") ? ".exe" : "";
      let source = [binaryPath, `${iacPlatform}${exeSuffix}`].join(pathModule.sep);
      let target = [binaryPath, `terraform-bin${exeSuffix}`].join(pathModule.sep);
      await ioModule.mv(source, target);

      coreModule.info(
        "Install wrapper to forward OpenTofu/Terraform output to future actions"
      );
      source = getWrapperSourcePath(pathModule, entryFilePath);
      target = [binaryPath, iacPlatform].join(pathModule.sep);
      await ioModule.cp(source, target);
    }

    binaryPath = await toolcacheModule.cacheDir(
      binaryPath,
      binaryToolName,
      version,
      arch
    );
  }

  coreModule.info("Add tofu/terraform to PATH");
  coreModule.addPath(binaryPath);

  const terraformRcPath = getTerraformRcPath({
    env,
    platform,
    iacPlatform,
  });
  coreModule.info(
    `Generating OpenTofu/Terraform credentials file at ${terraformRcPath}`
  );
  await ioModule.mkdirP(pathModule.dirname(terraformRcPath));
  await fsModule.writeFile(
    terraformRcPath,
    `credentials "${hclEscape(hostname)}" {\n  token = "${hclEscape(token)}"\n}`,
    { mode: 0o600 }
  );

  coreModule.exportVariable("TF_IN_AUTOMATION", "TRUE");
  coreModule.exportVariable("TERRAFORM_OUTPUT", output);
  coreModule.exportVariable("PR_COMMENT", prComment);

  return {
    arch,
    downloadUrl,
    iacPlatform,
    platform,
    scalrCliPath,
    scalrCliUrl,
    scalrCliVersion,
    terraformRcPath,
    version,
    workspace,
    wrapper,
  };
}

async function main(options = {}) {
  const coreModule = options.coreModule || core;

  try {
    return await runAction({ ...options, coreModule });
  } catch (error) {
    coreModule.setFailed(error.message);
    return null;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getTerraformRcPath,
  getHomeDir,
  getWrapperSourcePath,
  main,
  resolveLatestScalrCliVersion,
  runAction,
  validateWorkspaceInputs,
  validateRequestedVersion,
};
