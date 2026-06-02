# Google Sign-In — setup (founder actions)

**Status:** the code is fully built and tested. Google sign-in stays **off** until
the four environment variables below are set in Render. There is nothing to write —
this is a Google Cloud Console + Render configuration job.

When configured, the "Sign in with Google" button appears automatically on:
- `/lookmaxing/start` (the main sign-in entry)
- `/lookmax/login` (the app re-entry page)

It can never "dead-end": the button is only shown after the server confirms OAuth is
configured (via `GET /api/lookmax/auth/method` → `{ "google": true }`).

---

## What happens under the hood (already built — no action needed)
1. User clicks **Sign in with Google** → `GET /api/lookmax/auth/google/start`.
2. We redirect to Google's consent screen (with a signed `state` + an httpOnly nonce
   cookie for CSRF protection).
3. Google redirects back to `…/api/lookmax/auth/google/callback`.
4. We exchange the code for the user's verified email (server-to-server, with the
   client secret), find-or-create the account, and bridge a 45-day session.
5. **First Google sign-in** also triggers the welcome email (once `RESEND_API_KEY`
   is set — see PR C).

---

## Step 1 — Google Cloud project + consent screen
1. Go to <https://console.cloud.google.com/> and create (or pick) a project.
2. **APIs & Services → OAuth consent screen.**
   - User type: **External**.
   - App name: **MainCharacter**. Support email: your email.
   - Scopes: add **`openid`**, **`.../auth/userinfo.email`**, **`.../auth/userinfo.profile`**.
   - Authorized domain: **`digitglobalservices.com`**.
   - Save. While testing you can leave it in **Testing** mode and add your own Google
     account under **Test users**; click **Publish app** when you're ready for the public.

## Step 2 — Create the OAuth Client ID
1. **APIs & Services → Credentials → Create Credentials → OAuth client ID.**
2. Application type: **Web application**. Name: e.g. `MainCharacter Web`.
3. **Authorized JavaScript origins:**
   ```
   https://maincharacter.digitglobalservices.com
   ```
4. **Authorized redirect URIs** — must match EXACTLY (no trailing slash):
   ```
   https://maincharacter.digitglobalservices.com/api/lookmax/auth/google/callback
   ```
5. Create. Copy the **Client ID** and **Client secret**.

## Step 3 — Set the env vars in Render
In the Render dashboard → your service → **Environment**, add:

| Key | Value |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | the Client ID from Step 2 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | the Client secret from Step 2 |
| `JWT_SECRET` | a long random string (≥ 32 chars) — **required** to issue sessions securely |
| `GOOGLE_OAUTH_REDIRECT_URI` | *(optional)* only if your callback differs from the default `${UPGRADE_BASE_URL}/api/lookmax/auth/google/callback` |

> `JWT_SECRET` is mandatory once any real sign-in path is live. Without it, sessions
> fall back to a dev string — do not ship that. (CLAUDE.md §6.)

Save → Render redeploys automatically.

## Step 4 — Verify on live (2 minutes)
1. `https://maincharacter.digitglobalservices.com/api/lookmax/auth/method`
   → should return `{"method":…,"google":true}`.
2. Open `/lookmaxing/start` on your phone → the **Sign in with Google** button is visible.
3. Tap it → Google consent → you land back signed in on `/lookmaxing/quiz`.
4. Open `/admin` → your sign-in appears under **Signed-up Users** with **Via = google**
   and a **Last sign-in** time (PR B).
5. If `RESEND_API_KEY` is set, confirm the welcome email arrived (first sign-in only).

---

## Troubleshooting
- **`redirect_uri_mismatch`** — the redirect URI in Step 2.4 must match the server's
  callback character-for-character (scheme, host, path, no trailing slash).
- **Button doesn't appear** — `/api/lookmax/auth/method` is returning `google:false`;
  the two env vars in Step 3 aren't both set (or the service hasn't redeployed yet).
- **`google_unavailable` / `google_signin` in the URL** — OAuth isn't configured, or
  the token exchange failed; check the Render logs for the `[LOOKMAX-AUTH:GOOGLE]` line.
- **"App isn't verified" warning** — expected while the consent screen is in Testing
  mode or unverified; add yourself as a Test user, or complete Google's verification
  before public launch.
