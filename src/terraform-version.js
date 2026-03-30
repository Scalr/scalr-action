function normalizeIacPlatform(iacPlatform) {
  return iacPlatform === "tofu" || iacPlatform === "opentofu"
    ? "tofu"
    : "terraform";
}

function normalizeVersion(version) {
  if (version === undefined || version === null) return "";
  return String(version).trim();
}

function isAutoVersion(version) {
  const normalized = normalizeVersion(version);
  return normalized === "" || normalized.toLowerCase() === "auto";
}

function extractDefaultSoftwareVersion(payload) {
  const versions = Array.isArray(payload?.data) ? payload.data : [];
  const defaultVersion =
    versions.find((item) => item?.attributes?.default) || versions[0];

  return normalizeVersion(defaultVersion?.attributes?.version);
}

async function runScalrJsonCommand(spawnCommand, args) {
  const output = await spawnCommand("scalr", args);
  return JSON.parse(output.toString());
}

async function detectWorkspaceVersion({ workspace, spawnCommand }) {
  const workspaceData = await runScalrJsonCommand(spawnCommand, [
    "get-workspace",
    `-workspace=${workspace}`,
  ]);

  const iacPlatform = normalizeIacPlatform(workspaceData["iac-platform"]);
  const version = normalizeVersion(workspaceData["terraform-version"]);

  if (!isAutoVersion(version)) return { iacPlatform, version };

  const softwareType = iacPlatform === "tofu" ? "opentofu" : "terraform";
  const softwareVersions = await runScalrJsonCommand(spawnCommand, [
    "list-software-versions",
    `-filter[software-type]=${softwareType}`,
    "-filter[default]=true",
    "-filter[status]=active",
  ]);

  const resolvedVersion = extractDefaultSoftwareVersion(softwareVersions);
  if (!resolvedVersion) {
    const label = iacPlatform === "tofu" ? "OpenTofu" : "Terraform";
    throw new Error(`Unable to resolve default ${label} version`);
  }

  return { iacPlatform, version: resolvedVersion };
}

module.exports = {
  detectWorkspaceVersion,
  extractDefaultSoftwareVersion,
  isAutoVersion,
  normalizeIacPlatform,
  normalizeVersion,
};
