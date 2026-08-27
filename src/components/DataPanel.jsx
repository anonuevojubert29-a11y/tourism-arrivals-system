import React, { useEffect, useState } from "react";
import { countArrivals } from "../lib/data.js";

export default function DataPanel({ users, accommodations }) {
  const [arrivalCount, setArrivalCount] = useState(null);

  useEffect(() => {
    countArrivals().then(setArrivalCount);
  }, []);

  const redactedUsers = users.map(({ password, ...rest }) => rest);

  return (
    <div>
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
