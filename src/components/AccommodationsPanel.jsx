import React from "react";
import { Building2, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import StatusBadge from "./StatusBadge.jsx";
import { updateAccommodation } from "../lib/data.js";

export default function AccommodationsPanel({ accommodations, setAccommodations, canManage, onViewDetails, notify }) {
  async function setStatus(id, status) {
    const ok = await updateAccommodation(id, { status });
    if (ok) setAccommodations(accommodations.map((a) => (a.id === id ? { ...a, status } : a)));
    notify(ok ? "success" : "error", ok ? `Accommodation ${status}.` : "Could not update status.");
  }

  return (
    <div className="tas-card">
      <div className="tas-cardhead"><Building2 size={15} /> Registered accommodations ({accommodations.length})</div>
      {accommodations.length === 0 ? (
        <div className="empty-state">No accommodations have registered yet.</div>
      ) : (
        <div className="table-scroll" role="region" aria-label="Registered accommodations" tabIndex="0">
        <table className="tas-table">
          <thead>
            <tr><th>Name</th><th>Municipality</th><th>Contact</th><th>Status</th><th>Availability</th><th></th></tr>
          </thead>
          <tbody>
            {accommodations.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.municipality}</td>
                <td style={{ fontSize: 12 }}>{a.contactPerson}{a.contactNumber ? ` · ${a.contactNumber}` : ""}</td>
                <td><StatusBadge status={a.status} /></td>
                <td>
                  {a.status === "approved" ? (
                    <span className={`badge ${a.fullyBooked ? "badge-full" : "badge-open"}`}>
                      {a.fullyBooked ? "Fully booked" : "Accepting guests"}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>
                  )}
                </td>
                <td>
                  <div className="table-actions">
                    {a.status === "approved" && (
                      <button className="btn btn-ghost btn-sm" onClick={() => onViewDetails(a.id)}>Details <ChevronRight size={13} /></button>
                    )}
                    {canManage && a.status !== "approved" && (
                      <button className="btn btn-outline btn-sm" onClick={() => setStatus(a.id, "approved")}><CheckCircle2 size={13} /> Approve</button>
                    )}
                    {canManage && a.status !== "rejected" && (
                      <button className="btn btn-danger btn-sm" onClick={() => setStatus(a.id, "rejected")}><XCircle size={13} /> Reject</button>
                    )}
                    {canManage && a.status === "rejected" && (
                      <button className="btn btn-outline btn-sm" onClick={() => setStatus(a.id, "pending")}>Reinstate</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
