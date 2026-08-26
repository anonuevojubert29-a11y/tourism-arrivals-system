import React from "react";
import { AlertTriangle } from "lucide-react";

export default function Banner({ type, icon, children }) {
  const Icon = icon || AlertTriangle;
  return (
    <div className={`banner banner-${type}`}>
      <Icon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}
