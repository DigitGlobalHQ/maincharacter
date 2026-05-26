# WhatsApp Cloud API — Setup (Meta Graph v18.0)

How to take the Orator WhatsApp channel from DRY-RUN to live. Until the env vars
below are set, `services/whatsapp.js` logs every send as a DRY-RUN and makes no
network call — the app runs fine, it just doesn't message anyone. This is the
expected production state until Meta approval completes.

Replaces the removed Wati integration (see `DECISIONS.md` → Night 3).

---

## 1. Meta Business Manager + WABA

1. Cancel the Wati subscription in the Wati dashboard.
2. Free up phone number **9958533994** — if the WhatsApp Business app is
   installed on a phone with this number, delete it, then wait ~24h.
3. Create a personal Meta Business Manager at <https://business.facebook.com>.
4. Inside it, create a **WhatsApp Business Account (WABA)**:
   - Display name: **MainCharacter**
   - Category: **Education**
5. Add phone **9958533994** to the WABA.
6. Wait for **display-name approval** (typically 24–72h).

## 2. Credentials

7. Create a **system user** and generate an access token with permissions
   `whatsapp_business_messaging` + `whatsapp_business_management`.
   → `WHATSAPP_ACCESS_TOKEN`
8. From the WhatsApp → API Setup screen, note:
   - the **phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - the **WhatsApp Business Account ID** → `WHATSAPP_BUSINESS_ACCOUNT_ID`
9. From the Meta **App** settings → Basic, copy the **App Secret**
   → `WHATSAPP_APP_SECRET` (used to verify incoming webhook signatures).
10. Pick (or reuse the generated) **verify token** → `WHATSAPP_VERIFY_TOKEN`.
    The generated value is in `BACKLOG.md`. It only needs to match between the
    Render env var and the Meta App webhook config.

## 3. Message templates (re-submit for approval)

Free-form text only works inside the 24h customer-service window. Outside it you
must use approved templates. Submit these (same copy as the old Wati versions):

- `welcome`
- `day_one_morning`
- `day_n_morning`
- `evolution_report_ready`
- `payment_confirmation`
- `subscription_paused`

## 4. Webhook

11. In the Meta App → WhatsApp → Configuration → Webhooks:
    - **Callback URL:** `https://maincharacter.digitglobalservices.com/api/webhook/whatsapp`
    - **Verify token:** the same `WHATSAPP_VERIFY_TOKEN` value.
    - Meta sends a `GET` with `hub.mode`, `hub.verify_token`, `hub.challenge`;
      our handler echoes the challenge when the token matches.
    - Subscribe to the **messages** field.
12. The old Wati path `/api/webhook/wati` 308-redirects to the new endpoint for a
    30-day grace window, then is removed (tracked in `BACKLOG.md`).

## 5. Go live

13. Paste all env vars into Render (Dashboard → Environment):
    `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
    `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.
14. `curl https://maincharacter.digitglobalservices.com/health | jq .messaging`
    should now show `"configured": true` and `"webhookGuard": "hmac"`.
15. Send a test message to ADMIN_PHONE via `POST /api/admin/send-message`
    (admin JWT required). `WHATSAPP_SEND_MODE` is `allowlist`, so only
    `ADMIN_PHONE` receives it.
16. When verified, flip **`WHATSAPP_SEND_MODE=all`** to message real users.

## Rollback

There is no rollback to Wati — it is gone. If the Cloud API has problems, set
`WHATSAPP_SEND_MODE=off` (all WhatsApp sends become DRY-RUN) and rely on email
(Resend) + SMS (MSG91) until Meta is healthy again. See `RUNBOOK.md`.
