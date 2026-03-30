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
  normalizeIacPlatform,
} = require("./terraform-version");

(async () => {
  try {
    const hostname = core.getInput("scalr_hostname", { required: true });
    const token = core.getInput("scalr_token", { required: true });
    const workspace = core.getInput("scalr_workspace");

    let iac_platform = normalizeIacPlatform(core.getInput("iac_platform"));

    let version =
      core.getInput("binary_version") || core.getInput("terraform_version");
    const wrapper =
      core.getInput("binary_wrapper") === "true" ||
      core.getInput("terraform_wrapper") === "true";
    const output =
      core.getInput("binary_output") || core.getInput("terraform_output");

    const platform = { win32: "windows" }[os.platform()] || os.platform();
    const arch = { x32: "386", x64: "amd64" }[os.arch()] || os.arch();

    core.info("Fetch latest version of Scalr CLI");
    const latest = await fetch(
      "https://github.com/Scalr/scalr-cli/releases/latest",
      { method: "HEAD" }
    );
    if (!latest.ok) {
      throw new Error(
        `Failed to resolve latest Scalr CLI version: ${latest.status} ${latest.statusText}`
      );
    }

    let ver = new URL(latest.url).pathname
      .split("/")
      .pop()
      .replace("v", "");
    let url = buildScalrCliDownloadUrl(ver, platform, arch);

    core.info(`Downloading compressed Scalr CLI binary from ${url}`);
    const zip2 = await toolcache.downloadTool(url);
    if (!zip2) throw new Error("Failed to download Scalr CLI");

    core.info("Decompressing Scalr CLI binary");
    const cli2 = await toolcache.extractZip(zip2);
    if (!cli2) throw new Error("Failed to decompress Scalr CLI");

    core.info("Add Scalr CLI to PATH");
    core.addPath(cli2);

    let conf = `${process.env.HOME}/.scalr/scalr.conf`;
    core.info(`Generating Scalr CLI credentials file at ${conf}`);
    await io.mkdirP(path.dirname(conf));
    await fs.writeFile(
      conf,
      `{ \"hostname\": \"${hostname}\", \"token\": \"${token}\" }`
    );

    if (!version) {
      core.info(
        "No OpenTofu/Terraform version specified. Will try to autodetect using Scalr CLI."
      );
      if (!workspace)
        throw new Error(
          "Please specify workspace to autodetect OpenTofu/Terraform version"
        );

      try {
        core.info(
          `Fetching OpenTofu/Terraform version for workspace ${workspace}`
        );
        const detected = await detectWorkspaceVersion({
          workspace,
          spawnCommand: runCommand,
        });
        iac_platform = detected.iacPlatform;
        version = detected.version;
        core.info(`Resolved OpenTofu/Terraform version ${version}`);
      } catch (e) {
        throw new Error(
          `Unable to autodetect OpenTofu/Terraform version: ${e.message}`
        );
      }
    }

    let download_url = "";
    if (iac_platform === "terraform") {
      core.info(`Preparing to download Terraform version ${version}`);
      download_url = buildTerraformDownloadUrl(version, platform, arch);
    } else {
      core.info(`Preparing to download OpenTofu version ${version}`);
      download_url = buildOpenTofuDownloadUrl(version, platform, arch);
    }

    core.info(
      `Downloading compressed tofu/terraform binary from ${download_url}`
    );
    const zip = await toolcache.downloadTool(download_url);
    if (!zip) throw new Error("Failed to download tofu/terraform");

    core.info("Decompressing OpenTofu/Terraform binary");
    const cli = await toolcache.extractZip(zip);
    if (!cli) throw new Error("Failed to decompress tofu/terraform");

    core.info("Add tofu/terraform to PATH");
    core.addPath(cli);

    if (wrapper) {
      core.info("Rename tofu/terraform binary to make way for the wrapper");
      const exeSuffix = os.platform().startsWith("win") ? ".exe" : "";
      let source = [cli, `${iac_platform}${exeSuffix}`].join(path.sep);
      let target = [cli, `terraform-bin${exeSuffix}`].join(path.sep);
      await io.mv(source, target);

      core.info(
        "Install wrapper to forward OpenTofu/Terraform output to future actions"
      );
      source = path.resolve(
        [__dirname, "..", "wrapper", "index.js"].join(path.sep)
      );
      target = [cli, iac_platform].join(path.sep);
      await io.cp(source, target);
    }

    let rc = process.env.TF_CLI_CONFIG_FILE;
    if (!rc)
      rc =
        platform == "windows"
          ? `${process.env.APPDATA}/${iac_platform}.rc`
          : `${process.env.HOME}/.${iac_platform}rc`;
    core.info(`Generating OpenTofu/Terraform credentials file at ${rc}`);
    await io.mkdirP(path.dirname(rc));
    await fs.writeFile(
      rc,
      `credentials \"${hostname}\" {\n  token = \"${token}\"\n}`
    );

    core.exportVariable("TF_IN_AUTOMATION", "TRUE");
    core.exportVariable("TERRAFORM_OUTPUT", output);
  } catch (error) {
    core.setFailed(error.message);
  }
})();
