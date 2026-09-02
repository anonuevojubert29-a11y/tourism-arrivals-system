const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_HEADER = "X-CSRF-Protection";
export const CSRF_HEADER_VALUE = "1";

export function normalizeOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function createOriginPolicy({ configuredOrigins = "", nodeEnv = "development" } = {}) {
  const isProduction = nodeEnv === "production";
  const entries = String(configuredOrigins)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (isProduction && (entries.length === 0 || entries.includes("*"))) {
    throw new Error("CORS_ORIGIN must list explicit trusted origins in production; wildcard CORS is not allowed.");
  }

  const allowAnyOrigin = !isProduction && entries.includes("*");
  const allowedOrigins = new Set(entries
    .filter((value) => value !== "*")
    .map(normalizeOrigin)
    .filter(Boolean));

  function isAllowedOrigin(origin) {
    const normalized = normalizeOrigin(origin);
    if (!normalized) return false;
    if (allowAnyOrigin || allowedOrigins.has(normalized)) return true;
    return !isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized);
  }

  return { isProduction, allowedOrigins, isAllowedOrigin };
}

export function createCorsOptions(policy) {
  return {
    origin(origin, callback) {
      // Requests without Origin are not browser CORS requests. CSRF checks
      // independently protect every state-changing browser request.
      callback(null, !origin || policy.isAllowedOrigin(origin));
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", CSRF_HEADER],
    credentials: false,
    maxAge: 600,
    optionsSuccessStatus: 204,
  };
}

function originFromReferer(value) {
  return normalizeOrigin(value);
}

export function createCsrfGuard(policy) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) return next();

    if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
      return res.status(403).json({ error: "CSRF protection header is missing or invalid." });
    }

    const origin = normalizeOrigin(req.get("Origin")) || originFromReferer(req.get("Referer"));
    if (origin && !policy.isAllowedOrigin(origin)) {
      return res.status(403).json({ error: "Request origin is not allowed." });
    }

    // Allowed frontends may legitimately be cross-site when the UI and API
    // use different hosting providers. Only reject cross-site Fetch Metadata
    // when no trusted Origin/Referer was available to verify the request.
    if (req.get("Sec-Fetch-Site") === "cross-site" && !origin) {
      return res.status(403).json({ error: "Cross-site request could not be verified." });
    }

    return next();
  };
}
