function normalizeValue(value) {
  if (!value) return "";
  return String(value).trim();
}

function getItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function getWorkspaceId(item) {
  return normalizeValue(item?.id ?? item?.workspace?.id);
}

function getWorkspaceName(item) {
  return normalizeValue(item?.attributes?.name ?? item?.name);
}

function getEnvironmentName(item) {
  return normalizeValue(
    item?.environment?.name ??
      item?.attributes?.["environment-name"] ??
      item?.["environment-name"]
  );
}

function filterWorkspaceMatches(items, workspaceName, environmentName) {
  return items.filter((item) => {
    const itemWorkspaceName = getWorkspaceName(item);
    const itemEnvironmentName = getEnvironmentName(item);

    if (itemWorkspaceName && itemWorkspaceName !== workspaceName) return false;
    if (itemEnvironmentName && itemEnvironmentName !== environmentName) return false;
    return true;
  });
}

function formatCommandError(error) {
  const stderr = normalizeValue(error?.stderr?.toString());
  if (stderr) return stderr;

  const stdout = normalizeValue(error?.stdout?.toString());
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

async function resolveWorkspaceIdByName({
  workspaceName,
  environmentName,
  spawnCommand,
}) {
  const normalizedWorkspaceName = normalizeValue(workspaceName);
  const normalizedEnvironmentName = normalizeValue(environmentName);

  const payload = await runScalrJsonCommand(spawnCommand, [
    "get-workspaces",
    `-filter-environment-name=${normalizedEnvironmentName}`,
    `-filter-name=${normalizedWorkspaceName}`,
  ]);

  const workspaces = getItems(payload);
  const matchingWorkspaces = filterWorkspaceMatches(
    workspaces,
    normalizedWorkspaceName,
    normalizedEnvironmentName
  );
  const candidates = matchingWorkspaces.length > 0 ? matchingWorkspaces : workspaces;

  if (candidates.length === 0) {
    throw new Error(
      `No workspace named '${normalizedWorkspaceName}' found in environment '${normalizedEnvironmentName}'`
    );
  }

  if (candidates.length > 1) {
    throw new Error(
      `Multiple workspaces named '${normalizedWorkspaceName}' found in environment '${normalizedEnvironmentName}'; use scalr_workspace instead`
    );
  }

  const workspaceId = getWorkspaceId(candidates[0]);
  if (!workspaceId) {
    throw new Error(
      `Unable to resolve ID for workspace '${normalizedWorkspaceName}' in environment '${normalizedEnvironmentName}'`
    );
  }

  return workspaceId;
}

module.exports = {
  getEnvironmentName,
  getItems,
  getWorkspaceId,
  getWorkspaceName,
  resolveWorkspaceIdByName,
};
