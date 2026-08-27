import React, { useState } from "react";
import { UserPlus, ShieldCheck } from "lucide-react";
import { createAdmin } from "../lib/data.js";

export default function AdminAccountsPanel({ users, setUsers, notify }) {
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "" });
  const admins = users.filter((u) => u.role === "admin" || u.role === "superadmin");

  async function handleCreateAdmin(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.username.trim() || !form.email.trim() || !form.password) {
      notify("error", "Please fill in all fields.");
      return;
    }
    if (form.password.length < 8) {
      notify("error", "Password must be at least 8 characters.");
      return;
    }
    const result = await createAdmin({ name: form.name.trim(), username: form.username.trim(), email: form.email.trim(), password: form.password });
    if (result.ok) {
      setUsers([...users, result.user]);
      notify(result.verificationSent ? "success" : "error", result.verificationSent ? "Admin created. A verification email was sent." : result.warning);
      setForm({ name: "", username: "", email: "", password: "" });
    } else {
      notify("error", result.error || "Could not save account.");
    }
  }

  return (
    <div className="tas-grid2">
      <div className="tas-card">
        <div className="tas-cardhead"><UserPlus size={15} /> Create admin account</div>
        <form onSubmit={handleCreateAdmin}>
          <div className="tas-field"><label>Full name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div className="tas-field"><label>Username</label><input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} /></div>
          <div className="tas-field"><label>Email address</label><input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
          <div className="tas-field"><label>Password</label><input type="password" minLength={8} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></div>
          <button className="btn btn-primary" type="submit"><UserPlus size={14} /> Create account</button>
        </form>
      </div>
      <div className="tas-card">
        <div className="tas-cardhead"><ShieldCheck size={15} /> Administrators ({admins.length})</div>
        <div className="table-scroll" role="region" aria-label="Administrator accounts" tabIndex="0">
        <table className="tas-table">
          <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>
            {admins.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="tas-mono" style={{ fontSize: 12 }}>{u.username}</td>
                <td>{u.email || "Not added"} {u.email && <span className={`badge ${u.emailVerified ? "badge-approved" : "badge-pending"}`}>{u.emailVerified ? "Verified" : "Pending"}</span>}</td>
                <td><span className="badge badge-role">{u.role}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
