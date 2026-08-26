import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { pool } from "./db.js";

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

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
    status: row.status,
    fullyBooked: !!row.fully_booked,
    createdAt: row.created_at,
  };
}

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    name: row.name,
    accommodationId: row.accommodation_id,
  };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id },
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
      "SELECT id, username, role, name, accommodation_id FROM users WHERE id = ?",
      [payload.sub]
    );
    if (rows.length === 0) return res.status(401).json({ error: "Account no longer exists." });
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
      ? await pool.query("SELECT * FROM accommodations WHERE id = ?", [req.user.accommodationId])
      : await pool.query("SELECT * FROM accommodations ORDER BY created_at DESC");
    res.json(rows.map(mapAccommodation));
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
    values.push(id);
    await pool.query(`UPDATE accommodations SET ${sets.join(", ")} WHERE id = ?`, values);
    const [rows] = await pool.query("SELECT * FROM accommodations WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Accommodation not found" });
    res.json(mapAccommodation(rows[0]));
  })
);

/* ------------------------------ users / auth ----------------------------- */

app.get(
  "/api/users",
  requireAuth,
  requireRole("superadmin"),
  ah(async (req, res) => {
    const [rows] = await pool.query(
      "SELECT id, username, role, name, accommodation_id FROM users ORDER BY created_at ASC"
    );
    res.json(rows.map(mapUser));
  })
);

app.post(
  "/api/users",
  requireAuth,
  requireRole("superadmin"),
  ah(async (req, res) => {
    const { name, username, password } = req.body || {};
    if (!name || !username || !password) return res.status(400).json({ error: "Missing fields" });
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    const cleanName = String(name).trim();
    const cleanUsername = String(username).trim();
    if (!cleanName || !cleanUsername) return res.status(400).json({ error: "Missing fields" });
    const [existing] = await pool.query("SELECT id FROM users WHERE username = ?", [cleanUsername]);
    if (existing.length > 0) return res.status(409).json({ error: "That username is already taken." });
    const passwordHash = await bcrypt.hash(password, 10);
    const id = genId();
    await pool.query(
      "INSERT INTO users (id, username, password_hash, role, name) VALUES (?, ?, ?, 'admin', ?)",
      [id, cleanUsername, passwordHash, cleanName]
    );
    res.status(201).json({ id, username: cleanUsername, role: "admin", name: cleanName, accommodationId: null });
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
    const { name, currentPassword, newPassword } = req.body || {};
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Account not found." });

    const sets = [];
    const values = [];
    if (name) {
      const cleanName = String(name).trim();
      if (!cleanName) return res.status(400).json({ error: "Name cannot be empty." });
      sets.push("name = ?");
      values.push(cleanName);
    }
    if (newPassword) {
      if (typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters." });
      }
      const match = await bcrypt.compare(currentPassword || "", rows[0].password_hash);
      if (!match) return res.status(403).json({ error: "Current password is incorrect." });
      sets.push("password_hash = ?");
      values.push(await bcrypt.hash(newPassword, 10));
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    values.push(id);
    await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, values);

    const [updated] = await pool.query(
      "SELECT id, username, role, name, accommodation_id FROM users WHERE id = ?",
      [id]
    );
    res.json(mapUser(updated[0]));
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
    const user = mapUser(rows[0]);
    res.json({ user, token: signToken(user) });
  })
);

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json(req.user);
});

app.post(
  "/api/auth/register",
  registrationLimiter,
  ah(async (req, res) => {
    const { accName, municipality, address, contactPerson, contactNumber, permitNumber, username, password } = req.body || {};
    if (!accName || !username || !password) return res.status(400).json({ error: "Missing fields" });
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    const cleanUsername = String(username).trim();
    const cleanAccName = String(accName).trim();
    if (!cleanUsername || !cleanAccName) return res.status(400).json({ error: "Missing fields" });
    const [existing] = await pool.query("SELECT id FROM users WHERE username = ?", [cleanUsername]);
    if (existing.length > 0) return res.status(409).json({ error: "That username is already taken." });

    const accId = genId();
    const userId = genId();
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO accommodations (id, name, municipality, address, contact_person, contact_number, permit_number, status, fully_booked)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
      [accId, cleanAccName, municipality || "", address || "", contactPerson || "", contactNumber || "", permitNumber || ""]
    );
    await pool.query(
      "INSERT INTO users (id, username, password_hash, role, name, accommodation_id) VALUES (?, ?, ?, 'staff', ?, ?)",
      [userId, cleanUsername, passwordHash, contactPerson || cleanAccName, accId]
    );

    const [accRows] = await pool.query("SELECT * FROM accommodations WHERE id = ?", [accId]);
    const [userRows] = await pool.query(
      "SELECT id, username, role, name, accommodation_id FROM users WHERE id = ?",
      [userId]
    );
    const user = mapUser(userRows[0]);
    res.status(201).json({
      accommodation: mapAccommodation(accRows[0]),
      user,
      token: signToken(user),
    });
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
      "SELECT status FROM accommodations WHERE id = ?",
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
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Tourism arrivals API listening on http://localhost:${PORT}`);
});
