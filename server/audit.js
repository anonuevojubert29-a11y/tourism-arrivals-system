const MAX_LENGTHS = {
  username: 100,
  role: 20,
  action: 80,
  entityType: 50,
  entityId: 128,
  method: 10,
  route: 255,
  ipAddress: 45,
  userAgent: 500,
};

function bounded(value, maxLength) {
  if (value === undefined || value === null || value === "") return null;
  return String(value).slice(0, maxLength);
}

function requestIp(req) {
  return bounded(req.ip || req.socket?.remoteAddress, MAX_LENGTHS.ipAddress);
}

const SENSITIVE_KEY = /(password|token|authorization|cookie|secret)/i;

export function sanitizeAuditDetails(value) {
  if (Array.isArray(value)) return value.map(sanitizeAuditDetails);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeAuditDetails(item),
    ])
  );
}

export function buildAuditRecord(req, event) {
  const actor = event.actor || req.user || {};
  return {
    actorUserId: bounded(actor.id, 32),
    actorUsername: bounded(actor.username, MAX_LENGTHS.username),
    actorRole: bounded(actor.role, MAX_LENGTHS.role),
    action: bounded(event.action, MAX_LENGTHS.action),
    entityType: bounded(event.entityType, MAX_LENGTHS.entityType),
    entityId: bounded(event.entityId, MAX_LENGTHS.entityId),
    method: bounded(req.method, MAX_LENGTHS.method) || "UNKNOWN",
    route: bounded(req.originalUrl || req.url || req.path, MAX_LENGTHS.route) || "unknown",
    details: event.details && Object.keys(event.details).length > 0
      ? JSON.stringify(sanitizeAuditDetails(event.details))
      : null,
    ipAddress: requestIp(req),
    userAgent: bounded(req.get?.("user-agent"), MAX_LENGTHS.userAgent),
  };
}

export async function writeAuditLog(connection, req, event) {
  if (!event?.action || !event?.entityType) {
    throw new Error("Audit events require action and entityType.");
  }
  const record = buildAuditRecord(req, event);
  await connection.query(
    `INSERT INTO audit_logs
      (actor_user_id, actor_username, actor_role, action, entity_type, entity_id,
       method, route, details, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.actorUserId,
      record.actorUsername,
      record.actorRole,
      record.action,
      record.entityType,
      record.entityId,
      record.method,
      record.route,
      record.details,
      record.ipAddress,
      record.userAgent,
    ]
  );
}

export function mapAuditLog(row) {
  let details = null;
  if (row.details) {
    if (typeof row.details === "object") details = row.details;
    else {
      try {
        details = JSON.parse(row.details);
      } catch {
        details = null;
      }
    }
  }
  return {
    id: String(row.id),
    actorUserId: row.actor_user_id || null,
    actorUsername: row.actor_username || null,
    actorRole: row.actor_role || null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id || null,
    method: row.method,
    route: row.route,
    details,
    ipAddress: row.ip_address || null,
    userAgent: row.user_agent || null,
    createdAt: row.created_at,
  };
}
