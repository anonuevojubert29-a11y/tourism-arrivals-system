import test from "node:test";
import assert from "node:assert/strict";
import { schemas, validate } from "./validation.js";

test("login validation trims the username", () => {
  const result = schemas.login.parse({ username: "  admin  ", password: "secret123" });
  assert.equal(result.username, "admin");
});

test("registration rejects malformed email addresses", () => {
  const result = schemas.register.safeParse({
    accName: "Sample Hotel",
    username: "sample",
    email: "not-an-email",
    password: "password123",
  });
  assert.equal(result.success, false);
});

test("accommodation updates require at least one supported field", () => {
  assert.equal(schemas.accommodationPatch.safeParse({}).success, false);
});

test("sensitive account updates require the current password", () => {
  const result = schemas.userAccountPatch.safeParse({ newPassword: "newpassword123" });
  assert.equal(result.success, false);
  assert.equal(result.error.issues.some((issue) => issue.path[0] === "currentPassword"), true);
});

test("arrival queries reject reversed date ranges", () => {
  const result = schemas.arrivalQuery.safeParse({ from: "2026-09-02", to: "2026-09-01" });
  assert.equal(result.success, false);
});

test("audit log queries coerce and cap the result limit", () => {
  assert.equal(schemas.auditLogQuery.parse({ limit: "50" }).limit, 50);
  assert.equal(schemas.auditLogQuery.safeParse({ limit: "501" }).success, false);
});

test("arrival records accept valid whole-number counts", () => {
  const result = schemas.arrivalBody.safeParse({
    maleLocal: 4,
    femaleLocal: 3,
    maleDomestic: 2,
    femaleDomestic: 1,
    foreignEntries: [{ country: "Japan", male: 1, female: 2 }],
  });
  assert.equal(result.success, true);
});

test("arrival records reject negative and decimal counts", () => {
  assert.equal(schemas.arrivalBody.safeParse({ maleLocal: -1 }).success, false);
  assert.equal(schemas.arrivalBody.safeParse({ maleLocal: 1.5 }).success, false);
});

test("validation middleware returns field-level errors", () => {
  const middleware = validate({ body: schemas.login });
  const req = { body: { username: "", password: "" } };
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

  middleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Invalid request data.");
  assert.equal(response.body.details.some((detail) => detail.field === "body.username"), true);
});
