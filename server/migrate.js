import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });

  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  console.log("Running schema.sql (creates database + tables if missing)...");
  await connection.query(schema);
  // schema.sql ends with `USE tourism_arrivals;`, so this connection's
  // session is already pointed at the right database for what follows.

  const [permitNumberCol] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = 'tourism_arrivals' AND table_name = 'accommodations' AND column_name = 'permit_number'`
  );
  if (permitNumberCol[0].count === 0) {
    console.log("Adding permit number to accommodations...");
    await connection.query("ALTER TABLE accommodations ADD COLUMN permit_number VARCHAR(100) NULL AFTER contact_number");
  }

  const [visitTypeCol] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = 'tourism_arrivals' AND table_name = 'arrivals' AND column_name = 'visit_type'`
  );
  if (visitTypeCol[0].count === 0) {
    console.log("Upgrading existing arrivals table with visit_type (overnight vs day tour)...");
    await connection.query(
      "ALTER TABLE arrivals ADD COLUMN visit_type ENUM('overnight','daytour') NOT NULL DEFAULT 'overnight' AFTER arrival_date"
    );
  }

  if (visitTypeCol[0].count > 0) {
    // `CREATE TABLE IF NOT EXISTS` does not update an existing ENUM. Older
    // installations may therefore have a visit_type column that only accepts
    // overnight entries, causing day-tour saves to fail.
    const [visitTypeDefinition] = await connection.query(
      `SELECT column_type AS columnType FROM information_schema.columns
       WHERE table_schema = 'tourism_arrivals' AND table_name = 'arrivals' AND column_name = 'visit_type'`
    );
    if (!visitTypeDefinition[0].columnType.includes("'daytour'")) {
      console.log("Upgrading visit_type to allow day-tour entries...");
      await connection.query(
        "ALTER TABLE arrivals MODIFY COLUMN visit_type ENUM('overnight','daytour') NOT NULL DEFAULT 'overnight'"
      );
    }
  }

  const [arrivalIndexes] = await connection.query("SHOW INDEX FROM arrivals");
  const hasOldUniqueIndex = arrivalIndexes.some((index) => index.Key_name === "uniq_accommodation_date");
  const hasTypedUniqueIndex = arrivalIndexes.some((index) => index.Key_name === "uniq_accommodation_date_type");
  const hasForeignKeySupportIndex = arrivalIndexes.some((index) => index.Key_name === "idx_arrivals_accommodation_date_fk");

  if (hasOldUniqueIndex && !hasTypedUniqueIndex) {
    // A legacy foreign key can rely on this index. Add an equivalent ordinary
    // index first, then replace the old two-column uniqueness with the
    // correct uniqueness that includes the visit type.
    console.log("Updating arrival uniqueness so overnight and day tour can share a date...");
    if (!hasForeignKeySupportIndex) {
      await connection.query("ALTER TABLE arrivals ADD INDEX idx_arrivals_accommodation_date_fk (accommodation_id, arrival_date)");
    }
    await connection.query("ALTER TABLE arrivals DROP INDEX uniq_accommodation_date");
    await connection.query(
      "ALTER TABLE arrivals ADD UNIQUE KEY uniq_accommodation_date_type (accommodation_id, arrival_date, visit_type)"
    );
  }

  const [rows] = await connection.query("SELECT COUNT(*) AS count FROM users WHERE role = 'superadmin'");
  if (rows[0].count === 0) {
    const passwordHash = await bcrypt.hash("admin123", 10);
    await connection.query(
      "INSERT INTO users (id, username, password_hash, role, name) VALUES (?, ?, ?, 'superadmin', 'Super Admin')",
      [genId(), "superadmin", passwordHash]
    );
    console.log("Seeded default super admin: superadmin / admin123");
  } else {
    console.log("A super admin already exists, skipping seed.");
  }

  await connection.end();
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
