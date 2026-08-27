import { uid } from "./helpers.js";

// Three backends, tried in this order — every function below returns the
// same shape regardless of which one is active, so components never need
// to know or care which is in play:
//
//   1. Claude artifact `window.storage`   (only relevant if re-embedded as an artifact)
//   2. A real MySQL-backed API            (set VITE_API_BASE in .env to enable — see server/)
//   3. Browser localStorage                (zero-config offline/demo fallback)

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const API_TIMEOUT_MS = 12000;
const API_TOKEN_KEY = "tas_api_token";
const hasArtifactStorage = typeof window !== "undefined" && !!window.storage;
const hasApi = !!API_BASE;

export const backendMode = hasArtifactStorage ? "artifact" : hasApi ? "mysql" : "local";
export const usingLocalFallback = backendMode === "local";

/* ------------------ generic KV helpers (artifact storage / localStorage) ------------------ */

const localAdapter = {
  async get(key) {
    const raw = window.localStorage.getItem(key);
    if (raw === null) throw new Error(`key not found: ${key}`);
    return { key, value: raw };
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
    return { key, value };
  },
  async list(prefix = "") {
    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(prefix));
    return { keys };
  },
};

const kv = hasArtifactStorage ? window.storage : localAdapter;

async function kvGetJSON(key, fallback) {
  try {
    const res = await kv.get(key, true);
    return res && res.value ? JSON.parse(res.value) : fallback;
  } catch (e) {
    return fallback;
  }
}
async function kvSetJSON(key, value) {
  try {
    await kv.set(key, JSON.stringify(value), true);
    return true;
  } catch (e) {
    return false;
  }
}
async function kvListKeys(prefix) {
  try {
    const res = await kv.list(prefix, true);
    return (res && res.keys) || [];
  } catch (e) {
    return [];
  }
}

async function kvDeleteKey(key) {
  try {
    if (hasArtifactStorage && typeof kv.delete === "function") await kv.delete(key, true);
    else window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------- MySQL REST API helper ---------------------------- */

function getApiToken() {
  return window.sessionStorage.getItem(API_TOKEN_KEY);
}

function setApiToken(token) {
  if (token) window.sessionStorage.setItem(API_TOKEN_KEY, token);
  else window.sessionStorage.removeItem(API_TOKEN_KEY);
}

async function apiFetch(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const token = getApiToken();
  const method = (options.method || "GET").toUpperCase();
  const loadingLabel = path === "/api/auth/login"
    ? "Signing in…"
    : path.includes("forgot-password") || path.includes("resend-verification")
      ? "Sending email…"
      : path.includes("verify-email")
        ? "Verifying email…"
        : path.includes("reset-password")
          ? "Updating password…"
          : method === "GET" ? "Loading information…" : "Saving changes…";

  window.dispatchEvent(new CustomEvent("tas:loading-start", { detail: { label: loadingLabel } }));

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      signal: options.signal || controller.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const error = new Error(body.error || `Server request failed (${res.status}).`);
      error.status = res.status;
      error.code = body.code;
      if (res.status === 401 && !path.startsWith("/api/auth/")) {
        setApiToken(null);
        window.dispatchEvent(new Event("tas:unauthorized"));
      }
      throw error;
    }
    if (res.status === 204) return true;
    return res.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The server took too long to respond. Please try again.");
    }
    if (error instanceof TypeError) {
      throw new Error("Cannot connect to the server. Check that the backend is running and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    window.dispatchEvent(new Event("tas:loading-end"));
  }
}

/* ================================ Public data API ================================ */

export async function ensureSeedData() {
  if (hasApi) return; // the MySQL server seeds its own super admin — run `npm run migrate` in server/
  let users = await kvGetJSON("users", null);
  let accommodations = await kvGetJSON("accommodations", null);
  if (!users) {
    users = [{ id: uid(), username: "superadmin", password: "admin123", role: "superadmin", name: "Super Admin" }];
    await kvSetJSON("users", users);
  }
  if (!accommodations) {
    accommodations = [];
    await kvSetJSON("accommodations", accommodations);
  }
}

export async function restoreApiSession() {
  if (!hasApi || !getApiToken()) return null;
  try {
    return await apiFetch("/api/auth/me");
  } catch (error) {
    if (error.status === 401) {
      setApiToken(null);
      return null;
    }
    throw error;
  }
}

export function logoutUser() {
  if (hasApi) setApiToken(null);
}

export async function fetchUsers() {
  if (hasApi) return (await apiFetch("/api/users")) || [];
  return kvGetJSON("users", []);
}

export async function fetchAccommodations() {
  if (hasApi) return (await apiFetch("/api/accommodations")) || [];
  return kvGetJSON("accommodations", []);
}

export async function loginUser(username, password) {
  if (hasApi) {
    const result = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    setApiToken(result.token);
    return result.user;
  }
  const users = await kvGetJSON("users", []);
  return users.find((u) => u.username === username && u.password === password) || null;
}

export async function registerAccommodation(form) {
  if (hasApi) {
    return apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        accName: form.accName, municipality: form.municipality, address: form.address,
        contactPerson: form.contactPerson, contactNumber: form.contactNumber, permitNumber: form.permitNumber,
        username: form.username, email: form.email, password: form.password,
      }),
    });
  }
  const users = await kvGetJSON("users", []);
  const accommodations = await kvGetJSON("accommodations", []);
  if (users.some((u) => u.username === form.username.trim())) {
    throw new Error("That username is already taken.");
  }
  const accId = uid();
  const accommodation = {
    id: accId, name: form.accName.trim(), municipality: form.municipality.trim(),
    address: form.address.trim(), contactPerson: form.contactPerson.trim(),
    contactNumber: form.contactNumber.trim(), permitNumber: form.permitNumber.trim(), status: "pending", fullyBooked: false,
    email: form.email.trim().toLowerCase(), emailVerified: true, username: form.username.trim(),
    createdAt: new Date().toISOString(),
  };
  const user = {
    id: uid(), username: form.username.trim(), password: form.password, role: "staff",
    name: form.contactPerson.trim() || form.accName.trim(), accommodationId: accId,
    email: form.email.trim().toLowerCase(), emailVerified: true,
  };
  await kvSetJSON("accommodations", [...accommodations, accommodation]);
  await kvSetJSON("users", [...users, user]);
  return { accommodation, user };
}

export async function updateAccommodation(id, patch) {
  if (hasApi) {
    try {
      await apiFetch(`/api/accommodations/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      return true;
    } catch (e) {
      return false;
    }
  }
  const accommodations = await kvGetJSON("accommodations", []);
  const next = accommodations.map((a) => (a.id === id ? { ...a, ...patch } : a));
  return kvSetJSON("accommodations", next);
}

export async function deleteAccommodationAccount(id) {
  if (hasApi) {
    try {
      await apiFetch(`/api/accommodations/${id}`, { method: "DELETE" });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
  const [accommodations, users, arrivalKeys] = await Promise.all([
    kvGetJSON("accommodations", []),
    kvGetJSON("users", []),
    kvListKeys(`arrival:${id}:`),
  ]);
  const results = await Promise.all([
    kvSetJSON("accommodations", accommodations.filter((item) => item.id !== id)),
    kvSetJSON("users", users.filter((user) => user.accommodationId !== id)),
    ...arrivalKeys.map(kvDeleteKey),
  ]);
  return results.every(Boolean) ? { ok: true } : { ok: false, error: "Could not remove accommodation account." };
}

export async function createAdmin({ name, username, email, password }) {
  if (hasApi) {
    try {
      const result = await apiFetch("/api/users", { method: "POST", body: JSON.stringify({ name, username, email, password }) });
      return { ok: true, user: result.user, verificationSent: result.verificationSent, warning: result.warning };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  const users = await kvGetJSON("users", []);
  if (users.some((u) => u.username === username)) {
    return { ok: false, error: "That username is already taken." };
  }
  const user = { id: uid(), name, username, email, emailVerified: true, password, role: "admin" };
  const ok = await kvSetJSON("users", [...users, user]);
  return ok ? { ok: true, user, verificationSent: true } : { ok: false, error: "Could not save account." };
}

export async function deleteUserAccount(userId) {
  if (hasApi) {
    try {
      await apiFetch(`/api/users/${userId}`, { method: "DELETE" });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
  const users = await kvGetJSON("users", []);
  const target = users.find((user) => user.id === userId);
  if (!target) return { ok: false, error: "Account not found." };
  if (target.role === "superadmin") return { ok: false, error: "The super-admin account cannot be deleted." };
  const ok = await kvSetJSON("users", users.filter((user) => user.id !== userId));
  return ok ? { ok: true } : { ok: false, error: "Could not remove account." };
}

export async function updateUserAccount(userId, { name, email, currentPassword, newPassword } = {}) {
  if (hasApi) {
    try {
      const result = await apiFetch(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ name, email, currentPassword, newPassword }),
      });
      if (result.token) setApiToken(result.token);
      return { ok: true, user: result.user, verificationSent: result.verificationSent, warning: result.warning };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  const users = await kvGetJSON("users", []);
  const existing = users.find((u) => u.id === userId);
  if (!existing) return { ok: false, error: "Account not found." };
  if (newPassword) {
    if (existing.password !== currentPassword) {
      return { ok: false, error: "Current password is incorrect." };
    }
  }
  const updated = {
    ...existing,
    ...(name ? { name } : {}),
    ...(email ? { email, emailVerified: true } : {}),
    ...(newPassword ? { password: newPassword } : {}),
  };
  const ok = await kvSetJSON("users", users.map((u) => (u.id === userId ? updated : u)));
  return ok ? { ok: true, user: updated, verificationSent: Boolean(email) } : { ok: false, error: "Could not save changes." };
}

export async function verifyEmail(token) {
  if (!hasApi) return { message: "Email verified. You can now sign in." };
  return apiFetch("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
}

export async function resendVerification(email) {
  if (!hasApi) return { message: "Verification is not required in local demo mode." };
  return apiFetch("/api/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
}

export async function requestPasswordReset(email) {
  if (!hasApi) return { message: "Password recovery requires the configured server." };
  return apiFetch("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export async function resetPassword(token, newPassword) {
  if (!hasApi) throw new Error("Password recovery requires the configured server.");
  return apiFetch("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) });
}

export async function fetchArrival(accommodationId, visitType, date) {
  if (hasApi) return apiFetch(`/api/arrivals/${accommodationId}/${visitType}/${date}`);
  return kvGetJSON(`arrival:${accommodationId}:${visitType}:${date}`, null);
}

export async function saveArrival(accommodationId, visitType, date, record) {
  if (hasApi) {
    try {
      await apiFetch(`/api/arrivals/${accommodationId}/${visitType}/${date}`, { method: "PUT", body: JSON.stringify(record) });
      return true;
    } catch (e) {
      return false;
    }
  }
  return kvSetJSON(`arrival:${accommodationId}:${visitType}:${date}`, record);
}

export async function fetchArrivalsInRange(from, to, accommodationIdFilter, visitTypeFilter) {
  if (hasApi) {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (accommodationIdFilter && accommodationIdFilter !== "all") params.set("accommodationId", accommodationIdFilter);
    if (visitTypeFilter && visitTypeFilter !== "all") params.set("visitType", visitTypeFilter);
    return (await apiFetch(`/api/arrivals?${params.toString()}`)) || [];
  }

  const keys = await kvListKeys("arrival:");
  const matched = keys.filter((k) => {
    const parts = k.split(":");
    if (parts.length < 4) return false;
    const accId = parts[1];
    const visitType = parts[2];
    const date = parts.slice(3).join(":");
    if (accommodationIdFilter && accommodationIdFilter !== "all" && accId !== accommodationIdFilter) return false;
    if (visitTypeFilter && visitTypeFilter !== "all" && visitType !== visitTypeFilter) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
  const records = [];
  for (const k of matched) {
    const parts = k.split(":");
    const accId = parts[1];
    const visitType = parts[2];
    const date = parts.slice(3).join(":");
    const rec = await kvGetJSON(k, null);
    if (rec) records.push({ ...rec, accommodationId: accId, visitType, date });
  }
  return records;
}

export async function countArrivals() {
  if (hasApi) {
    const res = await apiFetch("/api/arrivals/count");
    return res ? res.count : 0;
  }
  const keys = await kvListKeys("arrival:");
  return keys.length;
}
