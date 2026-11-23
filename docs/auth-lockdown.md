# Sign-in and database lockdown (Stage S)

The portal's old login screen was cosmetic: it called a home-made `app_login` function and did not protect the data, and the public (publishable) key cannot be hidden in a static website. The protection is now in the database: **it refuses anyone who is not a signed-in, approved member**. The portal change here is the portal's side of that (real sign-in with Supabase Auth, email + password, one account per person).

## Order (read this before applying anything)
1. **Deploy the portal first.** It is safe to deploy BEFORE Stage B: the database still accepts the public key, so nothing breaks while people sign in for the first time. (It does need `auth-stage-a.sql`, because it calls `app_whoami()` and reads `app_members`.)
2. `supabase/auth-stage-a.sql` (additive, idempotent, anon access unchanged): members table, helper functions, policies for signed-in members.
3. Create the five accounts in the Supabase dashboard (Authentication → Users → Add user), then seed `app_members` (template at the bottom of Stage A; the assistant runs it).
4. **Every member signs in once** (Royce admin; Lynton, Gerry, Mike, Peter members).
5. `supabase/auth-stage-b.sql` (**the lockdown**). Only after step 4. It removes all anon access. The old portal stops working at that moment. A one-paste ROLLBACK is at the bottom of the file.

## Who can do what
Members use the portal normally. **Only the admin** sees Settings → Activity, the Version history panel (Data & backup) and Admin → people. These are hidden in the page AND refused by the database (members never send those requests). A member can read and update the document, can never add or delete the row, and can only write activity rows under their own display name.

## What the portal does
- Sign-in: `POST /auth/v1/token?grant_type=password` with the publishable key as `apikey`. The session (access token, refresh token, expiry) is kept in its own localStorage key (`<prefix>business-tracker-auth`), separate from the data. The password is never stored.
- Every data request carries `Authorization: Bearer <token>`. No session means no data request at all.
- Refresh about 60 seconds before expiry, and once on any 401. Tokens rotate, so the new pair is written in one go; a small localStorage lock stops two tabs spending the same refresh token.
- After sign-in it asks `app_whoami()` for the display name, role and active flag. Not a member, or switched off: "Your account isn't approved for this portal. Ask Royce." and signed out again.
- The signed-in display name is the identity everywhere (read-only "Acting as …" replaces the old "Who are you?" picker). The activity log's `by` is exactly that name, and the database checks it.
- **Never lose work.** If the session ends mid-edit: one refresh and retry; if that fails the save engine pauses, the chip goes red "Signed out", the edits stay marked unsaved and stored on the device, and a sign-in dialog opens over the page (nothing on screen is reset). It offers "Download my data" and "Not now, keep my work on screen". After signing in it resumes by itself; if the cloud has moved meanwhile, the Save Safety load check runs first (rescue copy, then you choose). Live refresh, the 30-minute check and the activity flush stay quiet while signed out.
- Account menu: **Change password** (minimum 12 characters) and **Sign out**. Sign out with unsaved changes warns, offers a download, keeps a rescue copy and the local copy. Sign out with everything saved removes the local data copy from this browser.
- No key that can create users is in the page. "Add a person" is instructions only.

## Page hardening
- `<meta name="robots" content="noindex,nofollow">` and `<meta name="referrer" content="no-referrer">`.
- A Content-Security-Policy meta tag (inventory below). Tokens never appear in a URL or the console.
- Limits (be honest about them): a meta tag **cannot set `frame-ancestors`** (anti-clickjacking needs a real HTTP header, which GitHub Pages does not offer); the page is one file with inline scripts and styles, so `script-src` has to allow `'unsafe-inline'`, which means the policy limits where code can *load from* and where data can *go* (`connect-src`), but it does not stop an injected inline script. It still stops stolen data being sent to any host other than the Supabase project.

### Inventory of everything the page loads
| What | Host | Needed for | Allowed by |
| --- | --- | --- | --- |
| The page itself | its own origin | everything | `'self'` |
| Supabase REST and Auth | the project URL | saving, sign-in | `connect-src` |
| Google Fonts stylesheet (Inter, Source Serif 4, and the chosen brand font) | `fonts.googleapis.com` | typography | `style-src` |
| Google Fonts files | `fonts.gstatic.com` | typography | `font-src` |
| docx and ExcelJS (loaded only when you press Word / Excel export) | `cdnjs.cloudflare.com` | exports | `script-src` |
| Images | data: and blob: URLs only (logos, previews) | branding, previews | `img-src` |
| Invoice / quote preview frames and print windows | `srcdoc` / about:blank, written by the page | previews, printing | inherit the page's policy |
`object-src 'none'`, `base-uri 'none'`, `form-action 'none'`. The Gmail compose link opens in a new tab (navigation, not governed by the policy).
**Not verified here:** the Word and Excel libraries could not be downloaded in the test environment, so they were tested only as "the host is allowed to load a script". If either export fails after this goes live, the likely cause is a library using `eval`; the fix is adding `'unsafe-eval'` to `script-src` (it adds little, given `'unsafe-inline'` is already needed).

## Remaining exposure, and follow-ups
- **The code is public** (this repository is public on GitHub Pages); the data is not: without a signed-in, approved account the database returns nothing.
- Follow-up options: make the repository private (needs a plan that serves private Pages); require a second factor (MFA) for the admin account in Supabase Auth; shorten the access-token lifetime; move user creation to an admin-only server function.
- The old `app_users` table (with password hashes) is **not dropped** by Stage B, only closed to anon and signed-in users; drop it once everyone is happy.
- The old `approver` login role cannot be given any more (members are `admin` or `member`); the admin's "preview approver view" still works.

## Tests
`tests/auth/run.js` (the portal, mocked network, fake credentials), `tests/auth-sql/run.sh` (both SQL files on a throwaway local Postgres 16 with stand-in `anon` / `authenticated` roles and `auth.uid()`; results in `docs/auth-sql-results.md`).

```bash
cd tests/auth
NODE_PATH=$(npm root -g) HTML=../../index.html DOCID=2 PREFIX=bt-test- node run.js results.md
```
