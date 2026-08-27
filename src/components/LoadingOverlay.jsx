import React from "react";

export default function LoadingOverlay({ visible, label = "Loading…" }) {
  if (!visible) return null;
  return (
    <div className="loading-overlay" role="status" aria-live="polite" aria-label={label}>
      <div className="loading-card">
        <div className="loading-orbit" aria-hidden="true"><span /><span /></div>
        <strong>{label}</strong>
        <small>Please wait a moment</small>
        <div className="loading-dots" aria-hidden="true"><i /><i /><i /></div>
      </div>
    </div>
  );
}
