import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";

dotenv.config();

const app = express();

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

/* ---------------------------- accommodations ---------------------------- */

app.get(
  "/api/accommodations",
  ah(async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM accommodations ORDER BY created_at DESC");
    res.json(rows.map(mapAccommodation));
  })
);

app.patch(
  "/api/accommodations/:id",
  ah(async (req, res) => {
    const { id } = req.params;
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
  ah(async (req, res) => {
    const [rows] = await pool.query(
      "SELECT id, username, role, name, accommodation_id FROM users ORDER BY created_at ASC"
    );
    res.json(rows.map(mapUser));
  })
);

app.post(
  "/api/users",
  ah(async (req, res) => {
    const { name, username, password } = req.body || {};
    if (!name || !username || !password) return res.status(400).json({ error: "Missing fields" });
    const [existing] = await pool.query("SELECT id FROM users WHERE username = ?", [username]);
    if (existing.length > 0) return res.status(409).json({ error: "That username is already taken." });
    const passwordHash = await bcrypt.hash(password, 10);
    const id = genId();
    await pool.query(
      "INSERT INTO users (id, username, password_hash, role, name) VALUES (?, ?, ?, 'admin', ?)",
      [id, username, passwordHash, name]
    );
    res.status(201).json({ id, username, role: "admin", name, accommodationId: null });
  })
);

app.patch(
  "/api/users/:id",
  ah(async (req, res) => {
    const { id } = req.params;
    const { name, currentPassword, newPassword } = req.body || {};
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Account not found." });

    const sets = [];
    const values = [];
    if (name) {
      sets.push("name = ?");
      values.push(name);
    }
    if (newPassword) {
      const match = await bcrypt.compare(currentPassword || "", rows[0].password_hash);
      if (!match) return res.status(401).json({ error: "Current password is incorrect." });
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
  ah(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Missing credentials" });
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
    if (rows.length === 0) return res.status(401).json({ error: "Invalid username or password." });
    const match = await bcrypt.compare(password, rows[0].password_hash);
    if (!match) return res.status(401).json({ error: "Invalid username or password." });
    res.json(mapUser(rows[0]));
  })
);

app.post(
  "/api/auth/register",
  ah(async (req, res) => {
    const { accName, municipality, address, contactPerson, contactNumber, permitNumber, username, password } = req.body || {};
    if (!accName || !username || !password) return res.status(400).json({ error: "Missing fields" });
    const [existing] = await pool.query("SELECT id FROM users WHERE username = ?", [username]);
    if (existing.length > 0) return res.status(409).json({ error: "That username is already taken." });

    const accId = genId();
    const userId = genId();
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO accommodations (id, name, municipality, address, contact_person, contact_number, permit_number, status, fully_booked)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
      [accId, accName, municipality || "", address || "", contactPerson || "", contactNumber || "", permitNumber || ""]
    );
    await pool.query(
      "INSERT INTO users (id, username, password_hash, role, name, accommodation_id) VALUES (?, ?, ?, 'staff', ?, ?)",
      [userId, username, passwordHash, contactPerson || accName, accId]
    );

    const [accRows] = await pool.query("SELECT * FROM accommodations WHERE id = ?", [accId]);
    const [userRows] = await pool.query(
      "SELECT id, username, role, name, accommodation_id FROM users WHERE id = ?",
      [userId]
    );
    res.status(201).json({ accommodation: mapAccommodation(accRows[0]), user: mapUser(userRows[0]) });
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
    if (accommodationId && accommodationId !== "all") {
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
  ah(async (req, res) => {
    const [rows] = await pool.query("SELECT COUNT(*) AS count FROM arrivals");
    res.json({ count: rows[0].count });
  })
);

app.get(
  "/api/arrivals/:accommodationId/:visitType/:date",
  ah(async (req, res) => {
    const { accommodationId, visitType, date } = req.params;
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
  ah(async (req, res) => {
    const { accommodationId, visitType, date } = req.params;
    if (!isValidVisitType(visitType)) return res.status(400).json({ error: "Invalid visit type" });
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
app.listen(PORT, () => {
  console.log(`Tourism arrivals API listening on http://localhost:${PORT}`);
});
