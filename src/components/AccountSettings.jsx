import React, { useState } from "react";
import { UserCircle2, Save, KeyRound } from "lucide-react";

const ROLE_LABEL = { superadmin: "Super Admin", admin: "Admin", staff: "Accommodation Staff" };

export default function AccountSettings({ user, accommodation, onUpdateAccount, notify }) {
  const [name, setName] = useState(user.name || "");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function handleSaveName(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { notify("error", "Name cannot be empty."); return; }
    setSavingName(true);
    const result = await onUpdateAccount({ name: trimmed });
    setSavingName(false);
    notify(result.ok ? "success" : "error", result.ok ? "Name updated." : (result.error || "Could not update name."));
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      notify("error", "Fill in both password fields.");
      return;
    }
    if (newPassword.length < 8) {
      notify("error", "New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      notify("error", "New passwords do not match.");
      return;
    }
    setSavingPassword(true);
    const result = await onUpdateAccount({ currentPassword, newPassword });
    setSavingPassword(false);
    if (result.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    notify(result.ok ? "success" : "error", result.ok ? "Password changed." : (result.error || "Could not change password."));
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
      <div className="tas-card">
        <div className="tas-cardhead"><KeyRound size={15} /> Change password</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 14px" }}>
          Enter your current password before setting a new one.
        </p>
        <form onSubmit={handleChangePassword}>
          <div className="tas-field"><label>Current password</label><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div>
          <div className="tas-field"><label>New password</label><input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
          <div className="tas-field"><label>Confirm new password</label><input type="password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></div>
          <button className="btn btn-primary" type="submit" disabled={savingPassword}>
            <Save size={14} /> {savingPassword ? "Saving…" : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
}
