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
    versions.find((item) => item?.attributes?.default) ||
    versions.find((item) => item?.attributes?.latest) ||
    versions[0];

  return normalizeVersion(defaultVersion?.attributes?.version);
}

function extractWorkspaceUsageVersion(payload, workspaceId) {
  const usages = Array.isArray(payload?.data) ? payload.data : [];
  const usage = usages.find(
    (item) => item?.relationships?.workspace?.data?.id === workspaceId
  );

  return normalizeVersion(usage?.attributes?.version);
}

function formatCommandError(error) {
  const stderr = normalizeVersion(error?.stderr?.toString());
  const stdout = normalizeVersion(error?.stdout?.toString());

  if (stderr) return stderr;
  if (stdout) return stdout;
  if (error?.message) return error.message;
  return "unknown error";
}

async function runScalrJsonCommand(spawnCommand, args) {
  try {
    const output = await spawnCommand("scalr", args);
    return JSON.parse(output.toString());
  } catch (error) {
    throw new Error(formatCommandError(error));
  }
}

async function detectWorkspaceUsageVersion({
  workspaceData,
  workspace,
  iacPlatform,
  spawnCommand,
}) {
  const environmentId = workspaceData?.relationships?.environment?.data?.id;
  const workspaceName = normalizeVersion(workspaceData?.name);

  if (!environmentId || !workspaceName) return "";

  const environmentData = await runScalrJsonCommand(spawnCommand, [
    "get-environment",
    `-environment=${environmentId}`,
  ]);

  const accountId = environmentData?.relationships?.account?.data?.id;
  if (!accountId) return "";

  const usageData = await runScalrJsonCommand(spawnCommand, [
    "list-terraform-versions-usage",
    `-filter-account=${accountId}`,
    `-filter-environment=${environmentId}`,
    `-filter-iac-platform=${
      iacPlatform === "tofu" ? "opentofu" : "terraform"
    }`,
    "-filter-is-auto=true",
    `-query=${workspaceName}`,
    "-include=workspace",
  ]);

  return extractWorkspaceUsageVersion(usageData, workspace);
}

async function detectWorkspaceVersion({ workspace, spawnCommand }) {
  const workspaceData = await runScalrJsonCommand(spawnCommand, [
    "get-workspace",
    `-workspace=${workspace}`,
  ]);

  const iacPlatform = normalizeIacPlatform(workspaceData["iac-platform"]);
  const version = normalizeVersion(workspaceData["terraform-version"]);

  if (!isAutoVersion(version)) return { iacPlatform, version };

  const usageVersion = await detectWorkspaceUsageVersion({
    workspaceData,
    workspace,
    iacPlatform,
    spawnCommand,
  });
  if (usageVersion) return { iacPlatform, version: usageVersion };

  const softwareType = iacPlatform === "tofu" ? "opentofu" : "terraform";
  const softwareVersions = await runScalrJsonCommand(spawnCommand, [
    "list-software-versions",
    `-filter-software-type=${softwareType}`,
    "-filter-status=active",
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
  extractWorkspaceUsageVersion,
  isAutoVersion,
  normalizeIacPlatform,
  normalizeVersion,
};
