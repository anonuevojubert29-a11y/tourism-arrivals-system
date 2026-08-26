import React, { useState, useEffect, useCallback } from "react";
import { Loader2, XCircle, CheckCircle2, RefreshCw, ServerOff } from "lucide-react";
import Banner from "./components/Banner.jsx";
import LoginView from "./components/LoginView.jsx";
import RegisterView from "./components/RegisterView.jsx";
import Sidebar from "./components/Sidebar.jsx";
import StaffApp from "./components/StaffApp.jsx";
import Overview from "./components/Overview.jsx";
import AccommodationsPanel from "./components/AccommodationsPanel.jsx";
import AdminAccountsPanel from "./components/AdminAccountsPanel.jsx";
import DataPanel from "./components/DataPanel.jsx";
import AccountSettings from "./components/AccountSettings.jsx";
import {
  ensureSeedData, fetchUsers, fetchAccommodations, loginUser, registerAccommodation, updateAccommodation,
  updateUserAccount,
} from "./lib/data.js";

const SESSION_KEY = "tas_session_user_id";

function defaultTabFor(user) {
  return user.role === "staff" ? "overnight" : "overview";
}

export default function App() {
  const [users, setUsers] = useState(null);
  const [accommodations, setAccommodations] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [mainTab, setMainTab] = useState("overview");
  const [overviewFilterAccId, setOverviewFilterAccId] = useState(null);
  const [message, setMessage] = useState(null);
  const [initialError, setInitialError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      setInitialError("");
      setUsers(null);
      setAccommodations(null);
      try {
        await ensureSeedData();
        const [u, a] = await Promise.all([fetchUsers(), fetchAccommodations()]);
        if (!active) return;
        setUsers(u);
        setAccommodations(a);

        const savedId = window.localStorage.getItem(SESSION_KEY);
        if (savedId) {
          const restored = u.find((usr) => usr.id === savedId);
          if (restored) {
            setCurrentUser(restored);
            setMainTab(defaultTabFor(restored));
          } else {
            window.localStorage.removeItem(SESSION_KEY);
          }
        }
      } catch (error) {
        if (active) setInitialError(error.message || "The system could not load its data.");
      }
    })();
    return () => { active = false; };
  }, [loadAttempt]);

  const notify = useCallback((type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  }, []);

  async function handleLogin(username, password) {
    setAuthError("");
    try {
      const u = await loginUser(username, password);
      if (!u) { setAuthError("Invalid username or password."); return; }
      window.localStorage.setItem(SESSION_KEY, u.id);
      setCurrentUser(u);
      setMainTab(defaultTabFor(u));
    } catch (error) {
      setAuthError(error.message || "Could not connect to the server.");
    }
  }

  async function handleRegister(form) {
    setAuthError("");
    if (form.password !== form.confirm) { setAuthError("Passwords do not match."); return; }
    if (!form.password || form.password.length < 4) { setAuthError("Password must be at least 4 characters."); return; }
    try {
      const { accommodation, user } = await registerAccommodation(form);
      setAccommodations((prev) => [...prev, accommodation]);
      setUsers((prev) => [...prev, user]);
      window.localStorage.setItem(SESSION_KEY, user.id);
      setCurrentUser(user);
      setMainTab("overnight");
    } catch (err) {
      setAuthError(err.message || "Could not register. Please try again.");
    }
  }

  async function handleSetBookingStatus(accId, fullyBooked) {
    const ok = await updateAccommodation(accId, { fullyBooked });
    if (ok) setAccommodations((prev) => prev.map((a) => (a.id === accId ? { ...a, fullyBooked } : a)));
    notify(
      ok ? "success" : "error",
      ok ? (fullyBooked ? "Marked as fully booked." : "Marked as accepting guests.") : "Could not update booking status."
    );
  }

  async function handleUpdateAccommodationInfo(accId, patch) {
    const ok = await updateAccommodation(accId, patch);
    if (ok) setAccommodations((prev) => prev.map((a) => (a.id === accId ? { ...a, ...patch } : a)));
    notify(ok ? "success" : "error", ok ? "Accommodation details updated." : "Could not save changes.");
  }

  async function handleUpdateAccount(patch) {
    const result = await updateUserAccount(currentUser.id, patch);
    if (result.ok) {
      setCurrentUser((prev) => ({ ...prev, ...result.user }));
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? { ...u, ...result.user } : u)));
    }
    return result;
  }

  function handleLogout() {
    window.localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setAuthMode("login");
    setAuthError("");
  }

  if (initialError) {
    return (
      <div className="tas-root">
        <div className="auth-wrap">
          <div className="auth-card connection-card">
            <ServerOff size={30} className="connection-icon" />
            <h2 className="tas-display">Unable to load the system</h2>
            <p>{initialError}</p>
            <button type="button" className="btn btn-block auth-submit" onClick={() => setLoadAttempt((value) => value + 1)}>
              <RefreshCw size={15} /> Retry connection
            </button>
            <small>If you are running locally, start the backend with <code>npm.cmd start</code> inside the server folder.</small>
          </div>
        </div>
      </div>
    );
  }

  if (users === null || accommodations === null) {
    return (
      <div className="tas-root">
        <div className="auth-wrap"><Loader2 size={22} className="spin" /></div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="tas-root">
        {authMode === "login" ? (
          <LoginView onLogin={handleLogin} onSwitch={() => { setAuthMode("register"); setAuthError(""); }} error={authError} />
        ) : (
          <RegisterView onRegister={handleRegister} onSwitch={() => { setAuthMode("login"); setAuthError(""); }} error={authError} />
        )}
      </div>
    );
  }

  const staffAccommodation = currentUser.role === "staff"
    ? accommodations.find((a) => a.id === currentUser.accommodationId)
    : null;

  return (
    <div className="tas-root">
      <Sidebar
        user={currentUser}
        mainTab={mainTab}
        setMainTab={setMainTab}
        onLogout={handleLogout}
        onOpenAccount={() => setMainTab("account")}
        staffApproved={staffAccommodation?.status === "approved"}
      />
      <div className="tas-main">
        {message && (
          <Banner type={message.type === "error" ? "error" : "success"} icon={message.type === "error" ? XCircle : CheckCircle2}>
            {message.text}
          </Banner>
        )}

        {mainTab === "account" && (
          <AccountSettings
            user={currentUser}
            accommodation={staffAccommodation}
            onUpdateAccount={handleUpdateAccount}
            notify={notify}
          />
        )}

        {mainTab !== "account" && currentUser.role === "staff" && staffAccommodation && (
          <StaffApp
            accommodation={staffAccommodation}
            tab={mainTab}
            onNavigate={setMainTab}
            notify={notify}
            onUpdateBookingStatus={(v) => handleSetBookingStatus(staffAccommodation.id, v)}
            onUpdateInfo={(patch) => handleUpdateAccommodationInfo(staffAccommodation.id, patch)}
            onUpdateAccount={handleUpdateAccount}
          />
        )}

        {mainTab !== "account" && (currentUser.role === "admin" || currentUser.role === "superadmin") && (
          <>
            <div className="tas-pagehead">
              <div>
                <h1>
                  {mainTab === "overview" ? "System overview"
                    : mainTab === "accommodations" ? "Accommodations"
                    : mainTab === "admins" ? "Admin accounts"
                    : "Data"}
                </h1>
                <p>Tourism arrivals — consolidated across all registered accommodations</p>
              </div>
            </div>
            {mainTab === "overview" && <Overview accommodations={accommodations} initialAccId={overviewFilterAccId} />}
            {mainTab === "accommodations" && (
              <AccommodationsPanel
                accommodations={accommodations}
                setAccommodations={setAccommodations}
                canManage={currentUser.role === "superadmin"}
                notify={notify}
                onViewDetails={(id) => { setOverviewFilterAccId(id); setMainTab("overview"); }}
              />
            )}
            {mainTab === "admins" && currentUser.role === "superadmin" && (
              <AdminAccountsPanel users={users} setUsers={setUsers} notify={notify} />
            )}
            {mainTab === "data" && currentUser.role === "superadmin" && (
              <DataPanel users={users} accommodations={accommodations} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
