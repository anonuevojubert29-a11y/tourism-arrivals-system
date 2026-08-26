import React, { useState, useEffect } from "react";
import { KeyRound, Save, Settings as SettingsIcon } from "lucide-react";

export default function StaffSettings({ accommodation, onSave, onUpdateAccount, notify }) {
  const [form, setForm] = useState({
    name: accommodation.name || "", municipality: accommodation.municipality || "",
    address: accommodation.address || "", contactPerson: accommodation.contactPerson || "",
    contactNumber: accommodation.contactNumber || "", permitNumber: accommodation.permitNumber || "",
  });
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setForm({
      name: accommodation.name || "", municipality: accommodation.municipality || "",
      address: accommodation.address || "", contactPerson: accommodation.contactPerson || "",
      contactNumber: accommodation.contactNumber || "", permitNumber: accommodation.permitNumber || "",
    });
  }, [accommodation.id]);

  const set = (key) => (e) => setForm((value) => ({ ...value, [key]: e.target.value }));

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    await onSave({
      name: form.name.trim(), municipality: form.municipality.trim(), address: form.address.trim(),
      contactPerson: form.contactPerson.trim(), contactNumber: form.contactNumber.trim(), permitNumber: form.permitNumber.trim(),
    });
    setSaving(false);
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (!currentPassword || !newPassword) { notify("error", "Fill in both password fields."); return; }
    if (newPassword.length < 4) { notify("error", "New password must be at least 4 characters."); return; }
    if (newPassword !== confirmPassword) { notify("error", "New passwords do not match."); return; }
    setSavingPassword(true);
    const result = await onUpdateAccount({ currentPassword, newPassword });
    setSavingPassword(false);
    if (result.ok) {
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    }
    notify(result.ok ? "success" : "error", result.ok ? "Password changed." : (result.error || "Could not change password."));
  }

  return (
    <div className="tas-grid2">
      <div className="tas-card">
        <div className="tas-cardhead"><SettingsIcon size={15} /> Accommodation profile</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 14px" }}>Keep your establishment's details up to date. Changes are visible to the tourism office.</p>
        <form onSubmit={handleSave}>
          <div className="tas-field"><label>Accommodation name</label><input value={form.name} onChange={set("name")} required /></div>
          <div className="tas-grid2">
            <div className="tas-field"><label>Municipality / City</label><input value={form.municipality} onChange={set("municipality")} required /></div>
            <div className="tas-field"><label>Contact number</label><input value={form.contactNumber} onChange={set("contactNumber")} /></div>
          </div>
          <div className="tas-field"><label>Address</label><input value={form.address} onChange={set("address")} required /></div>
          <div className="tas-field"><label>Permit No.</label><input value={form.permitNumber} onChange={set("permitNumber")} required /></div>
          <div className="tas-field"><label>Contact person</label><input value={form.contactPerson} onChange={set("contactPerson")} /></div>
          <button className="btn btn-primary" type="submit" disabled={saving}><Save size={14} /> {saving ? "Saving…" : "Save changes"}</button>
        </form>
      </div>
      <div className="tas-card">
        <div className="tas-cardhead"><KeyRound size={15} /> Change password</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 14px" }}>You'll need your current password to set a new one.</p>
        <form onSubmit={handleChangePassword}>
          <div className="tas-field"><label>Current password</label><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
          <div className="tas-field"><label>New password</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          <div className="tas-field"><label>Confirm new password</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
          <button className="btn btn-primary" type="submit" disabled={savingPassword}><Save size={14} /> {savingPassword ? "Saving…" : "Change password"}</button>
        </form>
      </div>
    </div>
  );
}
