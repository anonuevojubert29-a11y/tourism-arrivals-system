# Tourism Arrivals Registry

A web app for recording daily tourist arrivals per accommodation, broken down
by sex and by origin (this province / other province / foreign, with country
of origin), rolled up into an admin dashboard, and printable as a report.

## Roles

- **Accommodation staff** — register an establishment, then (once approved)
  encode daily arrivals as two separate types, **overnight arrivals** and
  **day tour** visits, each with its own page in the sidebar. Also view a
  60-day history (toggle between the two types), set booking status, and
  edit their accommodation's profile under Settings.
- **Admin** — a consolidated overview across all approved accommodations:
  totals (filterable by visit type), male/female split per category, top
  foreign countries, a daily trend chart, a per-accommodation table, and a
  "Print report" button.
- **Super admin** — everything admin has, plus approving/rejecting
  registrations, creating/removing admin accounts, permanently removing
  accommodation accounts, and a Data page showing where the underlying data
  lives. The accommodations page also shows the linked account email and its
  verification status.
- **All signed-in users** — a persistent notification inbox with unread
  counts, read/unread filtering, direct links to related pages, individual
  deletion, and clear-all controls. Registration, approval, availability,
  and submitted-arrivals changes are delivered to the relevant accounts
  automatically.

## Quick start (no database required)

```bash
npm install
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`). With no
`VITE_API_BASE` configured, the app automatically stores everything in your
browser's `localStorage` — no setup needed, but data stays on that one
browser. See "Connecting MySQL" below for real, shared persistence.

Demo login: `superadmin` / `admin123` — or click **Register here** to create
a test accommodation and try the approval flow.

## Connecting MySQL

The `server/` folder is a small Express + MySQL API. Once it's running and
the frontend points at it, every save in the app — registrations, approvals,
booking status, daily arrivals — is written straight into MySQL instead of
the browser.

**1. Create a `.env` for the server**

```bash
cd server
cp .env.example .env
# edit .env with your MySQL host/user/password
```

**2. Install server dependencies and run the migration**

```bash
npm install
npm run migrate
```

This creates the `tourism_arrivals` database and its tables (see
`server/schema.sql`), and seeds a default super admin
(`superadmin` / `admin123`, password stored as a bcrypt hash — not plain
text, unlike the localStorage fallback). Safe to re-run; it skips the seed
if a super admin already exists.

**3. Start the server**

```bash
npm start
# -> Tourism arrivals API listening on http://localhost:4000
```

**4. Point the frontend at it**

In the project root (not `server/`):

```bash
cp .env.example .env
# uncomment and set: VITE_API_BASE=http://localhost:4000
npm run dev
```

Restart `npm run dev` after changing `.env` (Vite only reads it on startup).
From then on, every save in the app is automatic — there's no manual "sync"
step, the app just talks to MySQL directly instead of localStorage.

You now run two processes side by side during development: `npm start` (or
`npm run dev`) in `server/`, and `npm run dev` in the project root.

### Email verification and password recovery

New staff and admin accounts must verify a unique email address before their
first sign-in. Configure these server variables before accepting registrations:

```env
APP_URL=http://localhost:5173
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
EMAIL_FROM=Tourism Arrivals System <no-reply@example.com>
BREVO_API_KEY=your-brevo-api-key
```

`BREVO_API_KEY` uses Brevo's HTTPS email API and takes priority over the SMTP
settings. This is required on Railway Free, Trial, and Hobby plans, which block
outbound SMTP. SMTP remains available for local development or Railway Pro:
use `SMTP_SECURE=true` for implicit TLS on port 465, or `false` for STARTTLS on
port 587. Verification links expire after 24 hours. Password-reset links
require a verified address, expire after one hour, and can only be used once.
Existing accounts can add and verify an address under **My account**.

### MySQL schema

```
accommodations            one row per registered establishment
users                      staff / admin / superadmin, password_hash is bcrypt
notifications              per-user registration, approval, and availability updates
user_auth_tokens           hashed, expiring email-verification/reset tokens
arrivals                   one row per (accommodation, date, visit type) —
                           visit_type is 'overnight' or 'daytour'
arrival_foreign_entries    one row per country per arrival record
```

See `server/schema.sql` for full column definitions and foreign keys.

## Printable reports

On the admin/super admin **Overview** page, the **Print report** button
opens your browser's print dialog (which you can also "print" to a PDF)
with a clean, purpose-built report layout: a summary of totals, the
breakdown-by-accommodation table, and the top foreign countries table for
whatever date range and accommodation filter is currently selected. The
report is print-only — it's invisible in the normal dashboard view.

## Project structure

```
src/
  main.jsx, App.jsx, styles.css
  lib/
    data.js                  the ONLY place components talk to storage —
                              routes to MySQL (if VITE_API_BASE is set) or
                              localStorage (fallback) with an identical
                              interface either way
    helpers.js                shared constants, formatting, totals math
  components/
    LoginView.jsx / RegisterView.jsx
    Sidebar.jsx                 all pages for the signed-in role, incl.
                                 the "My account" entry
    StaffApp.jsx                 shell: banners + booking status + renders
                                 the sub-page picked in the sidebar
    StaffEncode.jsx               encode form, reused for both "Overnight
                                 arrivals" and "Day tour" (visitType prop)
    StaffHistory.jsx / StaffSettings.jsx
    AccountSettings.jsx        "My account" — name + password change (any role)
    NotificationsPage.jsx      persistent per-user notification inbox
    Overview.jsx               admin/super-admin analytics dashboard
                                 (filterable by accommodation and visit type)
    PrintableReport.jsx        print-only report layout
    AccommodationsPanel.jsx    approve/reject accommodations
    AdminAccountsPanel.jsx     create admin accounts (super admin)
    DataPanel.jsx              where-is-my-data explainer (super admin)
    StatTile.jsx / CategoryStatTile.jsx / NumberField.jsx / StatusBadge.jsx / Banner.jsx

server/
  index.js       Express API (accommodations, users/auth, notifications, arrivals)
  validation.js  Zod request schemas + reusable Express validation middleware
  db.js          MySQL connection pool
  schema.sql     table definitions
  migrate.js     one-time setup: creates tables + seeds a super admin
```

## How `src/lib/data.js` decides where to save

Every read/write in the app goes through a small set of functions in
`src/lib/data.js` (`fetchUsers`, `saveArrival`, `updateAccommodation`, etc.).
Internally each one picks a backend, in this order:

1. **Claude artifact storage** — only relevant if this project is ever
   re-embedded as a Claude.ai artifact.
2. **MySQL, via the API in `server/`** — used automatically once
   `VITE_API_BASE` is set.
3. **Browser localStorage** — the zero-config fallback.

No component ever calls `fetch` or `localStorage` directly, so nothing in
`src/components` needs to change if you later swap the backend again (e.g.
for Postgres, or a hosted API) — only `src/lib/data.js` would need to change.

## Security notes

- **MySQL mode**: passwords are hashed with bcrypt server-side. Successful
  login issues a time-limited JWT, and every data route checks authentication
  plus the caller's role/accommodation ownership. Zod validates API bodies,
  route parameters, and query strings before handlers use them. New accounts cannot sign in
  until their unique email is verified. Verification and reset tokens are
  random, stored only as SHA-256 hashes, expiring, and single-use. Password
  changes revoke older sessions. Set strong `JWT_SECRET` and SMTP credentials
  in the deployment environment and serve the app over HTTPS. Login,
  registration, and email actions are rate-limited.
- **localStorage fallback mode**: passwords are stored in plain text and
  there's no real session security — this mode is meant for local
  development and demos only, never production.
