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

  return platform === "windows"
    ? `${env.APPDATA}/${iacPlatform}.rc`
    : `${env.HOME}/.${iacPlatform}rc`;
}

function validateRequestedVersion(version) {
  if (version && isAutoVersion(version)) {
    throw new Error(
      "binary_version does not support auto/latest values; leave it empty and provide scalr_workspace for autodetect"
    );
  }
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
  runCommandImpl = runCommand,
  buildOpenTofuDownloadUrlImpl = buildOpenTofuDownloadUrl,
  buildScalrCliDownloadUrlImpl = buildScalrCliDownloadUrl,
  buildTerraformDownloadUrlImpl = buildTerraformDownloadUrl,
  entryFilePath,
} = {}) {
  const hostname = coreModule.getInput("scalr_hostname", { required: true });
  const token = coreModule.getInput("scalr_token", { required: true });
  const workspace = coreModule.getInput("scalr_workspace");

  let iacPlatform = normalizeIacPlatform(coreModule.getInput("iac_platform"));
  let version =
    coreModule.getInput("binary_version") ||
    coreModule.getInput("terraform_version");
  const wrapper =
    coreModule.getInput("binary_wrapper") === "true" ||
    coreModule.getInput("terraform_wrapper") === "true";
  const output =
    coreModule.getInput("binary_output") || coreModule.getInput("terraform_output");

  validateRequestedVersion(version);

  const platform = getPlatform(osModule);
  const arch = getArch(osModule);

  coreModule.info("Fetch latest version of Scalr CLI");
  const scalrCliVersion = await resolveLatestScalrCliVersion(fetchImpl);
  const scalrCliUrl = buildScalrCliDownloadUrlImpl(
    scalrCliVersion,
    platform,
    arch
  );

  coreModule.info(
    `Downloading compressed Scalr CLI binary from ${scalrCliUrl}`
  );
  const scalrCliArchive = await toolcacheModule.downloadTool(scalrCliUrl);
  if (!scalrCliArchive) throw new Error("Failed to download Scalr CLI");

  coreModule.info("Decompressing Scalr CLI binary");
  const scalrCliPath = await toolcacheModule.extractZip(scalrCliArchive);
  if (!scalrCliPath) throw new Error("Failed to decompress Scalr CLI");

  coreModule.info("Add Scalr CLI to PATH");
  coreModule.addPath(scalrCliPath);

  const scalrConfigPath = `${env.HOME}/.scalr/scalr.conf`;
  coreModule.info(`Generating Scalr CLI credentials file at ${scalrConfigPath}`);
  await ioModule.mkdirP(pathModule.dirname(scalrConfigPath));
  await fsModule.writeFile(
    scalrConfigPath,
    `{ "hostname": "${hostname}", "token": "${token}" }`
  );

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

  coreModule.info(
    `Downloading compressed tofu/terraform binary from ${downloadUrl}`
  );
  const binaryArchive = await toolcacheModule.downloadTool(downloadUrl);
  if (!binaryArchive) throw new Error("Failed to download tofu/terraform");

  coreModule.info("Decompressing OpenTofu/Terraform binary");
  const binaryPath = await toolcacheModule.extractZip(binaryArchive);
  if (!binaryPath) throw new Error("Failed to decompress tofu/terraform");

  coreModule.info("Add tofu/terraform to PATH");
  coreModule.addPath(binaryPath);

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
    `credentials "${hostname}" {\n  token = "${token}"\n}`
  );

  coreModule.exportVariable("TF_IN_AUTOMATION", "TRUE");
  coreModule.exportVariable("TERRAFORM_OUTPUT", output);

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
  getWrapperSourcePath,
  main,
  resolveLatestScalrCliVersion,
  runAction,
  validateRequestedVersion,
};
