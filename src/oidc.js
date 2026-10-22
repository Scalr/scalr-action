// Workload identity federation for GitHub Actions.
//
// Instead of a static `scalr_token`, the action can authenticate by exchanging
// a short-lived GitHub Actions OIDC ID token for a temporary Scalr access
// token. This mirrors the manual flow documented at
// https://docs.scalr.io/docs/identity-and-access-management#update-third-party
// (Generate GitHub Actions OIDC ID Token -> Exchange OIDC ID Token for Scalr
// Token) and abstracts it the way azure/login and
// aws-actions/configure-aws-credentials do for their platforms.

const ASSUME_PATH = "/api/iacp/v3/service-accounts/assume";

function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function extractAccessToken(payload) {
  if (!payload || typeof payload !== "object") return "";
  return (
    payload["access-token"] ||
    payload.access_token ||
    payload?.data?.attributes?.["access-token"] ||
    ""
  );
}

// Exchange a GitHub OIDC ID token for a temporary Scalr access token by calling
// the public `service-accounts/assume` endpoint.
async function exchangeIdTokenForScalrToken({
  hostname,
  idToken,
  serviceAccountEmail,
  fetchImpl = fetch,
}) {
  const normalizedHostname = normalizeHostname(hostname);
  if (!normalizedHostname) {
    throw new Error(
      "scalr_hostname is required to exchange an OIDC token for a Scalr token"
    );
  }
  if (!idToken) {
    throw new Error("A GitHub OIDC ID token is required for the exchange");
  }
  if (!serviceAccountEmail) {
    throw new Error(
      "scalr_service_account_email is required to exchange an OIDC token for a Scalr token"
    );
  }

  const url = `https://${normalizedHostname}${ASSUME_PATH}`;

  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_token: idToken,
        "service-account-email": serviceAccountEmail,
      }),
    });
  } catch (error) {
    throw new Error(
      `Failed to reach the Scalr token exchange endpoint: ${error.message}`
    );
  }

  const bodyText = await response.text();

  if (!response.ok) {
    const detail = bodyText || response.statusText || "";
    throw new Error(
      `Failed to exchange the OIDC token for a Scalr token (HTTP ${response.status})` +
        (detail ? `: ${detail}` : "")
    );
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new Error(
      "The Scalr token exchange response could not be parsed as JSON"
    );
  }

  const accessToken = extractAccessToken(payload);
  if (!accessToken) {
    throw new Error(
      "The Scalr token exchange response did not contain an access token"
    );
  }

  return accessToken;
}

// Obtain a Scalr token via GitHub OIDC: request an ID token from the runner,
// then exchange it for a short-lived Scalr access token.
async function resolveScalrTokenFromOidc({
  coreModule,
  hostname,
  serviceAccountEmail,
  audience,
  fetchImpl = fetch,
  getIdTokenImpl,
}) {
  if (!serviceAccountEmail) {
    throw new Error(
      "scalr_service_account_email is required to authenticate via GitHub OIDC workload identity federation"
    );
  }

  const getIdToken =
    getIdTokenImpl || ((aud) => coreModule.getIDToken(aud));

  coreModule.info(
    "No scalr_token provided; authenticating via GitHub OIDC workload identity federation"
  );

  let idToken;
  try {
    idToken = audience ? await getIdToken(audience) : await getIdToken();
  } catch (error) {
    throw new Error(
      "Failed to obtain a GitHub OIDC ID token. Ensure the workflow grants " +
        `'permissions: id-token: write': ${error.message}`
    );
  }

  const token = await exchangeIdTokenForScalrToken({
    fetchImpl,
    hostname,
    idToken,
    serviceAccountEmail,
  });

  coreModule.info(
    "Successfully exchanged the GitHub OIDC token for a Scalr token"
  );

  return token;
}

module.exports = {
  ASSUME_PATH,
  exchangeIdTokenForScalrToken,
  extractAccessToken,
  normalizeHostname,
  resolveScalrTokenFromOidc,
};
