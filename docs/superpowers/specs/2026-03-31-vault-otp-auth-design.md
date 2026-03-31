# RNV Manager — Vault Module + Passwordless Auth

**Date:** 2026-03-31
**Status:** Approved
**Author:** brainstorming session

---

## Overview

Add a credential vault module to RNV Manager and replace password-based authentication with passwordless OTP via email. The vault stores encrypted credentials (URL, username, password, port, notes) for Docker services deployed per client. The Tauri macOS app auto-starts as a tray icon on login.

---

## 1. Authentication — Passwordless OTP

Replaces the current user+password login entirely.

### Flow

1. User enters email on login screen.
2. Go API validates email is in `allowed_emails` table, generates 6-digit code, stores bcrypt hash in `otp_codes` with 5-minute expiry, sends code via SMTP.
3. User enters the code.
4. API verifies code → issues JWT (24h expiry), creates session in DB.
5. Notification email sent to `NOTIFICATION_EMAIL` env var: "New access to RNV Manager from [IP] at [time]".

### Data Model — `otp_codes`

| Column     | Type      | Description                        |
|------------|-----------|------------------------------------|
| id         | CUID (PK) | Primary key                        |
| email      | string    | Requesting email                   |
| code_hash  | string    | Bcrypt hash of 6-digit code        |
| expires_at | timestamp | now() + 5 minutes                  |
| used       | boolean   | Default false, set true on verify  |
| ip_address | string    | Requester IP                       |
| created_at | timestamp | Auto                               |

### Data Model — `allowed_emails`

| Column | Type        | Description                          |
|--------|-------------|--------------------------------------|
| id     | CUID (PK)   | Primary key                          |
| email  | string (UQ) | Authorized email address             |
| role   | string      | superadmin / admin / viewer          |
| active | boolean     | Whether this email can request OTP   |

### JWT Claims (new structure)

After successful OTP verification, the JWT contains:

```json
{
  "email": "user@example.com",
  "role": "superadmin",
  "allowed_email_id": "cuid_xxx",
  "exp": 1234567890
}
```

The auth middleware extracts `email`, `role`, and `allowed_email_id` from claims (replaces old `userID`, `username`, `userRole`, `userName`).

### Session Model (updated)

The existing `Session` model changes its FK from `users.id` to `allowed_emails.id`:

| Column           | Type          | Description                        |
|------------------|---------------|------------------------------------|
| id               | CUID (PK)     | Primary key                        |
| allowed_email_id | FK            | → allowed_emails.id                |
| token            | string        | JWT token                          |
| ip_address       | string        | Client IP                          |
| user_agent       | string        | Browser/app user agent             |
| expires_at       | timestamp     | Token expiry                       |
| created_at       | timestamp     | Auto                               |

### AuditLog FK Update

`AuditLog.UserID` is renamed to `AuditLog.ActorEmail` (string). This avoids FK dependency on any user table and is human-readable. Existing audit records retain their old `user_id` value in a deprecated nullable column for history.

### Security Rules

- Max 5 OTP requests per email per 15 minutes (rate limiting).
- Max 3 verification attempts per OTP code — after 3 failures, the code is invalidated.
- Code is single-use — marked `used=true` after verification.
- Only emails in `allowed_emails` (active=true) can request OTP.
- Login notification email sent to `NOTIFICATION_EMAIL` env var on every successful auth.
- JWT expiry reduced from 7 days to 24 hours.
- If SMTP delivery fails, API returns 503 with clear error message. Password fallback is intentionally absent for security.

---

## 2. Vault — Credential Storage

### Data Model — `credentials`

| Column           | Type           | Description                                        |
|------------------|----------------|----------------------------------------------------|
| id               | CUID (PK)      | Primary key                                        |
| service_id       | FK (nullable)  | → services.id                                      |
| client_id        | FK (nullable)  | → clients.id                                       |
| label            | string         | Human name: "Odoo Master Password", "PostgreSQL"   |
| url              | string (enc)   | Encrypted: "https://odoo.cliente.com"              |
| username         | string (enc)   | Encrypted                                          |
| password         | string (enc)   | Encrypted                                          |
| port             | integer        | Plain: 5432 (not sensitive)                        |
| notes            | text (enc)     | Encrypted: additional info                         |
| deleted_at       | timestamp      | Soft-delete (nullable, null = active)              |
| created_by       | FK             | → allowed_emails.id                                |
| created_at       | timestamp      | Auto                                               |
| updated_at       | timestamp      | Auto                                               |

### Encryption

- **Algorithm:** AES-256-GCM
- **Master key:** Environment variable `VAULT_MASTER_KEY` (32 bytes hex, generated with `openssl rand -hex 32`).
- **Per-field encryption:** Each sensitive field encrypted individually with a random 12-byte nonce.
- **Storage format:** base64(nonce || ciphertext || tag) in the DB column.
- **Key never stored in DB or code.**
- **Key rotation:** Set `VAULT_MASTER_KEY_OLD` to the previous key, update `VAULT_MASTER_KEY` to the new key. Run `POST /api/vault/rotate-key` (superadmin only) — re-encrypts all fields from old key to new key. Remove `VAULT_MASTER_KEY_OLD` after migration completes.

### Relationships

- Optional FK to `clients` and `services` — enables filtering "all credentials for client X" or "credentials for service Odoo on VPS Y".
- If a service or client is deleted, credentials remain (SET NULL) to avoid data loss.

---

## 3. API Endpoints

### Auth (replaces current)

```
POST /api/auth/request-otp     {email}          → sends OTP code
POST /api/auth/verify-otp      {email, code}    → returns JWT
```

### Vault CRUD

```
GET    /api/vault               ?client_id=&service_id=   → list credentials (metadata only, no decrypted passwords)
GET    /api/vault/:id           → full detail (decrypts all fields)
POST   /api/vault               → create credential
PUT    /api/vault/:id           → update credential
DELETE /api/vault/:id           → delete credential
```

### Generator

```
POST /api/vault/generate             {length, symbols, uppercase, lowercase, numbers}  → returns generated password (not saved)
POST /api/vault/generate-and-save    {label, client_id, service_id, url, username, port, notes, generator_params}  → generates + encrypts + saves
```

### RBAC — Vault Permissions

| Operation              | superadmin | admin | viewer |
|------------------------|------------|-------|--------|
| List credentials       | yes        | yes   | yes    |
| View credential detail | yes        | yes   | yes    |
| Create credential      | yes        | yes   | no     |
| Update credential      | yes        | yes (own) | no  |
| Delete credential      | yes        | no    | no     |
| Manage service tokens  | yes        | no    | no     |
| Manage allowed_emails  | yes        | no    | no     |

Delete is soft-delete (sets `deleted_at`). Only superadmin can permanently purge.

### Pagination

All list endpoints use `?page=1&per_page=20` (default 20, max 100). Response includes `total`, `page`, `per_page`, `total_pages`.

### Audit

Every `GET /api/vault/:id` is logged in the audit log — who viewed which credential and when.

---

## 4. CLI — `rnv-vault`

Go binary (in `cmd/rnv-vault` within the Go module) that calls the Go API. Authenticates with a service token.

### Service Tokens

| Column     | Type        | Description                                  |
|------------|-------------|----------------------------------------------|
| id         | CUID (PK)   | Primary key                                  |
| name       | string      | Human label: "Deploy server token"           |
| token_hash | string      | Bcrypt hash of the opaque token              |
| role       | string      | Permission scope: admin / viewer             |
| created_by | FK          | → allowed_emails.id                          |
| expires_at | timestamp   | Nullable — null means no expiry              |
| last_used  | timestamp   | Updated on each use                          |
| active     | boolean     | Can be revoked from UI                       |
| created_at | timestamp   | Auto                                         |

**API endpoints:**
```
POST   /api/auth/service-tokens      → create token (returns plaintext once)
GET    /api/auth/service-tokens      → list tokens (metadata only)
DELETE /api/auth/service-tokens/:id  → revoke token
```

Token format: `rnv_` prefix + 48 random bytes (base64). Sent as `Authorization: Bearer rnv_xxx`. Auth middleware checks prefix to distinguish from JWT.

### CLI Usage

```bash
# First-time setup — paste token from UI
rnv-vault auth --token rnv_xxx

# Generate and save a credential
rnv-vault generate --label "Odoo Master" --client "Empresa X" --service odoo --length 32

# List credentials for a client
rnv-vault list --client "Empresa X"

# Show a specific credential
rnv-vault show <credential-id>
```

---

## 5. Frontend — Next.js

### Login Page (redesigned)

- Step 1: Email field + "Send code" button.
- Step 2: 6-digit input field + "Verify" button.
- No password option.

### Vault Page — `/vault`

**List view:**
- Table: Label, Client, Service, Username, URL, Created date.
- Filters: client dropdown, service dropdown, text search.
- Button: "New Credential".
- Passwords NOT shown in list.

**Detail view (modal/drawer):**
- All fields displayed.
- Password hidden by default (dots), "eye" button to reveal.
- Copy-to-clipboard button on each field.
- Revealing password triggers audit log entry.

**New credential form:**
- Fields: Label, Client (dropdown), Service (dropdown), URL, Username, Port, Notes.
- Generator section: length slider (16–64, default 32), toggles (uppercase, lowercase, numbers, symbols), preview, regenerate button.
- Option to type password manually (for registering existing credentials).

### Sidebar

New entry "Vault" with lock icon, between Services and Billing.

---

## 6. macOS Auto-start + Tray

### Launch Agent

File: `~/Library/LaunchAgents/com.renace.rnv-manager.plist`

- Starts the Tauri app on user login.
- App launches as system tray icon (no window).
- Click on tray icon opens main window.
- Includes system monitor functionality.

### Installation

The Tauri app registers the Launch Agent on first run (or via a setup command). User can toggle auto-start from Settings page.

---

## 7. Environment Variables (new)

```env
# Vault
VAULT_MASTER_KEY=<64-char hex string from openssl rand -hex 32>

# SMTP (already exists, reused for OTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Notification recipient
NOTIFICATION_EMAIL=expertostird@gmail.com
```

---

## 8. Security Summary

| Layer              | Measure                                              |
|--------------------|------------------------------------------------------|
| Authentication     | Passwordless OTP, 5-min expiry, single-use           |
| Authorization      | Role-based (superadmin/admin/viewer) via allowed_emails |
| Rate limiting      | 5 OTP requests per email per 15 min                  |
| Encryption at rest | AES-256-GCM per field, master key in env var         |
| Transport          | HTTPS via Traefik (already in place)                 |
| Audit              | Every vault access and login logged                  |
| Session            | JWT 24h expiry                                       |
| Notification       | Email on every login                                 |
| Backup             | Daily pg_dump (credentials are encrypted in dump)    |

---

## 9. Migration Path

1. Add `otp_codes`, `allowed_emails`, `credentials`, `service_tokens` tables via GORM auto-migrate.
2. Seed `allowed_emails` with expertostird@gmail.com (superadmin).
3. Add `actor_email` column to `audit_logs`. Populate from existing `user_id` joins. Keep `user_id` as deprecated nullable column.
4. Deprecate `users.password_hash` (set nullable), do NOT drop yet. Remove in a future release after confirming OTP works in production.
5. Update auth middleware: new JWT claims structure, support both JWT and service token auth.
6. Update `sessions` table FK from `user_id` to `allowed_email_id`.
7. Add `VAULT_MASTER_KEY`, `VAULT_MASTER_KEY_OLD`, and `NOTIFICATION_EMAIL` to env.template and docker-compose.yml.
8. Verify SMTP is configured and working before deploying (OTP depends on it).

### Rollback Plan

If OTP auth fails in production: re-enable password login by restoring the old auth handler (password fields are still in DB). The old JWT claims structure can coexist temporarily — middleware checks for both formats.
