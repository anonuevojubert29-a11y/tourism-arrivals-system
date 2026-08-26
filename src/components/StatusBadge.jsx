import React from "react";

export default function StatusBadge({ status }) {
  const cls = status === "approved" ? "badge-approved" : status === "rejected" ? "badge-rejected" : "badge-pending";
  return <span className={`badge ${cls}`}>{status}</span>;
}
