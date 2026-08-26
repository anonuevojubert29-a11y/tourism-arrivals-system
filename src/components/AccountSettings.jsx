import React, { useState } from "react";
import { UserCircle2, Save } from "lucide-react";

const ROLE_LABEL = { superadmin: "Super Admin", admin: "Admin", staff: "Accommodation Staff" };

export default function AccountSettings({ user, accommodation, onUpdateAccount, notify }) {
  const [name, setName] = useState(user.name || "");
  const [savingName, setSavingName] = useState(false);

  async function handleSaveName(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { notify("error", "Name cannot be empty."); return; }
    setSavingName(true);
    const result = await onUpdateAccount({ name: trimmed });
    setSavingName(false);
    notify(result.ok ? "success" : "error", result.ok ? "Name updated." : (result.error || "Could not update name."));
  }

  return (
    <div>
      <div className="tas-pagehead">
        <div><h1>My account</h1><p>Manage your login details</p></div>
      </div>
      <div className="tas-card">
        <div className="tas-cardhead"><UserCircle2 size={15} /> Profile</div>
        <form onSubmit={handleSaveName}>
          <div className="tas-field"><label>Full name</label><input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="tas-field"><label>Username</label><input value={user.username} disabled /></div>
          <div className="tas-field"><label>Role</label><input value={ROLE_LABEL[user.role] || user.role} disabled /></div>
          {accommodation && <div className="tas-field"><label>Accommodation</label><input value={accommodation.name} disabled /></div>}
          <button className="btn btn-primary" type="submit" disabled={savingName}>
            <Save size={14} /> {savingName ? "Saving…" : "Save name"}
          </button>
        </form>
      </div>
    </div>
  );
}
