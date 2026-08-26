import React, { useEffect, useState } from "react";
import { Database } from "lucide-react";
import { backendMode, countArrivals } from "../lib/data.js";

export default function DataPanel({ users, accommodations }) {
  const [arrivalCount, setArrivalCount] = useState(null);

  useEffect(() => {
    countArrivals().then(setArrivalCount);
  }, []);

  const redactedUsers = users.map(({ password, ...rest }) => rest);

  return (
    <div>
      <div className="tas-card">
        <div className="tas-cardhead"><Database size={15} /> Where your data lives</div>
        {backendMode === "mysql" ? (
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
            This copy is connected to a real <b>MySQL database</b> through the API in{" "}
            <code>server/</code>. Every save — new accommodations, approvals, daily arrival
            entries — is written straight to the <code>accommodations</code>, <code>users</code>,{" "}
            <code>arrivals</code>, and <code>arrival_foreign_entries</code> tables. Passwords are
            stored as bcrypt hashes, not plain text. You can inspect the data directly with any
            MySQL client (e.g. <code>mysql -u root -p tourism_arrivals</code>) or a GUI like
            MySQL Workbench or TablePlus.
          </p>
        ) : backendMode === "local" ? (
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
            This copy is running without a configured database, so everything is stored in this
            browser's <code>localStorage</code> — nothing is sent to a server. You can inspect it
            directly: open DevTools (F12, or right-click → Inspect), go to the <b>Application</b>{" "}
            tab in Chrome/Edge (or <b>Storage</b> in Firefox), then <b>Local Storage → this site</b>.
            To connect a real MySQL database instead, see the "Connecting MySQL" section of the
            project README.
          </p>
        ) : (
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
            This copy is running inside a Claude artifact, so data is stored via the artifact's
            shared key-value storage — visible to anyone who opens this artifact.
          </p>
        )}
      </div>

      <div className="tas-grid2">
        <div className="tas-card">
          <div className="tas-cardhead">Users ({redactedUsers.length})</div>
          <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "0 0 8px" }}>Passwords hidden below.</p>
          <pre className="tas-json">{JSON.stringify(redactedUsers, null, 2)}</pre>
        </div>
        <div className="tas-card">
          <div className="tas-cardhead">Accommodations ({accommodations.length})</div>
          <pre className="tas-json">{JSON.stringify(accommodations, null, 2)}</pre>
        </div>
      </div>

      <div className="tas-card">
        <div className="tas-cardhead">Arrival records</div>
        {arrivalCount === null ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <p style={{ fontSize: 13 }}>
            <b>{arrivalCount}</b> daily arrival record{arrivalCount === 1 ? "" : "s"} stored
            across all accommodations.
          </p>
        )}
      </div>
    </div>
  );
}
