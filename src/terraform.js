const os = require("os");
const fs = require("fs").promises;
const path = require("path");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const axios = require("axios");
const spawn = require("await-spawn");

const core = require("@actions/core");
const toolcache = require("@actions/tool-cache");
const io = require("@actions/io");
const releases = require("@hashicorp/js-releases");
const { stdout } = require("process");

(async () => {
  try {
    const hostname = core.getInput("scalr_hostname", { required: true });
    const token = core.getInput("scalr_token", { required: true });
    const workspace = core.getInput("scalr_workspace");

    let iac_platform = core.getInput("iac_platform") || "terraform";
    if (iac_platform !== "tofu") iac_platform = "terraform";

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
    let latest = await axios.head(
      "https://github.com/scalr/scalr-cli/releases/latest"
    );
    let ver = new URL(latest.request.res.responseUrl).pathname
      .split("/")
      .pop()
      .replace("v", "");
    let url = `https://github.com/Scalr/scalr-cli/releases/download/v${ver}/scalr-cli_${ver}_${platform}_${arch}.zip`;

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

      let data;
      try {
        core.info(
          `Fetching OpenTofu/Terraform version for workspace ${workspace}`
        );
        data = await spawn("scalr", [
          "get-workspace",
          "-workspace=" + workspace,
        ]);

        data = JSON.parse(data.toString());

        iac_platform = data["iac-platform"];
        version = data["terraform-version"];
      } catch (e) {
        throw new Error("Unable to find specified workspace");
      }
    }

    let download_url = "";
    if (iac_platform === "terraform") {
      core.info(`Preparing to download Terraform version ${version}`);
      const release = await releases.getRelease("terraform", version);
      const build = release.getBuild(platform, arch);
      if (!build) throw new Error("No matching version found");
      download_url = build.url;
    } else {
      core.info(`Preparing to download OpenTofu version ${version}`);
      download_url = `https://github.com/opentofu/opentofu/releases/download/v${version}/tofu_${version}_${platform}_${arch}.zip`;
    }

    core.info(
      `Downloading compressed tofu/terraform binary from ${download_url}`
    );
    const zip = await toolcache.downloadTool(download_url);
    if (!zip) throw new Error("Failed to download tofu/terraform");

    core.info("Decompressing OpenTufu/Terraform binary");
    const cli = await toolcache.extractZip(zip);
    if (!cli) throw new Error("Failed to decompress tofu/terraform");

    core.info("Add toofu/terraform to PATH");
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
