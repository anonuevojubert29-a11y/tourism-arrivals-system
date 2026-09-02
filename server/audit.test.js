import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAuditRecord, mapAuditLog, sanitizeAuditDetails, writeAuditLog,
} from "./audit.js";

function request(overrides = {}) {
  return {
    method: "PATCH",
    originalUrl: "/api/users/user-1",
    ip: "127.0.0.1",
    user: { id: "user-1", username: "admin", role: "superadmin" },
    get(name) { return name === "user-agent" ? "Audit test" : undefined; },
    ...overrides,
  };
}

test("buildAuditRecord captures actor and request context", () => {
  assert.deepEqual(
    buildAuditRecord(request(), {
      action: "user.updated",
      entityType: "user",
      entityId: "user-1",
      details: { changedFields: ["name"] },
    }),
    {
      actorUserId: "user-1",
      actorUsername: "admin",
      actorRole: "superadmin",
      action: "user.updated",
      entityType: "user",
      entityId: "user-1",
      method: "PATCH",
      route: "/api/users/user-1",
      details: '{"changedFields":["name"]}',
      ipAddress: "127.0.0.1",
      userAgent: "Audit test",
    }
  );
});

test("an explicit actor supports unauthenticated account flows", () => {
  const record = buildAuditRecord(request({ user: undefined }), {
    actor: { id: "new-user", username: "new-account", role: "staff" },
    action: "registration.created",
    entityType: "accommodation",
    entityId: "acc-1",
  });
  assert.equal(record.actorUserId, "new-user");
  assert.equal(record.actorUsername, "new-account");
  assert.equal(record.actorRole, "staff");
});

test("sensitive detail fields are recursively redacted", () => {
  assert.deepEqual(
    sanitizeAuditDetails({
      changedFields: ["password"],
      currentPassword: "do-not-store",
      nested: { resetToken: "do-not-store", safe: true },
    }),
    {
      changedFields: ["password"],
      currentPassword: "[REDACTED]",
      nested: { resetToken: "[REDACTED]", safe: true },
    }
  );
});

test("writeAuditLog rejects incomplete events", async () => {
  await assert.rejects(
    () => writeAuditLog({ query() {} }, request(), { action: "user.updated" }),
    /action and entityType/
  );
});

test("writeAuditLog uses parameterized values", async () => {
  let captured;
  const connection = {
    async query(sql, values) { captured = { sql, values }; },
  };
  await writeAuditLog(connection, request(), {
    action: "user.updated",
    entityType: "user",
    entityId: "user-1",
  });
  assert.match(captured.sql, /INSERT INTO audit_logs/);
  assert.equal(captured.values.length, 11);
  assert.equal(captured.values[3], "user.updated");
});

test("mapAuditLog parses JSON details", () => {
  const mapped = mapAuditLog({
    id: 4,
    actor_user_id: null,
    actor_username: "deleted-user",
    actor_role: "admin",
    action: "notification.deleted",
    entity_type: "notification",
    entity_id: "notification-1",
    method: "DELETE",
    route: "/api/notifications/notification-1",
    details: '{"count":1}',
    ip_address: null,
    user_agent: null,
    created_at: "2026-09-02 10:00:00",
  });
  assert.equal(mapped.id, "4");
  assert.deepEqual(mapped.details, { count: 1 });
});
