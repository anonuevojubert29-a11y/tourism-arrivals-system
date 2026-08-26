import React, { useState } from "react";
import { LogIn, XCircle } from "lucide-react";
import Banner from "./Banner.jsx";

export default function LoginView({ onLogin, onSwitch, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo auth-logo-stacked">
          <img className="mark" src="/wadi1.png" alt="Wadi logo" />
          <h2 className="tas-display">Tourism Casiguran Arrivals System</h2>
        </div>
        <p className="auth-sub">Tourism arrivals monitoring system — sign in to continue.</p>
        {error && <Banner type="error" icon={XCircle}>{error}</Banner>}
        <form onSubmit={(e) => { e.preventDefault(); onLogin(username.trim(), password); }}>
          <div className="tas-field">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="tas-field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary btn-block auth-submit" style={{ marginTop: 6 }}>
            <LogIn size={15} /> Sign in
          </button>
        </form>
    
        <div className="auth-switch">
          New accommodation? <button onClick={onSwitch}>Register here</button>
        </div>
      </div>
    </div>
  );
}
