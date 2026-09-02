import React, { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, ServerOff } from "lucide-react";
import FeedbackDialog from "./components/FeedbackDialog.jsx";
import LoadingOverlay from "./components/LoadingOverlay.jsx";
import LoginView from "./components/LoginView.jsx";
import RegisterView from "./components/RegisterView.jsx";
import { EmailRequestView, ResetPasswordView, VerifyEmailView } from "./components/EmailAuthViews.jsx";
import Sidebar from "./components/Sidebar.jsx";
import StaffApp from "./components/StaffApp.jsx";
import Overview from "./components/Overview.jsx";
import AccommodationsPanel from "./components/AccommodationsPanel.jsx";
import AdminAccountsPanel from "./components/AdminAccountsPanel.jsx";
import DataPanel from "./components/DataPanel.jsx";
import AccountSettings from "./components/AccountSettings.jsx";
import NotificationsPage from "./components/NotificationsPage.jsx";
import AuditLogsPage from "./components/AuditLogsPage.jsx";
import {
  ensureSeedData, fetchUsers, fetchAccommodations, loginUser, registerAccommodation, updateAccommodation,
  updateUserAccount, restoreApiSession, logoutUser, backendMode,
  verifyEmail, resendVerification, requestPasswordReset, resetPassword,
  fetchNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, clearNotifications,
} from "./lib/data.js";

const SESSION_KEY = "tas_session_user_id";

function defaultTabFor(user) {
  return user.role === "staff" ? "overnight" : "overview";
}

export default function App() {
  const [emailLink] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verifyEmail")) return { mode: "verify", token: params.get("verifyEmail") };
    if (params.get("resetPassword")) return { mode: "reset", token: params.get("resetPassword") };
    return null;
  });
  const [users, setUsers] = useState(null);
  const [accommodations, setAccommodations] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState(emailLink?.mode || "login");
  const [authError, setAuthError] = useState("");
  const [mainTab, setMainTab] = useState("overview");
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [overviewFilterAccId, setOverviewFilterAccId] = useState(null);
  const [message, setMessage] = useState(null);
  const [initialError, setInitialError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [requestBusy, setRequestBusy] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Loading information…");
  const [pageLoading, setPageLoading] = useState(false);
  const requestCount = useRef(0);
  const navigationTimer = useRef(null);

  useEffect(() => {
    const startLoading = (event) => {
      requestCount.current += 1;
      setLoadingLabel(event.detail?.label || "Loading information…");
      setRequestBusy(true);
    };
    const stopLoading = () => {
      requestCount.current = Math.max(0, requestCount.current - 1);
      if (requestCount.current === 0) setRequestBusy(false);
    };
    window.addEventListener("tas:loading-start", startLoading);
    window.addEventListener("tas:loading-end", stopLoading);
    return () => {
      window.removeEventListener("tas:loading-start", startLoading);
      window.removeEventListener("tas:loading-end", stopLoading);
    };
  }, []);

  useEffect(() => () => window.clearTimeout(navigationTimer.current), []);

  useEffect(() => {
    let active = true;
    (async () => {
      setInitialError("");
      setUsers(null);
      setAccommodations(null);
      setCurrentUser(null);
      try {
        await ensureSeedData();

        if (emailLink) {
          setUsers([]);
          setAccommodations([]);
          return;
        }

        if (backendMode === "mysql") {
          const restored = await restoreApiSession();
          if (!active) return;
          if (!restored) {
            setUsers([]);
            setAccommodations([]);
            return;
          }
          const [a, u] = await Promise.all([
            fetchAccommodations(),
            restored.role === "superadmin" ? fetchUsers() : Promise.resolve([restored]),
          ]);
          if (!active) return;
          setUsers(u);
          setAccommodations(a);
          setCurrentUser(restored);
          setMainTab(defaultTabFor(restored));
          return;
        }

        const [u, a] = await Promise.all([fetchUsers(), fetchAccommodations()]);
        if (!active) return;
        setUsers(u);
        setAccommodations(a);
        const savedId = window.localStorage.getItem(SESSION_KEY);
        const restored = savedId ? u.find((usr) => usr.id === savedId) : null;
        if (restored) {
          setCurrentUser(restored);
          setMainTab(defaultTabFor(restored));
        } else if (savedId) {
          window.localStorage.removeItem(SESSION_KEY);
        }
      } catch (error) {
        if (active) setInitialError(error.message || "The system could not load its data.");
      }
    })();
    return () => { active = false; };
  }, [loadAttempt, emailLink]);

  const notify = useCallback((type, text) => {
    setMessage({ id: Date.now(), type, text });
  }, []);

  const dismissMessage = useCallback(() => setMessage(null), []);
  const dismissAuthFeedback = useCallback(() => {
    setAuthError("");
  }, []);

  const refreshNotifications = useCallback(async (silent = true) => {
    if (!currentUser) return;
    setNotificationsLoading(true);
    try {
      const next = await fetchNotifications(currentUser.id, { silent });
      setNotifications(next);
    } catch (error) {
      if (!silent) notify("error", error.message || "Could not load notifications.");
    } finally {
      setNotificationsLoading(false);
    }
  }, [currentUser, notify]);

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      return undefined;
    }
    refreshNotifications(true);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshNotifications(true);
    };
    const interval = window.setInterval(refreshWhenVisible, 60000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [currentUser, refreshNotifications]);

  const navigateTo = useCallback((tab, force = false) => {
    if (!force && tab === mainTab) return;
    window.clearTimeout(navigationTimer.current);
    setPageLoading(true);
    setMainTab(tab);
    if (tab === "notifications") refreshNotifications(true);
    navigationTimer.current = window.setTimeout(() => setPageLoading(false), 450);
  }, [mainTab, refreshNotifications]);

  useEffect(() => {
    const handleUnauthorized = () => {
      logoutUser();
      setCurrentUser(null);
      setUsers([]);
      setAccommodations([]);
      setAuthMode("login");
      setAuthError("Your session expired. Please sign in again.");
    };
    window.addEventListener("tas:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("tas:unauthorized", handleUnauthorized);
  }, []);

  async function handleLogin(username, password) {
    setAuthError("");
    try {
      const u = await loginUser(username, password);
      if (!u) { setAuthError("Invalid username or password."); return; }
      const [a, nextUsers] = await Promise.all([
        fetchAccommodations(),
        u.role === "superadmin" ? fetchUsers() : Promise.resolve([u]),
      ]);
      if (backendMode !== "mysql") window.localStorage.setItem(SESSION_KEY, u.id);
      setUsers(nextUsers);
      setAccommodations(a);
      setCurrentUser(u);
      setMainTab(defaultTabFor(u));
    } catch (error) {
      setAuthError(error.message || "Could not connect to the server.");
    }
  }

  async function handleRegister(form) {
    setAuthError("");
    if (form.password !== form.confirm) { setAuthError("Passwords do not match."); return; }
    if (!form.password || form.password.length < 8) { setAuthError("Password must be at least 8 characters."); return; }
    try {
      const result = await registerAccommodation(form);
      if (backendMode === "mysql") {
        setAuthMode("login");
        return;
      }
      const { accommodation, user } = result;
      setAccommodations((prev) => [...(prev || []), accommodation]);
      setUsers((prev) => [...(prev || []), user]);
      if (backendMode !== "mysql") window.localStorage.setItem(SESSION_KEY, user.id);
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

  async function handleResendVerification(email) {
    try {
      const result = await resendVerification(email);
      return { ok: true, message: result.message };
    } catch (error) {
      return { ok: false, error: error.message || "Could not send verification email." };
    }
  }

  async function handleMarkNotificationRead(notificationId) {
    try {
      await markNotificationRead(currentUser.id, notificationId);
      setNotifications((current) => current.map((item) => (
        item.id === notificationId ? { ...item, read: true } : item
      )));
    } catch (error) {
      notify("error", error.message || "Could not update the notification.");
    }
  }

  async function handleMarkAllNotificationsRead() {
    try {
      await markAllNotificationsRead(currentUser.id);
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    } catch (error) {
      notify("error", error.message || "Could not mark notifications as read.");
    }
  }

  async function handleDeleteNotification(notificationId) {
    try {
      await deleteNotification(currentUser.id, notificationId);
      setNotifications((current) => current.filter((item) => item.id !== notificationId));
    } catch (error) {
      notify("error", error.message || "Could not delete the notification.");
    }
  }

  async function handleClearNotifications() {
    try {
      await clearNotifications(currentUser.id);
      setNotifications([]);
      return true;
    } catch (error) {
      notify("error", error.message || "Could not clear notifications.");
      return false;
    }
  }

  async function handleVerifyEmail(token) {
    const result = await verifyEmail(token);
    window.history.replaceState({}, "", window.location.pathname);
    return result;
  }

  async function handleResetPassword(token, password) {
    const result = await resetPassword(token, password);
    window.history.replaceState({}, "", window.location.pathname);
    return result;
  }

  function showAuthMode(mode) {
    window.clearTimeout(navigationTimer.current);
    setPageLoading(true);
    setAuthMode(mode);
    setAuthError("");
    navigationTimer.current = window.setTimeout(() => setPageLoading(false), 450);
  }

  function returnToLogin() {
    window.history.replaceState({}, "", window.location.pathname);
    showAuthMode("login");
  }

  function handleLogout() {
    window.clearTimeout(navigationTimer.current);
    setPageLoading(true);
    logoutUser();
    window.localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    if (backendMode === "mysql") {
      setUsers([]);
      setAccommodations([]);
    }
    setAuthMode("login");
    setAuthError("");
    navigationTimer.current = window.setTimeout(() => setPageLoading(false), 450);
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
        <LoadingOverlay visible label="Loading the system…" />
      </div>
    );
  }

  if (!currentUser) {
    let authView;
    if (authMode === "register") {
      authView = <RegisterView onRegister={handleRegister} onSwitch={returnToLogin} error={authError} />;
    } else if (authMode === "forgot" || authMode === "resend") {
      authView = (
        <EmailRequestView
          mode={authMode}
          onSubmit={authMode === "forgot" ? requestPasswordReset : resendVerification}
          onBack={returnToLogin}
        />
      );
    } else if (authMode === "verify") {
      authView = <VerifyEmailView token={emailLink?.token} onVerify={handleVerifyEmail} onBack={returnToLogin} />;
    } else if (authMode === "reset") {
      authView = <ResetPasswordView token={emailLink?.token} onReset={handleResetPassword} onBack={returnToLogin} />;
    } else {
      authView = (
        <LoginView
          onLogin={handleLogin}
          onSwitch={() => showAuthMode("register")}
          onForgotPassword={() => showAuthMode("forgot")}
          onResendVerification={() => showAuthMode("resend")}
          error={authError}
        />
      );
    }
    return (
      <div className="tas-root">
        {authView}
        <FeedbackDialog
          type={authError ? "error" : undefined}
          message={authError}
          onClose={dismissAuthFeedback}
        />
        <LoadingOverlay visible={pageLoading || requestBusy} label={requestBusy ? loadingLabel : "Loading page…"} />
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
        setMainTab={navigateTo}
        onLogout={handleLogout}
        onOpenAccount={() => navigateTo("settings")}
        staffApproved={staffAccommodation?.status === "approved"}
        unreadNotifications={notifications.filter((item) => !item.read).length}
      />
      <div className="tas-main">
        {message && (
          <FeedbackDialog
            key={message.id}
            type={message.type === "error" ? "error" : "success"}
            message={message.text}
            onClose={dismissMessage}
          />
        )}
        <LoadingOverlay visible={pageLoading || requestBusy} label={requestBusy ? loadingLabel : "Loading page…"} />

        {mainTab === "settings" && (
          <AccountSettings
            user={currentUser}
            accommodation={staffAccommodation}
            onUpdateAccount={handleUpdateAccount}
            onResendVerification={handleResendVerification}
            notify={notify}
          />
        )}

        {mainTab === "notifications" && (
          <NotificationsPage
            notifications={notifications}
            loading={notificationsLoading}
            onRefresh={() => refreshNotifications(false)}
            onMarkRead={handleMarkNotificationRead}
            onMarkAllRead={handleMarkAllNotificationsRead}
            onDelete={handleDeleteNotification}
            onClear={handleClearNotifications}
            onNavigate={navigateTo}
          />
        )}

        {mainTab === "audit" && currentUser.role === "superadmin" && <AuditLogsPage />}

        {mainTab !== "settings" && mainTab !== "notifications" && mainTab !== "audit" && currentUser.role === "staff" && staffAccommodation && (
          <StaffApp
            accommodation={staffAccommodation}
            tab={mainTab}
            onNavigate={navigateTo}
            notify={notify}
            onUpdateBookingStatus={(v) => handleSetBookingStatus(staffAccommodation.id, v)}
            onUpdateInfo={(patch) => handleUpdateAccommodationInfo(staffAccommodation.id, patch)}
            onUpdateAccount={handleUpdateAccount}
          />
        )}

        {mainTab !== "settings" && mainTab !== "notifications" && mainTab !== "audit" && (currentUser.role === "admin" || currentUser.role === "superadmin") && (
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
                setUsers={setUsers}
                canManage={currentUser.role === "superadmin"}
                notify={notify}
                onViewDetails={(id) => { setOverviewFilterAccId(id); navigateTo("overview", true); }}
              />
            )}
            {mainTab === "admins" && currentUser.role === "superadmin" && (
              <AdminAccountsPanel users={users} setUsers={setUsers} currentUserId={currentUser.id} notify={notify} />
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
