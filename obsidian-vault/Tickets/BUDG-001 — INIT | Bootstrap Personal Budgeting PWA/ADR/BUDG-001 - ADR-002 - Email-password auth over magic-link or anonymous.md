# BUDG-001 — ADR-002 — Email-password auth over magic-link or anonymous

**Ticket:** [[BUDG-001]] — Bootstrap Personal Budgeting PWA
**Date:** 2026-04-26
**Status:** Accepted
**Supersedes:** none

---

## Context

The app needs **cross-device data sync** (iPhone PWA + macOS) for the same user. Supabase offers three auth strategies relevant here:

1. **Magic link** — passwordless email-based, default in Supabase examples
2. **Anonymous sign-in** — instant device-bound user with no credentials
3. **Email + password** — classic credentials, persistent account

During build we tried each in order and hit real-world blockers:

- **Magic link**: works locally but Supabase free tier rate-limits transactional emails to ~3–4/hour. After several test sign-ups, the email queue locked us out for an hour. Recovering required either waiting or Dashboard intervention.
- **Anonymous**: solves the friction (zero clicks to first use), but anonymous users are bound to one device's localStorage. Clearing storage / reinstalling iOS / using a second device = data loss with no recovery path. Conflicts with the cross-device sync requirement.
- **Email + password**: works on both devices, no email rate limits after the user is provisioned (login is purely API), and recovery is possible via password reset or admin API.

Constraints:
- Single-user app; UX friction at login is acceptable but should be minimal (login once per device, then PWA stays signed in)
- Must survive `localStorage` clears on at least one device
- Must work on iPhone PWA without email round-trips after initial setup

---

## Decision

Use **Supabase email + password auth**. Provision the user account once via Supabase admin API (bypasses email-confirmation rate limits). Configure the Supabase client with `persistSession: true` and `autoRefreshToken: true` so the session survives reloads and refreshes JWTs in the background.

Keep the email + password form on `AuthPage.tsx` with a magic-link toggle as a fallback (in case password is forgotten in the future and recovery needs the email channel).

Do NOT use anonymous sign-in (incompatible with cross-device requirement).

---

## Consequences

### Positive
- Cross-device sync works out of the box: same email + password on iPhone and macOS = same data.
- No email rate-limit issues during normal use (login is direct API call).
- Standard Supabase RLS policies (`user_id = auth.uid()`) work unchanged.
- Recovery is well-defined: password reset email or admin-API reset.

### Negative
- One-time friction on each new device: enter email + password.
- User must remember the password (mitigated by iCloud Keychain / 1Password).
- Initial provisioning required service-role key (admin API) because email confirmation hit rate limits during testing — not reproducible by an end user without the same workaround.

### Neutral
- Magic-link option remains available in the UI as a fallback.
- Switching to OAuth (Apple / Google) later would be additive, not a replacement.

---

## Alternatives considered

### Option A — Magic link only
- Pros: Passwordless, fewer credentials to manage.
- Cons: Hits Supabase free-tier email rate limits during testing; every login = email round-trip (annoying on a phone).
- Rejected because: rate limits broke the dev loop; UX of waiting for an email per login is worse than typing a password once and staying signed in.

### Option B — Anonymous sign-in
- Pros: Zero-friction first use; no credentials at all.
- Cons: Device-bound — clearing storage or using a second device creates a new orphaned user; data loss is silent and unrecoverable.
- Rejected because: violates cross-device sync requirement. (Briefly tried during build — see [[BUDG-001 - 2026-04-26 - bootstrap-and-deploy]] — and reverted same day.)

### Option C — OAuth via Apple Sign In
- Pros: Native on iOS, no password to manage, recoverable by iCloud.
- Cons: Requires Apple Developer membership ($99/year) for production credentials; defeats "free hosting" goal.
- Rejected because: cost is disproportionate for a personal app.

### Option D — OAuth via Google
- Pros: Free, recoverable, works cross-device.
- Cons: Requires Google Cloud OAuth client setup, a verified consent screen, and adds a third-party dependency.
- Deferred (not rejected): viable to add later as an "Add Google login" button alongside email+password.

---

*Part of [[BUDG-001]]*
