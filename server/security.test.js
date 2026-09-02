import test from "node:test";
import assert from "node:assert/strict";
import {
  createCorsOptions, createCsrfGuard, createOriginPolicy, normalizeOrigin,
} from "./security.js";

function runGuard({ method = "POST", headers = {}, policy } = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  const req = {
    method,
    get(name) { return normalizedHeaders[name.toLowerCase()]; },
  };
  let response;
  let nextCalled = false;
  const res = {
    status(status) {
      response = { status };
      return this;
    },
    json(body) {
      response.body = body;
      return this;
    },
  };

  createCsrfGuard(policy)(req, res, () => { nextCalled = true; });
  return { nextCalled, response };
}

test("origin normalization removes paths and trailing slashes", () => {
  assert.equal(normalizeOrigin("https://example.com/some/path/"), "https://example.com");
});

test("production rejects missing or wildcard CORS origins", () => {
  assert.throws(() => createOriginPolicy({ configuredOrigins: "", nodeEnv: "production" }));
  assert.throws(() => createOriginPolicy({ configuredOrigins: "*", nodeEnv: "production" }));
});

test("development permits local Vite origins", () => {
  const policy = createOriginPolicy({ nodeEnv: "development" });
  assert.equal(policy.isAllowedOrigin("http://localhost:5173"), true);
  assert.equal(policy.isAllowedOrigin("http://127.0.0.1:5173"), true);
});

test("CORS only reflects explicitly allowed origins in production", () => {
  const policy = createOriginPolicy({ configuredOrigins: "https://app.example.com", nodeEnv: "production" });
  const options = createCorsOptions(policy);
  let allowed;
  options.origin("https://app.example.com", (_error, result) => { allowed = result; });
  assert.equal(allowed, true);
  options.origin("https://evil.example", (_error, result) => { allowed = result; });
  assert.equal(allowed, false);
});

test("safe requests do not require a CSRF header", () => {
  const policy = createOriginPolicy({ nodeEnv: "development" });
  assert.equal(runGuard({ method: "GET", policy }).nextCalled, true);
});

test("unsafe requests require the CSRF custom header", () => {
  const policy = createOriginPolicy({ nodeEnv: "development" });
  const result = runGuard({
    policy,
    headers: { Origin: "http://localhost:5173" },
  });
  assert.equal(result.nextCalled, false);
  assert.equal(result.response.status, 403);
});

test("unsafe requests reject untrusted origins", () => {
  const policy = createOriginPolicy({ configuredOrigins: "https://app.example.com", nodeEnv: "production" });
  const result = runGuard({
    policy,
    headers: { Origin: "https://evil.example", "X-CSRF-Protection": "1" },
  });
  assert.equal(result.nextCalled, false);
  assert.equal(result.response.body.error, "Request origin is not allowed.");
});

test("trusted cross-site frontend requests are allowed", () => {
  const policy = createOriginPolicy({ configuredOrigins: "https://app.example.com", nodeEnv: "production" });
  const result = runGuard({
    policy,
    headers: {
      Origin: "https://app.example.com",
      "Sec-Fetch-Site": "cross-site",
      "X-CSRF-Protection": "1",
    },
  });
  assert.equal(result.nextCalled, true);
});

test("unverified cross-site requests are rejected", () => {
  const policy = createOriginPolicy({ configuredOrigins: "https://app.example.com", nodeEnv: "production" });
  const result = runGuard({
    policy,
    headers: { "Sec-Fetch-Site": "cross-site", "X-CSRF-Protection": "1" },
  });
  assert.equal(result.nextCalled, false);
  assert.equal(result.response.body.error, "Cross-site request could not be verified.");
});
