import React from "react";
import { Plus, Minus } from "lucide-react";

export default function NumberField({ label, value, onChange }) {
  return (
    <div className="num-field">
      <span className="num-label">{label}</span>
      <div className="num-control">
        <button type="button" onClick={() => onChange(Math.max(0, (value || 0) - 1))}>
          <Minus size={13} />
        </button>
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10) || 0))}
        />
        <button type="button" onClick={() => onChange((value || 0) + 1)}>
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

// Label-less stepper, used when the Male/Female label is shown once above
// a pair of columns instead of once per row (see StaffEncode's sex-split).
export function PlainStepper({ value, onChange }) {
  return (
    <div className="num-control" style={{ justifyContent: "center" }}>
      <button type="button" onClick={() => onChange(Math.max(0, (value || 0) - 1))}>
        <Minus size={13} />
      </button>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10) || 0))}
      />
      <button type="button" onClick={() => onChange((value || 0) + 1)}>
        <Plus size={13} />
      </button>
    </div>
  );
}
