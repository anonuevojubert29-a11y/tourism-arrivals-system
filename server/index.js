import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { rateLimit } from "express-rate-limit";
import { pool } from "./db.js";
import { isMailConfigured, sendPasswordResetEmail, sendVerificationEmail } from "./mail.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

if (!JWT_SECRET || (process.env.NODE_ENV === "production" && JWT_SECRET.length < 32)) {
  console.error("JWT_SECRET is required and must contain at least 32 characters in production.");
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1);

// Browsers omit a trailing slash from the Origin header. Normalise configured
// origins so values copied from a browser address bar still match, and allow
// the local Vite app while the server is running in development.
const allowedOrigins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const allowAnyOrigin = allowedOrigins.includes("*");
const isDevelopment = process.env.NODE_ENV !== "production";

app.use(cors({
  origin(origin, callback) {
    const normalizedOrigin = origin?.replace(/\/+$/, "");
    const isLocalOrigin = normalizedOrigin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin);
    const isAllowed = !origin
      || allowAnyOrigin
      || allowedOrigins.includes(normalizedOrigin)
      || (isDevelopment && isLocalOrigin);

    callback(isAllowed ? null : new Error(`Origin not allowed by CORS: ${origin}`), isAllowed);
  },
}));
app.use(express.json());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Please try again later." },
});

const emailActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many email requests. Please try again later." },
});

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashActionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createActionToken(connection, userId, tokenType, lifetimeMs) {
  const token = crypto.randomBytes(32).toString("hex");
  await connection.query(
    "DELETE FROM user_auth_tokens WHERE user_id = ? AND token_type = ? AND used_at IS NULL",
    [userId, tokenType]
  );
  await connection.query(
    "INSERT INTO user_auth_tokens (user_id, token_type, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    [userId, tokenType, hashActionToken(token), new Date(Date.now() + lifetimeMs)]
  );
  return token;
}

function requireMailService(res) {
  if (isMailConfigured()) return true;
  res.status(503).json({ error: "Email verification is temporarily unavailable. Please contact the system administrator." });
  return false;
}

// Wraps an async route handler so rejected promises reach the error
// middleware instead of hanging the request or crashing the process.
function ah(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

function mapAccommodation(row) {
  return {
    id: row.id,
    name: row.name,
    municipality: row.municipality,
    address: row.address,
    contactPerson: row.contact_person,
    contactNumber: row.contact_number,
    permitNumber: row.permit_number,
    email: row.account_email || "",
    emailVerified: Boolean(row.account_email_verified_at),
    username: row.account_username || "",
    status: row.status,
    fullyBooked: !!row.fully_booked,
    createdAt: row.created_at,
  };
}

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email || "",
    emailVerified: Boolean(row.email_verified_at),
    role: row.role,
    name: row.name,
    accommodationId: row.accommodation_id,
  };
}

function mapNotification(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    actionTab: row.action_tab || null,
    read: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

async function createNotification(connection, userId, type, title, message, actionTab = null) {
  await connection.query(
    `INSERT INTO notifications (id, user_id, type, title, message, action_tab)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [genId(), userId, type, title, message, actionTab]
  );
}

async function notifyRoles(connection, roles, type, title, message, actionTab = null) {
  const [users] = await connection.query("SELECT id FROM users WHERE role IN (?)", [roles]);
  for (const user of users) {
    await createNotification(connection, user.id, type, title, message, actionTab);
  }
}

function signToken(user, authVersion = 0) {
  return jwt.sign(
    { sub: user.id, ver: Number(authVersion) },
    JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: JWT_EXPIRES_IN,
      issuer: "tourism-arrivals-api",
      audience: "tourism-arrivals-web",
    }
  );
}

async function requireAuth(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "Authentication required." });

  let payload;
  try {
    payload = jwt.verify(match[1], JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "tourism-arrivals-api",
      audience: "tourism-arrivals-web",
    });
  } catch {
    return res.status(401).json({ error: "Your session is invalid or has expired. Please sign in again." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, username, email, email_verified_at, auth_version, role, name, accommodation_id FROM users WHERE id = ?",
      [payload.sub]
    );
    if (rows.length === 0) return res.status(401).json({ error: "Account no longer exists." });
    if (Number(payload.ver) !== Number(rows[0].auth_version)) {
      return res.status(401).json({ error: "Your session is no longer valid. Please sign in again." });
    }
    req.user = mapUser(rows[0]);
    next();
  } catch (error) {
    next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }
    next();
  };
}

function canAccessAccommodation(user, accommodationId) {
  return user.role !== "staff" || user.accommodationId === accommodationId;
}

app.get(
  "/health",
  ah(async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  })
);

/* ---------------------------- accommodations ---------------------------- */

app.get(
  "/api/accommodations",
  requireAuth,
  ah(async (req, res) => {
    const [rows] = req.user.role === "staff"
      ? await pool.query(
        `SELECT a.*, u.email AS account_email, u.email_verified_at AS account_email_verified_at,
                u.username AS account_username
         FROM accommodations a
         LEFT JOIN users u ON u.accommodation_id = a.id AND u.role = 'staff'
         WHERE a.id = ?`,
        [req.user.accommodationId]
      )
      : await pool.query(
        `SELECT a.*, u.email AS account_email, u.email_verified_at AS account_email_verified_at,
                u.username AS account_username
         FROM accommodations a
         LEFT JOIN users u ON u.accommodation_id = a.id AND u.role = 'staff'
         ORDER BY a.created_at DESC`
      );
    res.json(rows.map(mapAccommodation));
  })
);

app.delete(
  "/api/accommodations/:id",
  requireAuth,
  requireRole("superadmin"),
  ah(async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [accommodations] = await connection.query(
        "SELECT id FROM accommodations WHERE id = ? FOR UPDATE",
        [id]
      );
      if (accommodations.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Accommodation not found." });
      }
      // Delete linked users first. Deleting the accommodation first would set
      // their accommodation_id to NULL and leave orphaned login accounts.
      await connection.query("DELETE FROM users WHERE accommodation_id = ?", [id]);
      await connection.query("DELETE FROM accommodations WHERE id = ?", [id]);
      await connection.commit();
      res.status(204).end();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

app.patch(
  "/api/accommodations/:id",
  requireAuth,
  ah(async (req, res) => {
    const { id } = req.params;
    if (req.user.role === "staff") {
      if (req.user.accommodationId !== id) {
        return res.status(403).json({ error: "You can only update your own accommodation." });
      }
      if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
        return res.status(403).json({ error: "Accommodation staff cannot change approval status." });
      }
    } else if (req.user.role !== "superadmin") {
      return res.status(403).json({ error: "Only a super admin can update another accommodation." });
    }
    const [existingRows] = await pool.query("SELECT * FROM accommodations WHERE id = ?", [id]);
    if (existingRows.length === 0) return res.status(404).json({ error: "Accommodation not found" });
    const existing = existingRows[0];
    const columnByField = {
      name: "name",
      municipality: "municipality",
      address: "address",
      contactPerson: "contact_person",
      contactNumber: "contact_number",
      permitNumber: "permit_number",
      status: "status",
      fullyBooked: "fully_booked",
    };
    const sets = [];
    const values = [];
    for (const [field, column] of Object.entries(columnByField)) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        sets.push(`${column} = ?`);
        values.push(field === "fullyBooked" ? (req.body[field] ? 1 : 0) : req.body[field]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(`UPDATE accommodations SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);

      if (req.body.status && req.body.status !== existing.status) {
        const [staffUsers] = await connection.query(
          "SELECT id FROM users WHERE role = 'staff' AND accommodation_id = ?",
          [id]
        );
        const title = req.body.status === "approved"
          ? "Registration approved"
          : req.body.status === "rejected" ? "Registration not approved" : "Registration under review";
        const message = req.body.status === "approved"
          ? `${existing.name} was approved. You can now record tourism arrivals.`
          : req.body.status === "rejected"
            ? `${existing.name} was not approved. Contact the tourism office for details.`
            : `${existing.name} was returned to pending review.`;
        for (const user of staffUsers) {
          await createNotification(connection, user.id, "status", title, message, "settings");
        }
      }

      if (Object.prototype.hasOwnProperty.call(req.body, "fullyBooked")
          && Boolean(req.body.fullyBooked) !== Boolean(existing.fully_booked)) {
        await notifyRoles(
          connection,
          ["admin", "superadmin"],
          "booking",
          req.body.fullyBooked ? "Accommodation fully booked" : "Accommodation accepting guests",
          `${existing.name} is now ${req.body.fullyBooked ? "fully booked" : "accepting guests"}.`,
          "accommodations"
        );
      }

      const [rows] = await connection.query("SELECT * FROM accommodations WHERE id = ?", [id]);
      await connection.commit();
      res.json(mapAccommodation(rows[0]));
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

/* ---------------------------- notifications ---------------------------- */

app.get(
  "/api/notifications",
  requireAuth,
  ah(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT id, user_id, type, title, message, action_tab, is_read, created_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 200`,
      [req.user.id]
    );
    res.json(rows.map(mapNotification));
  })
);

app.patch(
  "/api/notifications/read-all",
  requireAuth,
  ah(async (req, res) => {
    await pool.query("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [req.user.id]);
    res.json({ ok: true });
  })
);

app.patch(
  "/api/notifications/:id/read",
  requireAuth,
  ah(async (req, res) => {
    const [result] = await pool.query(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Notification not found." });
    res.json({ ok: true });
  })
);

app.delete(
  "/api/notifications/:id",
  requireAuth,
  ah(async (req, res) => {
    const [result] = await pool.query(
      "DELETE FROM notifications WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Notification not found." });
    res.status(204).end();
  })
);

app.delete(
  "/api/notifications",
  requireAuth,
  ah(async (req, res) => {
    await pool.query("DELETE FROM notifications WHERE user_id = ?", [req.user.id]);
    res.status(204).end();
  })
);

/* ------------------------------ users / auth ----------------------------- */

app.get(
  "/api/users",
  requireAuth,
  requireRole("superadmin"),
  ah(async (req, res) => {
    const [rows] = await pool.query(
      "SELECT id, username, email, email_verified_at, role, name, accommodation_id FROM users ORDER BY created_at ASC"
    );
    res.json(rows.map(mapUser));
  })
);

app.post(
  "/api/users",
  requireAuth,
  requireRole("superadmin"),
  ah(async (req, res) => {
    const { name, username, email, password } = req.body || {};
    if (!name || !username || !email || !password) return res.status(400).json({ error: "All fields are required." });
    if (!requireMailService(res)) return;
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    const cleanName = String(name).trim();
    const cleanUsername = String(username).trim();
    const cleanEmail = normalizeEmail(email);
    if (!cleanName || !cleanUsername) return res.status(400).json({ error: "Missing fields" });
    if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: "Enter a valid email address." });
    const [existing] = await pool.query("SELECT username, email FROM users WHERE username = ? OR email = ?", [cleanUsername, cleanEmail]);
    if (existing.some((user) => user.username === cleanUsername)) return res.status(409).json({ error: "That username is already taken." });
    if (existing.some((user) => user.email === cleanEmail)) return res.status(409).json({ error: "That email address is already registered." });
    const passwordHash = await bcrypt.hash(password, 10);
    const id = genId();
    const connection = await pool.getConnection();
    let token;
    try {
      await connection.beginTransaction();
      await connection.query(
        "INSERT INTO users (id, username, email, password_hash, role, name) VALUES (?, ?, ?, ?, 'admin', ?)",
        [id, cleanUsername, cleanEmail, passwordHash, cleanName]
      );
      token = await createActionToken(connection, id, "verify_email", 24 * 60 * 60 * 1000);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    let verificationSent = true;
    try {
      await sendVerificationEmail(cleanEmail, token);
    } catch (error) {
      verificationSent = false;
      console.error("Admin verification email failed:", error);
    }
    const user = {
      id, username: cleanUsername, email: cleanEmail, emailVerified: false,
      role: "admin", name: cleanName, accommodationId: null,
    };
    res.status(201).json({
      user,
      verificationSent,
      ...(!verificationSent ? { warning: "Account created, but the verification email could not be sent. Use Resend verification after checking the email configuration." } : {}),
    });
  })
);

app.delete(
  "/api/users/:id",
  requireAuth,
  requireRole("superadmin"),
  ah(async (req, res) => {
    const { id } = req.params;
    if (req.user.id === id) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }
    const [users] = await pool.query(
      "SELECT id, role, accommodation_id FROM users WHERE id = ?",
      [id]
    );
    if (users.length === 0) return res.status(404).json({ error: "Account not found." });
    if (users[0].role === "superadmin") {
      return res.status(403).json({ error: "The super-admin account cannot be deleted." });
    }
    if (users[0].role === "staff" && users[0].accommodation_id) {
      return res.status(400).json({ error: "Remove this staff account from the Accommodations page." });
    }
    await pool.query("DELETE FROM users WHERE id = ?", [id]);
    res.status(204).end();
  })
);

app.patch(
  "/api/users/:id",
  requireAuth,
  ah(async (req, res) => {
    const { id } = req.params;
    if (req.user.id !== id) {
      return res.status(403).json({ error: "You can only update your own account." });
    }
    const { name, email, currentPassword, newPassword } = req.body || {};
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Account not found." });

    const sets = [];
    const values = [];
    let emailChanged = false;
    let passwordChanged = false;
    if (name) {
      const cleanName = String(name).trim();
      if (!cleanName) return res.status(400).json({ error: "Name cannot be empty." });
      sets.push("name = ?");
      values.push(cleanName);
    }
    if (email !== undefined) {
      const cleanEmail = normalizeEmail(email);
      if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: "Enter a valid email address." });
      if (cleanEmail !== (rows[0].email || "")) {
        if (!requireMailService(res)) return;
        const match = await bcrypt.compare(currentPassword || "", rows[0].password_hash);
        if (!match) return res.status(403).json({ error: "Current password is required to change your email." });
        const [existing] = await pool.query("SELECT id FROM users WHERE email = ? AND id <> ?", [cleanEmail, id]);
        if (existing.length > 0) return res.status(409).json({ error: "That email address is already registered." });
        sets.push("email = ?", "email_verified_at = NULL");
        values.push(cleanEmail);
        emailChanged = true;
      }
    }
    if (newPassword) {
      if (typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters." });
      }
      const match = await bcrypt.compare(currentPassword || "", rows[0].password_hash);
      if (!match) return res.status(403).json({ error: "Current password is incorrect." });
      sets.push("password_hash = ?");
      values.push(await bcrypt.hash(newPassword, 10));
      sets.push("auth_version = auth_version + 1");
      passwordChanged = true;
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    const connection = await pool.getConnection();
    let verificationToken;
    let updatedRow;
    try {
      await connection.beginTransaction();
      await connection.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
      if (emailChanged) {
        verificationToken = await createActionToken(connection, id, "verify_email", 24 * 60 * 60 * 1000);
      }
      const [updated] = await connection.query(
        "SELECT id, username, email, email_verified_at, auth_version, role, name, accommodation_id FROM users WHERE id = ?",
        [id]
      );
      updatedRow = updated[0];
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    let verificationSent = false;
    if (emailChanged) {
      try {
        await sendVerificationEmail(normalizeEmail(email), verificationToken);
        verificationSent = true;
      } catch (error) {
        console.error("Account verification email failed:", error);
      }
    }
    const user = mapUser(updatedRow);
    res.json({
      user,
      ...(passwordChanged ? { token: signToken(user, updatedRow.auth_version) } : {}),
      verificationSent,
      ...(emailChanged && !verificationSent ? { warning: "Email saved, but the verification message could not be sent. Check the email configuration, then use Resend verification." } : {}),
    });
  })
);

app.post(
  "/api/auth/login",
  loginLimiter,
  ah(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Missing credentials" });
    const cleanUsername = String(username).trim();
    if (!cleanUsername) return res.status(400).json({ error: "Missing credentials" });
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [cleanUsername]);
    if (rows.length === 0) return res.status(401).json({ error: "Invalid username or password." });
    const match = await bcrypt.compare(password, rows[0].password_hash);
    if (!match) return res.status(401).json({ error: "Invalid username or password." });
    if (rows[0].email && !rows[0].email_verified_at) {
      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        error: "Verify your email address before signing in. You can request a new verification link below.",
      });
    }
    const user = mapUser(rows[0]);
    res.json({ user, token: signToken(user, rows[0].auth_version) });
  })
);

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json(req.user);
});

app.post(
  "/api/auth/register",
  registrationLimiter,
  ah(async (req, res) => {
    const { accName, municipality, address, contactPerson, contactNumber, permitNumber, username, email, password } = req.body || {};
    if (!accName || !username || !email || !password) return res.status(400).json({ error: "All required fields must be completed." });
    if (!requireMailService(res)) return;
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    const cleanUsername = String(username).trim();
    const cleanAccName = String(accName).trim();
    const cleanEmail = normalizeEmail(email);
    if (!cleanUsername || !cleanAccName) return res.status(400).json({ error: "Missing fields" });
    if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: "Enter a valid email address." });
    const [existing] = await pool.query("SELECT username, email FROM users WHERE username = ? OR email = ?", [cleanUsername, cleanEmail]);
    if (existing.some((user) => user.username === cleanUsername)) return res.status(409).json({ error: "That username is already taken." });
    if (existing.some((user) => user.email === cleanEmail)) return res.status(409).json({ error: "That email address is already registered." });

    const accId = genId();
    const userId = genId();
    const passwordHash = await bcrypt.hash(password, 10);

    const connection = await pool.getConnection();
    let verificationToken;
    try {
      await connection.beginTransaction();
      await connection.query(
        `INSERT INTO accommodations (id, name, municipality, address, contact_person, contact_number, permit_number, status, fully_booked)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
        [accId, cleanAccName, municipality || "", address || "", contactPerson || "", contactNumber || "", permitNumber || ""]
      );
      await connection.query(
        "INSERT INTO users (id, username, email, password_hash, role, name, accommodation_id) VALUES (?, ?, ?, ?, 'staff', ?, ?)",
        [userId, cleanUsername, cleanEmail, passwordHash, contactPerson || cleanAccName, accId]
      );
      await createNotification(
        connection,
        userId,
        "status",
        "Registration submitted",
        `${cleanAccName} is waiting for approval from the tourism office.`,
        "settings"
      );
      await notifyRoles(
        connection,
        ["admin", "superadmin"],
        "registration",
        "New accommodation registration",
        `${cleanAccName} submitted a registration for review.`,
        "accommodations"
      );
      verificationToken = await createActionToken(connection, userId, "verify_email", 24 * 60 * 60 * 1000);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    let verificationSent = true;
    try {
      await sendVerificationEmail(cleanEmail, verificationToken);
    } catch (error) {
      verificationSent = false;
      console.error("Registration verification email failed:", error);
    }

    res.status(201).json({
      verificationRequired: true,
      verificationSent,
      email: cleanEmail,
      message: verificationSent
        ? "Registration submitted. Check your email to verify the account before signing in."
        : "Registration submitted, but the verification email could not be sent. Use Resend verification after the email service is configured.",
    });
  })
);

app.post(
  "/api/auth/verify-email",
  emailActionLimiter,
  ah(async (req, res) => {
    const token = String(req.body?.token || "");
    if (!token) return res.status(400).json({ error: "Verification token is required." });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [tokens] = await connection.query(
        `SELECT id, user_id FROM user_auth_tokens
         WHERE token_hash = ? AND token_type = 'verify_email' AND used_at IS NULL AND expires_at > NOW()
         FOR UPDATE`,
        [hashActionToken(token)]
      );
      if (tokens.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: "This verification link is invalid or has expired." });
      }
      await connection.query("UPDATE users SET email_verified_at = NOW() WHERE id = ?", [tokens[0].user_id]);
      await connection.query("UPDATE user_auth_tokens SET used_at = NOW() WHERE id = ?", [tokens[0].id]);
      await connection.query(
        "DELETE FROM user_auth_tokens WHERE user_id = ? AND token_type = 'verify_email' AND id <> ?",
        [tokens[0].user_id, tokens[0].id]
      );
      await connection.commit();
      res.json({ message: "Email verified. You can now sign in." });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

app.post(
  "/api/auth/resend-verification",
  emailActionLimiter,
  ah(async (req, res) => {
    if (!requireMailService(res)) return;
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    const [users] = await pool.query(
      "SELECT id, email_verified_at FROM users WHERE email = ?",
      [email]
    );
    if (users.length > 0 && !users[0].email_verified_at) {
      const connection = await pool.getConnection();
      let token;
      try {
        await connection.beginTransaction();
        token = await createActionToken(connection, users[0].id, "verify_email", 24 * 60 * 60 * 1000);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      await sendVerificationEmail(email, token);
    }
    res.json({ message: "If that address belongs to an unverified account, a new verification link has been sent." });
  })
);

app.post(
  "/api/auth/forgot-password",
  emailActionLimiter,
  ah(async (req, res) => {
    if (!requireMailService(res)) return;
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    const [users] = await pool.query(
      "SELECT id FROM users WHERE email = ? AND email_verified_at IS NOT NULL",
      [email]
    );
    if (users.length > 0) {
      const connection = await pool.getConnection();
      let token;
      try {
        await connection.beginTransaction();
        token = await createActionToken(connection, users[0].id, "reset_password", 60 * 60 * 1000);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      await sendPasswordResetEmail(email, token);
    }
    res.json({ message: "If a verified account uses that address, a password-reset link has been sent." });
  })
);

app.post(
  "/api/auth/reset-password",
  emailActionLimiter,
  ah(async (req, res) => {
    const token = String(req.body?.token || "");
    const newPassword = req.body?.newPassword;
    if (!token) return res.status(400).json({ error: "Reset token is required." });
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [tokens] = await connection.query(
        `SELECT id, user_id FROM user_auth_tokens
         WHERE token_hash = ? AND token_type = 'reset_password' AND used_at IS NULL AND expires_at > NOW()
         FOR UPDATE`,
        [hashActionToken(token)]
      );
      if (tokens.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: "This password-reset link is invalid or has expired." });
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await connection.query(
        "UPDATE users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?",
        [passwordHash, tokens[0].user_id]
      );
      await connection.query("UPDATE user_auth_tokens SET used_at = NOW() WHERE id = ?", [tokens[0].id]);
      await connection.query(
        "DELETE FROM user_auth_tokens WHERE user_id = ? AND token_type = 'reset_password' AND id <> ?",
        [tokens[0].user_id, tokens[0].id]
      );
      await connection.commit();
      res.json({ message: "Password changed. You can now sign in with your new password." });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

/* -------------------------------- arrivals -------------------------------- */

const VISIT_TYPES = ["overnight", "daytour"];

function isValidVisitType(v) {
  return VISIT_TYPES.includes(v);
}

async function loadArrivalWithForeign(arrivalRow) {
  const [foreign] = await pool.query(
    "SELECT country, male, female FROM arrival_foreign_entries WHERE arrival_id = ?",
    [arrivalRow.id]
  );
  return {
    accommodationId: arrivalRow.accommodation_id,
    date: arrivalRow.arrival_date,
    visitType: arrivalRow.visit_type,
    maleLocal: arrivalRow.male_local,
    femaleLocal: arrivalRow.female_local,
    maleDomestic: arrivalRow.male_domestic,
    femaleDomestic: arrivalRow.female_domestic,
    foreignEntries: foreign.map((f) => ({ country: f.country, male: f.male, female: f.female })),
  };
}

app.get(
  "/api/arrivals",
  requireAuth,
  ah(async (req, res) => {
    const { from, to, accommodationId, visitType } = req.query;
    const clauses = [];
    const values = [];
    if (from) {
      clauses.push("arrival_date >= ?");
      values.push(from);
    }
    if (to) {
      clauses.push("arrival_date <= ?");
      values.push(to);
    }
    if (req.user.role === "staff") {
      if (!req.user.accommodationId) {
        return res.status(403).json({ error: "Your account is not linked to an accommodation." });
      }
      clauses.push("accommodation_id = ?");
      values.push(req.user.accommodationId);
    } else if (accommodationId && accommodationId !== "all") {
      clauses.push("accommodation_id = ?");
      values.push(accommodationId);
    }
    if (visitType && visitType !== "all") {
      if (!isValidVisitType(visitType)) return res.status(400).json({ error: "Invalid visit type" });
      clauses.push("visit_type = ?");
      values.push(visitType);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await pool.query(`SELECT * FROM arrivals ${where} ORDER BY arrival_date ASC`, values);
    const records = await Promise.all(rows.map(loadArrivalWithForeign));
    res.json(records);
  })
);

app.get(
  "/api/arrivals/count",
  requireAuth,
  ah(async (req, res) => {
    const [rows] = req.user.role === "staff"
      ? await pool.query("SELECT COUNT(*) AS count FROM arrivals WHERE accommodation_id = ?", [req.user.accommodationId])
      : await pool.query("SELECT COUNT(*) AS count FROM arrivals");
    res.json({ count: rows[0].count });
  })
);

app.get(
  "/api/arrivals/:accommodationId/:visitType/:date",
  requireAuth,
  ah(async (req, res) => {
    const { accommodationId, visitType, date } = req.params;
    if (!canAccessAccommodation(req.user, accommodationId)) {
      return res.status(403).json({ error: "You can only view arrivals for your own accommodation." });
    }
    if (!isValidVisitType(visitType)) return res.status(400).json({ error: "Invalid visit type" });
    const [rows] = await pool.query(
      "SELECT * FROM arrivals WHERE accommodation_id = ? AND visit_type = ? AND arrival_date = ?",
      [accommodationId, visitType, date]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(await loadArrivalWithForeign(rows[0]));
  })
);

app.put(
  "/api/arrivals/:accommodationId/:visitType/:date",
  requireAuth,
  requireRole("staff"),
  ah(async (req, res) => {
    const { accommodationId, visitType, date } = req.params;
    if (req.user.accommodationId !== accommodationId) {
      return res.status(403).json({ error: "You can only save arrivals for your own accommodation." });
    }
    if (!isValidVisitType(visitType)) return res.status(400).json({ error: "Invalid visit type" });

    const [accommodationRows] = await pool.query(
      "SELECT name, status FROM accommodations WHERE id = ?",
      [accommodationId]
    );
    if (accommodationRows.length === 0) return res.status(404).json({ error: "Accommodation not found." });
    if (accommodationRows[0].status !== "approved") {
      return res.status(403).json({ error: "Your accommodation must be approved before recording arrivals." });
    }
    const {
      maleLocal = 0, femaleLocal = 0, maleDomestic = 0, femaleDomestic = 0, foreignEntries = [],
    } = req.body || {};

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existing] = await conn.query(
        "SELECT id FROM arrivals WHERE accommodation_id = ? AND visit_type = ? AND arrival_date = ?",
        [accommodationId, visitType, date]
      );

      let arrivalId;
      if (existing.length > 0) {
        arrivalId = existing[0].id;
        await conn.query(
          "UPDATE arrivals SET male_local=?, female_local=?, male_domestic=?, female_domestic=? WHERE id=?",
          [maleLocal, femaleLocal, maleDomestic, femaleDomestic, arrivalId]
        );
        await conn.query("DELETE FROM arrival_foreign_entries WHERE arrival_id = ?", [arrivalId]);
      } else {
        const [result] = await conn.query(
          `INSERT INTO arrivals (accommodation_id, arrival_date, visit_type, male_local, female_local, male_domestic, female_domestic)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [accommodationId, date, visitType, maleLocal, femaleLocal, maleDomestic, femaleDomestic]
        );
        arrivalId = result.insertId;
      }

      for (const entry of foreignEntries) {
        if (!entry.country) continue;
        await conn.query(
          "INSERT INTO arrival_foreign_entries (arrival_id, country, male, female) VALUES (?, ?, ?, ?)",
          [arrivalId, entry.country, entry.male || 0, entry.female || 0]
        );
      }

      const foreignTotal = foreignEntries.reduce(
        (sum, entry) => sum + Number(entry.male || 0) + Number(entry.female || 0),
        0
      );
      const total = Number(maleLocal) + Number(femaleLocal) + Number(maleDomestic) + Number(femaleDomestic) + foreignTotal;
      const visitLabel = visitType === "daytour" ? "day tour" : "overnight";
      const action = existing.length > 0 ? "updated" : "submitted";
      await notifyRoles(
        conn,
        ["admin", "superadmin"],
        "arrival",
        existing.length > 0 ? "Arrival report updated" : "New arrival report",
        `${accommodationRows[0].name} ${action} its ${visitLabel} arrivals for ${date}: ${total} visitor${total === 1 ? "" : "s"}.`,
        "overview"
      );

      await conn.commit();
      res.json({ ok: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ error: "That username or email address is already registered." });
  }
  if (["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EENVELOPE", "EMESSAGE", "EMAIL_API_ERROR"].includes(err.code)) {
    return res.status(502).json({ error: "The email could not be sent. Please try again later." });
  }
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Tourism arrivals API listening on http://localhost:${PORT}`);
});
