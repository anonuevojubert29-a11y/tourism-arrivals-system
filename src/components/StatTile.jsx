import React from "react";
import { fmt } from "../lib/helpers.js";

export default function StatTile({ label, value, male, female, tone }) {
  return (
    <div className={`stat-tile ${tone || ""}`}>
      <div className="val tas-mono">{fmt(value)}</div>
      <div className="lbl">{label}</div>
      {male !== undefined && female !== undefined && (
        <div className="mf-split">
          <span className="mf-chip male">M {fmt(male)}</span>
          <span className="mf-chip female">F {fmt(female)}</span>
        </div>
      )}
    </div>
  );
}
