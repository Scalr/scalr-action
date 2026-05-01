function normalizeValue(value) {
  if (!value) return "";
  return String(value).trim();
}

function getItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function getEnvironmentId(item) {
  return normalizeValue(item?.id ?? item?.environment?.id);
}

function getWorkspaceId(item) {
  return normalizeValue(item?.id ?? item?.workspace?.id);
}

function getWorkspaceName(item) {
  return normalizeValue(item?.attributes?.name ?? item?.name);
}

function getName(item) {
  return normalizeValue(item?.attributes?.name ?? item?.name);
}

function getEnvironmentName(item) {
  return normalizeValue(
    item?.environment?.name ??
      item?.attributes?.["environment-name"] ??
      item?.["environment-name"] ??
      getName(item)
  );
}

function filterByName(items, name, getItemName) {
  return items.filter((item) => {
    const itemName = getItemName(item);
    if (!itemName) return false;
    return itemName === name;
  });
}

async function resolveEnvironmentIdByName({ environmentName, spawnCommand }) {
  const normalizedEnvironmentName = normalizeValue(environmentName);
  const payload = await runScalrJsonCommand(spawnCommand, [
    "list-environments",
    `-filter-name=${normalizedEnvironmentName}`,
  ]);

  const environments = getItems(payload);
  const candidates = filterByName(
    environments,
    normalizedEnvironmentName,
    getEnvironmentName
  );

  if (candidates.length === 0) {
    throw new Error(`No environment named '${normalizedEnvironmentName}' found`);
  }

  if (candidates.length > 1) {
    throw new Error(
      `Multiple environments named '${normalizedEnvironmentName}' found; use scalr_workspace instead`
    );
  }

  const environmentId = getEnvironmentId(candidates[0]);
  if (!environmentId) {
    throw new Error(
      `Unable to resolve ID for environment '${normalizedEnvironmentName}'`
    );
  }

  return environmentId;
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
  const environmentId = await resolveEnvironmentIdByName({
    environmentName: normalizedEnvironmentName,
    spawnCommand,
  });

  // Filter by name server-side as well as by environment. Without
  // `-filter-name` the CLI returns every workspace in the environment, which
  // can exceed the child-process output buffer for large environments and
  // truncate mid-stream (CLOUD-4956).
  const payload = await runScalrJsonCommand(spawnCommand, [
    "get-workspaces",
    `-filter-environment=${environmentId}`,
    `-filter-name=${normalizedWorkspaceName}`,
  ]);

  const workspaces = getItems(payload);
  const candidates = filterByName(
    workspaces,
    normalizedWorkspaceName,
    getWorkspaceName
  );

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
  getEnvironmentId,
  getEnvironmentName,
  getItems,
  getWorkspaceId,
  getWorkspaceName,
  resolveEnvironmentIdByName,
  resolveWorkspaceIdByName,
};
