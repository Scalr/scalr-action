const test = require("node:test");
const assert = require("node:assert/strict");

const {
  exchangeIdTokenForScalrToken,
  extractAccessToken,
  normalizeHostname,
  resolveScalrTokenFromOidc,
} = require("../oidc");

function createCore() {
  const infoMessages = [];
  return {
    info: (message) => infoMessages.push(message),
    infoMessages,
  };
}

test("normalizeHostname strips protocol, whitespace, and trailing slashes", () => {
  assert.equal(normalizeHostname("  https://example.scalr.io/  "), "example.scalr.io");
  assert.equal(normalizeHostname("http://example.scalr.io"), "example.scalr.io");
  assert.equal(normalizeHostname("example.scalr.io"), "example.scalr.io");
  assert.equal(normalizeHostname(undefined), "");
});

test("extractAccessToken reads the token from supported response shapes", () => {
  assert.equal(extractAccessToken({ "access-token": "a" }), "a");
  assert.equal(extractAccessToken({ access_token: "b" }), "b");
  assert.equal(
    extractAccessToken({ data: { attributes: { "access-token": "c" } } }),
    "c"
  );
  assert.equal(extractAccessToken({}), "");
  assert.equal(extractAccessToken(null), "");
});

test("exchangeIdTokenForScalrToken posts the id token and returns the access token", async () => {
  const calls = [];
  const token = await exchangeIdTokenForScalrToken({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ "access-token": "scalr-token" }),
      };
    },
    hostname: "https://example.scalr.io/",
    idToken: "gh-oidc-token",
    serviceAccountEmail: "sa@example.com",
  });

  assert.equal(token, "scalr-token");
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://example.scalr.io/api/iacp/v3/service-accounts/assume"
  );
  assert.equal(calls[0].options.method, "POST");
  assert.equal(
    calls[0].options.headers["Content-Type"],
    "application/json"
  );
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    id_token: "gh-oidc-token",
    "service-account-email": "sa@example.com",
  });
});

test("exchangeIdTokenForScalrToken surfaces non-OK responses with the body", async () => {
  await assert.rejects(
    exchangeIdTokenForScalrToken({
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "assume policy conditions not met",
      }),
      hostname: "example.scalr.io",
      idToken: "gh-oidc-token",
      serviceAccountEmail: "sa@example.com",
    }),
    /HTTP 403\): assume policy conditions not met/
  );
});

test("exchangeIdTokenForScalrToken rejects when no token is present in the response", async () => {
  await assert.rejects(
    exchangeIdTokenForScalrToken({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ unexpected: true }),
      }),
      hostname: "example.scalr.io",
      idToken: "gh-oidc-token",
      serviceAccountEmail: "sa@example.com",
    }),
    /did not contain an access token/
  );
});

test("exchangeIdTokenForScalrToken validates required arguments", async () => {
  await assert.rejects(
    exchangeIdTokenForScalrToken({
      hostname: "",
      idToken: "t",
      serviceAccountEmail: "sa@example.com",
    }),
    /scalr_hostname is required/
  );
  await assert.rejects(
    exchangeIdTokenForScalrToken({
      hostname: "example.scalr.io",
      idToken: "",
      serviceAccountEmail: "sa@example.com",
    }),
    /GitHub OIDC ID token is required/
  );
  await assert.rejects(
    exchangeIdTokenForScalrToken({
      hostname: "example.scalr.io",
      idToken: "t",
      serviceAccountEmail: "",
    }),
    /scalr_service_account_email is required/
  );
});

test("resolveScalrTokenFromOidc requests an ID token and exchanges it", async () => {
  const coreModule = createCore();
  const idTokenCalls = [];

  const token = await resolveScalrTokenFromOidc({
    audience: "https://github.com/acme",
    coreModule,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ "access-token": "scalr-token" }),
    }),
    getIdTokenImpl: async (audience) => {
      idTokenCalls.push(audience);
      return "gh-oidc-token";
    },
    hostname: "example.scalr.io",
    serviceAccountEmail: "sa@example.com",
  });

  assert.equal(token, "scalr-token");
  assert.deepEqual(idTokenCalls, ["https://github.com/acme"]);
});

test("resolveScalrTokenFromOidc omits the audience when none is provided", async () => {
  const coreModule = createCore();
  const idTokenCalls = [];

  await resolveScalrTokenFromOidc({
    coreModule,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ "access-token": "scalr-token" }),
    }),
    getIdTokenImpl: async (...args) => {
      idTokenCalls.push(args);
      return "gh-oidc-token";
    },
    hostname: "example.scalr.io",
    serviceAccountEmail: "sa@example.com",
  });

  assert.deepEqual(idTokenCalls, [[]]);
});

test("resolveScalrTokenFromOidc wraps ID token request failures with guidance", async () => {
  const coreModule = createCore();
  await assert.rejects(
    resolveScalrTokenFromOidc({
      coreModule,
      fetchImpl: async () => {
        throw new Error("fetch should not run");
      },
      getIdTokenImpl: async () => {
        throw new Error("permission denied");
      },
      hostname: "example.scalr.io",
      serviceAccountEmail: "sa@example.com",
    }),
    /id-token: write.*permission denied/s
  );
});

test("resolveScalrTokenFromOidc requires a service account email", async () => {
  const coreModule = createCore();
  await assert.rejects(
    resolveScalrTokenFromOidc({
      coreModule,
      hostname: "example.scalr.io",
      serviceAccountEmail: "",
    }),
    /scalr_service_account_email is required/
  );
});
