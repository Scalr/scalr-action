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
  return (
    normalized === "" ||
    normalized.toLowerCase() === "auto" ||
    normalized.toLowerCase() === "latest" ||
    normalized.toLowerCase() === "unknown"
  );
}

function getItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function extractDefaultSoftwareVersion(payload) {
  const versions = getItems(payload);
  const defaultVersion =
    versions.find((item) => item?.attributes?.latest || item?.latest) ||
    versions.find((item) => item?.attributes?.default || item?.default) ||
    versions.find((item) => item?.attributes?.latest) ||
    versions[0];

  return normalizeVersion(
    defaultVersion?.attributes?.version ?? defaultVersion?.version
  );
}

function extractWorkspaceUsageVersion(payload, workspaceId) {
  const usages = getItems(payload);
  const usage = usages.find(
    (item) =>
      item?.relationships?.workspace?.data?.id === workspaceId ||
      item?.workspace?.id === workspaceId
  );

  return normalizeVersion(usage?.attributes?.version ?? usage?.version);
}

function getWorkspaceEnvironmentId(workspaceData) {
  return (
    workspaceData?.environment?.id ||
    workspaceData?.relationships?.environment?.data?.id ||
    ""
  );
}

function getEnvironmentAccountId(environmentData) {
  return (
    environmentData?.account?.id ||
    environmentData?.relationships?.account?.data?.id ||
    ""
  );
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
  const environmentId = getWorkspaceEnvironmentId(workspaceData);

  if (!environmentId) return "";

  const environmentData = await runScalrJsonCommand(spawnCommand, [
    "get-environment",
    `-environment=${environmentId}`,
  ]);

  const accountId = getEnvironmentAccountId(environmentData);
  if (!accountId) return "";

  const usageData = await runScalrJsonCommand(spawnCommand, [
    "list-terraform-versions-usage",
    `-filter-account=${accountId}`,
    `-filter-environment=${environmentId}`,
    `-filter-iac-platform=${
      iacPlatform === "tofu" ? "opentofu" : "terraform"
    }`,
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
  if (usageVersion && !isAutoVersion(usageVersion)) {
    return { iacPlatform, version: usageVersion };
  }

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
  getEnvironmentAccountId,
  getItems,
  getWorkspaceEnvironmentId,
  isAutoVersion,
  normalizeIacPlatform,
  normalizeVersion,
};
