import React, { useState } from "react";
import { KeyRound, Mail, Send } from "lucide-react";
import FeedbackDialog from "./FeedbackDialog.jsx";

function AuthShell({ title, subtitle, children, onBack }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo auth-logo-stacked">
          <img className="mark" src="/wadi1.png" alt="Wadi logo" />
          <h2 className="tas-display">{title}</h2>
        </div>
        <p className="auth-sub">{subtitle}</p>
        {children}
        <div className="auth-switch"><button type="button" onClick={onBack}>Back to sign in</button></div>
      </div>
    </div>
  );
}

export function EmailRequestView({ mode, onSubmit, onBack }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const isReset = mode === "forgot";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await onSubmit(email.trim());
      setMessage(result.message);
    } catch (err) {
      setError(err.message || "The email could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={isReset ? "Forgot password" : "Resend verification"}
      subtitle={isReset
        ? "Enter your verified email address and we will send a one-time reset link."
        : "Enter the email address used when the account was registered."}
      onBack={onBack}
    >
      <FeedbackDialog type={error ? "error" : "success"} message={error || message} onClose={() => { setError(""); setMessage(""); }} />
      <form onSubmit={submit}>
        <div className="tas-field">
          <label>Email address</label>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <button type="submit" className="btn btn-primary btn-block auth-submit" disabled={busy}>
          <Send size={15} /> {busy ? "Sendingâ€¦" : isReset ? "Send reset link" : "Send verification link"}
        </button>
      </form>
    </AuthShell>
  );
}

export function VerifyEmailView({ token, onVerify, onBack }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    setError("");
    try {
      const result = await onVerify(token);
      setMessage(result.message);
    } catch (err) {
      setError(err.message || "This verification link could not be used.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Verify your email" subtitle="Confirm this email address to activate your account." onBack={onBack}>
      <FeedbackDialog type={error ? "error" : "success"} message={error || message} onClose={() => { setError(""); setMessage(""); }} />
      {!message && (
        <button type="button" className="btn btn-primary btn-block auth-submit" onClick={verify} disabled={busy || !token}>
          <Mail size={15} /> {busy ? "Verifyingâ€¦" : "Verify email"}
        </button>
      )}
    </AuthShell>
  );
}

export function ResetPasswordView({ token, onReset, onBack }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      const result = await onReset(token, password);
      setMessage(result.message);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err.message || "This password-reset link could not be used.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a new password with at least 8 characters." onBack={onBack}>
      <FeedbackDialog type={error ? "error" : "success"} message={error || message} onClose={() => { setError(""); setMessage(""); }} />
      {!message && (
        <form onSubmit={submit}>
          <div className="tas-field"><label>New password</label><input type="password" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus /></div>
          <div className="tas-field"><label>Confirm new password</label><input type="password" minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
          <button type="submit" className="btn btn-primary btn-block auth-submit" disabled={busy || !token}>
            <KeyRound size={15} /> {busy ? "Savingâ€¦" : "Change password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
