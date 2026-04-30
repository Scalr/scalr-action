const os = require("os");
const fs = require("fs").promises;
const core = require("@actions/core");

function getHomeDir({ env = process.env, osModule = os }) {
  if (env.HOME) return env.HOME;
  if (env.USERPROFILE) return env.USERPROFILE;
  if (env.HOMEDRIVE && env.HOMEPATH) return `${env.HOMEDRIVE}${env.HOMEPATH}`;
  return osModule.homedir();
}

function getTerraformRcPath({ env = process.env, platform, iacPlatform }) {
  if (env.TF_CLI_CONFIG_FILE) return env.TF_CLI_CONFIG_FILE;

  const homeDir = getHomeDir({ env, osModule: os });

  return platform === "windows"
    ? `${env.APPDATA || homeDir}/${iacPlatform}.rc`
    : `${homeDir}/.${iacPlatform}rc`;
}

async function removeFile(filePath) {
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cleanup({
  coreModule = core,
  env = process.env,
  osModule = os,
} = {}) {
  const homeDir = getHomeDir({ env, osModule });
  const platform = { win32: "windows" }[osModule.platform()] || osModule.platform();

  const scalrConfigPath = `${homeDir}/.scalr/scalr.conf`;
  if (await removeFile(scalrConfigPath)) {
    coreModule.info(`Removed Scalr credentials file: ${scalrConfigPath}`);
  }

  for (const iacPlatform of ["terraform", "tofu"]) {
    const rcPath = getTerraformRcPath({ env, platform, iacPlatform });
    if (await removeFile(rcPath)) {
      coreModule.info(`Removed credentials file: ${rcPath}`);
    }
  }
}

if (require.main === module) {
  cleanup().catch((error) => core.warning(`Cleanup failed: ${error.message}`));
}

module.exports = { cleanup };
