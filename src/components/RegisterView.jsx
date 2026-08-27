import React, { useState } from "react";
import { UserPlus } from "lucide-react";

export default function RegisterView({ onRegister, onSwitch, error }) {
  const [form, setForm] = useState({
    accName: "", municipality: "", address: "", contactPerson: "", contactNumber: "", permitNumber: "",
    username: "", email: "", password: "", confirm: "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ width: 420 }}>
        <div className="auth-logo auth-logo-stacked">
          <img className="mark" src="/wadi1.png" alt="Wadi logo" />
          <h2 className="tas-display">Register accommodation</h2>
        </div>
        <p className="auth-sub">
          Create your establishment's account. You must verify your email, then a system
          administrator will review the accommodation before you can submit arrivals.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); onRegister(form); }}>
          <div className="tas-field"><label>Accommodation name</label><input value={form.accName} onChange={set("accName")} required /></div>
          <div className="tas-grid2">
            <div className="tas-field"><label>Municipality / City</label><input value={form.municipality} onChange={set("municipality")} required /></div>
            <div className="tas-field"><label>Contact number</label><input value={form.contactNumber} onChange={set("contactNumber")} /></div>
          </div>
          <div className="tas-field"><label>Address</label><input value={form.address} onChange={set("address")} required /></div>
          <div className="tas-field"><label>Permit No.</label><input value={form.permitNumber} onChange={set("permitNumber")} required /></div>
          <div className="tas-field"><label>Contact person</label><input value={form.contactPerson} onChange={set("contactPerson")} /></div>
          <div className="tas-field"><label>Email address</label><input type="email" autoComplete="email" value={form.email} onChange={set("email")} required /></div>
          <div className="tas-grid2">
            <div className="tas-field"><label>Staff username</label><input value={form.username} onChange={set("username")} required /></div>
            <div className="tas-field"><label>Password</label><input type="password" minLength={8} value={form.password} onChange={set("password")} required /></div>
          </div>
          <div className="tas-field"><label>Confirm password</label><input type="password" minLength={8} value={form.confirm} onChange={set("confirm")} required /></div>
          <button type="submit" className="btn btn-primary btn-block auth-submit" style={{ marginTop: 6 }}>
            <UserPlus size={15} /> Submit registration
          </button>
        </form>
        <div className="auth-switch">Already registered? <button onClick={onSwitch}>Sign in</button></div>
      </div>
    </div>
  );
}
