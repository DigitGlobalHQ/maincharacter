# MAINCHARACTER — LAUNCH CHECKLIST

> The complete operational sequence to move from Wati to a fully-owned stack: Meta WhatsApp Cloud API + MSG91 SMS + Resend email + the V3 autopilot prompt for code.
> Follow top-to-bottom. Each step says what to do, why, how long, and what to capture.
> Total elapsed time: ~4 days end-to-end. Total *your* time: ~3 hours spread across those days.

---

## SAVE-AS-YOU-GO: keep these in a separate document

You will collect 11 secrets across the next 4 days. Keep them in a temporary doc (don't commit to git, don't paste in Slack). At Phase D you'll paste all of them into Render in one batch.

```
WHATSAPP_ACCESS_TOKEN       = <Meta system user token, captured in C5>
WHATSAPP_PHONE_NUMBER_ID    = <numeric ID under the phone in WABA, captured in C3>
WHATSAPP_BUSINESS_ACCOUNT_ID= <WABA ID, captured in B3>
WHATSAPP_APP_SECRET         = <Meta App settings → Basic, captured in C6>
WHATSAPP_VERIFY_TOKEN       = <UUID you generate locally, captured in C6>
MSG91_AUTH_KEY              = <MSG91 dashboard, captured in B4>
MSG91_TEMPLATE_ID_OTP       = <DLT-approved OTP template ID, captured in C-DLT-approval>
MSG91_SENDER_ID             = <6-letter DLT-approved sender ID, captured in C-DLT-approval>
RESEND_API_KEY              = <Resend dashboard, captured in B5>
RESEND_FROM_EMAIL           = consultant@maincharacter.digitglobalservices.com
ADMIN_EMAIL                 = <your founder email>
```

---

## PHASE A — TONIGHT (30 min of your time, then autopilot overnight)

### A1. Cancel Wati subscription (5 min)
- Log into your Wati dashboard.
- Settings → Subscription → Cancel. Confirm.
- If a Wati support agent reaches out trying to retain you, reply: *"Migrating to direct WhatsApp Cloud API. Please confirm number 9958533994 is released from your WABA."*
- **Save:** cancellation confirmation email.
- **Why:** stops the billing clock and tells Wati to release any locks on the number.

### A2. Back up chat history (5 min, only if you have important chats)
- Open WhatsApp Business app on the phone with 9958533994.
- Settings → Chats → Chat backup → Back up to Google Drive → Back Up Now.
- Wait for completion. (If you don't care about chat history, skip this.)
- **Why:** once you delete the account in A3, those chats are gone.

### A3. Delete the WhatsApp Business account on 9958533994 (5 min)
- Open WhatsApp Business app on the phone.
- Settings → Account → Delete my account.
- Enter `+919958533994`. Tap "Delete my account."
- Pick any reason ("Other" is fine).
- Confirm.
- Once it says "Account deleted," uninstall the WhatsApp Business app from the phone (or at minimum log out fully).
- **Why:** Meta will not let you register this number on Cloud API while it's still bound to the app. This step releases the number.
- **Cooling timer starts now: 24-72 hours before Meta will accept the number on Cloud API.**

### A4. Launch the V3 autopilot prompt (5 min)
- Open VS Code → open `MainComponent` folder.
- Open integrated terminal (`` Ctrl+` ``).
- Run:
  ```
  cd ~/Desktop/MainComponent
  git pull
  git add AUTOPILOT_PROMPT_V3.md LAUNCH_CHECKLIST.md
  git commit -m "docs: night-3 prompt + launch checklist"
  git push
  claude --dangerously-skip-permissions
  ```
- Open `AUTOPILOT_PROMPT_V3.md` in VS Code. Select everything between `===== BEGIN PASTE =====` and `===== END PASTE =====`. Copy.
- Paste into the Claude Code terminal. Press Enter.
- Open three more terminal tabs (`+` button):
  - Tab 2: `caffeinate -dis` (keeps Mac awake)
  - Tab 3: `tail -f PROGRESS.log` (live progress)
  - Tab 4: `while true; do clear; git log --oneline -20; sleep 15; done` (commit watcher)
- Confirm you see Claude reading CLAUDE.md within 60 seconds.
- **Save:** nothing. Just verify it's working.
- **Why:** Claude codes overnight in parallel to your operational setup. Saves 2-3 days.

### A5. Sleep
- Claude will work through P0-P8 over the next 30-60 minutes, then commits and pushes.
- Your laptop stays on, plugged in.
- The Meta 24h cooling timer continues during sleep.

---

## PHASE B — TOMORROW MORNING (~1 hour of your time)

### B1. Verify the overnight autopilot run (10 min)
- Open VS Code → `MainComponent`.
- Open the Claude Code terminal — scroll through to see the recap.
- Open `PROGRESS.log` — should show entries through P8.
- In a new terminal: `git log --oneline | head -30` — should show ~10-15 new Night-3 commits.
- Visit `https://maincharacter.digitglobalservices.com/health` in browser — confirm:
  - `status: healthy`
  - `messaging.provider: "whatsapp-cloudapi"`
  - `messaging.mode: "allowlist"`
  - `messaging.configured: false` (expected — no credentials yet)
- Read `DECISIONS.md` — confirm the channel decisions are logged.
- Read `BACKLOG.md → NIGHT 3 — FOUNDER ACTIONS` — this is your remaining work list.
- **Why:** confirm Claude shipped what was promised before you continue.

### B2. Create your Meta Business Manager (15 min)
- Go to `business.facebook.com` in a browser.
- Sign in with your personal Facebook account (must be a real, used FB account — Meta blocks brand-new throwaway accounts).
- Click "Create account" (top right).
- Business name: **Digit Global Services**
- Your name + your work email (`digitglobal.org@gmail.com` is fine).
- Click Submit.
- **Save:** the URL of your Business Manager dashboard (you'll come back here often).
- **Why:** this is the parent container for everything WhatsApp-related. Owned by Digit Global Services.

### B3. Create the MainCharacter WhatsApp Business Account (15 min)
- Inside Business Manager: click the gear icon (top right) → **Business Settings**.
- Left sidebar → **Accounts → WhatsApp Accounts** → click "+ Add" → "Create a new WhatsApp Business Account."
- **Display name:** `MainCharacter` (this is what users see in their WhatsApp chat header).
- **Category:** Education.
- **Description:** `Your personal growth consultant. Daily protocol. Real change.`
- **Timezone:** Asia/Kolkata.
- Submit.
- Meta starts reviewing the display name immediately — 24-72h, sometimes instant.
- **Save:** the WABA ID (long numeric string visible in the WABA settings page header) → this is `WHATSAPP_BUSINESS_ACCOUNT_ID`.

### B4. Sign up for MSG91 + start DLT registration (15 min)
- Go to `msg91.com` → "Sign Up Free."
- Use `digitglobal.org@gmail.com` + your phone.
- Add ₹500 prepaid balance (Dashboard → Wallet → Add Money → UPI/card).
- Settings → DLT Configuration → click "Start DLT Registration."
- MSG91 will redirect you to TRAI's DLT portal (Tanla, Vilpower, Smartping, or Airtel — pick one). Complete the entity registration (your PAN + a contact phone number).
- DLT entity approval: **1-2 business days, free** (this is required by Indian regulation to send any SMS).
- Once entity is approved, you submit your OTP template content. MSG91's dashboard has a template wizard for this.
- **Save:** `MSG91_AUTH_KEY` (visible in MSG91 Dashboard → API → Authkey).
- **Why:** Indian SMS regulation requires DLT registration. Without it, no SMS OTP. Start it NOW because of the 1-2 day wait.

### B5. Sign up for Resend + verify your sending domain (15 min)
- Go to `resend.com` → Sign Up (free tier).
- Dashboard → Domains → "Add Domain" → enter `digitglobalservices.com`.
- Resend will show 3 DNS records to add: SPF (TXT), DKIM (TXT), and a return-path (CNAME or TXT).
- Open your DNS provider's panel (wherever you bought `digitglobalservices.com` — likely GoDaddy, Namecheap, Hostinger, or Cloudflare based on the subdomain working).
- Add each of the 3 records exactly as Resend shows them.
- Wait 5-30 min for DNS propagation, then click "Verify" in Resend.
- Once verified: Dashboard → API Keys → "Create API Key" → name it `production`, scope to your verified domain → "Create."
- Copy the key shown ONCE (it disappears after you close).
- **Save:** `RESEND_API_KEY`.
- **Why:** professional transactional email (paywall receipts, Day-7 reports). 3,000 emails/month free covers your first 100 users easily.

---

## PHASE C — DAY 2 & 3 (mostly waiting; ~30 min of your time)

### C1. Wait for the Meta cooling timer (no action)
- 24-72 hours after step A3, the number 9958533994 will be eligible for Cloud API registration.
- You'll know it's ready when step C3 succeeds (you can attempt C3 after 24h and retry if it fails).

### C2. Wait for Meta display-name approval (no action)
- 24-72 hours after step B3, Meta approves "MainCharacter" as the display name.
- You'll get an email titled something like "Your WhatsApp display name is approved."
- If it's rejected (rare), Meta gives a reason — usually about the name being too generic or claiming features. Re-submit with a small variant.

### C3. Wait for MSG91 DLT entity approval (no action)
- 1-2 business days after step B4.
- You'll get an email from your DLT provider when approved.
- Then submit the OTP template content via MSG91's wizard — template approval is another 1-3 days but you can proceed without it for now (MSG91 supports a "test mode" until templates are live).

### C4. Add 9958533994 to your MainCharacter WABA (5 min — AFTER C1 + C2 are done)
- Meta Business Manager → Business Settings → Phone Numbers → "+ Add" → "Add a new phone number."
- Country: +91. Number: 9958533994.
- Display name: MainCharacter (auto-filled from your WABA).
- Verification method: SMS or Voice — pick SMS (faster).
- Meta sends a 6-digit code to 9958533994. Receive it on the phone (you can put the SIM in any phone, even your personal one for this step).
- Enter the code → number is now bound to your Cloud API.
- **Save:** `WHATSAPP_PHONE_NUMBER_ID` (visible on the phone number's page in WABA — a long numeric ID, NOT the phone number itself).
- **Why:** this is the routing endpoint. From now on, any message to 9958533994 hits your server's webhook, not any phone app.

### C5. Generate your never-expiring access token (5 min)
- Business Settings → **Users → System Users** → "+ Add" → name `maincharacter-api`, role **Admin**. Create.
- Click on the new system user → "Add Assets" → WhatsApp Accounts → check the MainCharacter WABA → permission: **Full Control**. Save.
- Still on the system user page → click **"Generate New Token."**
- Select your app — if no app exists, you'll first need to create one:
  - Go to `developers.facebook.com` → My Apps → Create App → "Business" → name `MainCharacter Backend` → submit → comes back to Meta Business Manager.
- Token permissions to include:
  - `whatsapp_business_messaging`
  - `whatsapp_business_management`
- Token expiration: **Never**.
- Click "Generate Token." The token appears once — copy it immediately.
- **Save:** `WHATSAPP_ACCESS_TOKEN`.
- **Why:** this is the authorization for every WhatsApp API call your server makes. Never-expiring = no rotation pain.

### C6. Generate webhook secrets (2 min)
- In your VS Code terminal, run:
  ```
  node -e "console.log(require('crypto').randomUUID())"
  ```
- Copy the UUID output. **Save:** `WHATSAPP_VERIFY_TOKEN`.
- In Meta Business Manager → your App (developers.facebook.com → My Apps → MainCharacter Backend) → Settings → Basic → App Secret → click "Show" → copy.
- **Save:** `WHATSAPP_APP_SECRET`.
- **Why:** these two strings let your server prove its identity to Meta, and let your server verify that incoming webhooks are really from Meta.

### C7. Submit message templates for approval (10 min — start after C4 completes)
- Business Manager → **WhatsApp Manager** → Templates → "Create Template."
- Submit each of these one at a time. **Category for all: Utility** (better delivery rates and lower per-message cost than Marketing).
- Reuse the exact copy you had in Wati (or pull from `data/orator-content.js` in your repo).

| Name | Category | Variables | What it sends |
|---|---|---|---|
| `welcome` | Utility | `{{1}}=name` | Welcome message + START NOW invitation |
| `day_one_morning` | Utility | `{{1}}=name` | Day 1 morning protocol |
| `day_n_morning` | Utility | `{{1}}=name, {{2}}=day` | Days 2-7 morning protocol |
| `evolution_report_ready` | Utility | `{{1}}=name` | Day-7 Evolution Report announcement |
| `payment_confirmation` | Utility | `{{1}}=name, {{2}}=plan` | Subscription activated |
| `subscription_paused` | Utility | `{{1}}=name` | Subscription cancelled/paused |
- Each one: Submit → Meta reviews in 24-48 hours. You can submit all six in one sitting.

---

## PHASE D — DAY 3-4 LIVE ACTIVATION (~30 min)

### D1. Paste all secrets into Render (10 min)
- Open `https://dashboard.render.com` → your `maincharacter` service → **Environment** tab.
- Add each row from your saved secrets document. Click "Save Changes."
- Render will auto-redeploy in 3-5 minutes.
- During the redeploy, watch the deploy logs: confirm no env-var warnings, confirm boot completes with `[whatsapp] using provider: cloudapi`.

### D2. Connect your webhook to Meta (10 min — only after Render redeploys)
- Meta Business Manager → your app → **WhatsApp → Configuration**.
- **Webhook section** → Edit.
- Callback URL: `https://maincharacter.digitglobalservices.com/api/webhook/whatsapp`
- Verify Token: paste the `WHATSAPP_VERIFY_TOKEN` you generated in C6.
- Click "Verify and Save." Meta sends a GET request to your endpoint → your server replies with the challenge → success.
- Subscribe to webhook fields: check `messages` only (you don't need status callbacks for v1).
- Save.

### D3. Smoke test live (10 min)
- Run: `curl https://maincharacter.digitglobalservices.com/health | jq` — confirm:
  - `messaging.provider: "whatsapp-cloudapi"`
  - `messaging.configured: true`
  - `config.sms.configured: true`
  - `config.email.configured: true`
- Log into `/admin` (your admin password from Night 1).
- Use the "Send custom message" tool → To: your number → Message: `◆ Production test. Cloud API live. ◆`
- Check your WhatsApp — message should arrive in 5-30 seconds with sender name "MainCharacter."
- If it does not arrive: check Render logs for errors, and Meta WhatsApp Manager → Insights for delivery status.

### D4. Soft launch (your call)
- Once D3 passes, flip `WHATSAPP_SEND_MODE=all` in Render env (or leave at `allowlist` for one more day of testing).
- Invite 5-10 friends to `https://maincharacter.digitglobalservices.com/audit`.
- Watch the funnel: audit → score → paywall → Razorpay → confirmation email → Day-1 WhatsApp tomorrow morning.
- Iterate on anything that breaks. By day 5, you have a fully live, fully-owned channel stack.

---

## TROUBLESHOOTING — what to do if something fails

**Meta rejects your display name "MainCharacter":** rare but possible. Reasons usually involve trademark concerns or generic names. Re-submit as "MainCharacter Protocol" or "MainCharacter Consultant." Meta accepts variants.

**Meta says "This phone number is already in use" when you try C4:** the cooling period isn't over yet, OR Wati hasn't released the number from their WABA. Action: wait another 24h, then if still failing, email Wati support: `support@wati.io` with `"Please confirm 9958533994 has been disconnected from your WABA. Migration ticket: <your Wati cancellation reference>"`. They usually resolve within 1 business day.

**MSG91 DLT registration stuck:** the DLT process is run by Indian telecom regulators, not MSG91. Reach out via MSG91 chat support — they walk you through. Allow up to 3 business days. In the meantime, the SMS provider is in DRY-RUN, so users can still complete the audit (they just won't get an SMS receipt — they get the email receipt via Resend instead, which works immediately).

**Resend domain verification fails:** DNS records often take 1-12 hours to propagate. If it's been longer, the most common issue is a typo in the TXT record or your DNS provider auto-appending the domain. Re-check the records exactly match Resend's display. Use `dig TXT digitglobalservices.com` in terminal to check what your DNS actually says.

**Webhook verification fails in D2:** the verify token in Meta must EXACTLY match `WHATSAPP_VERIFY_TOKEN` in Render. Whitespace matters. Re-paste both. If still failing, check Render logs — your server should log `[whatsapp] webhook challenge received` when Meta hits it. If no log entry, the URL is wrong (check the exact path with trailing slashes).

**Templates rejected:** Meta sometimes rejects for "too promotional" or "claims a benefit." For Utility templates, the rule is: must describe a specific transaction or event, not a marketing claim. If "evolution_report_ready" is rejected, try "Your Day 7 protocol report is ready for {{1}}" — neutral language.

---

## What's safe to do in any order

- A1 and A3 (cancel Wati + delete app) before A4 (autopilot prompt).
- A4 can run anytime tonight — it doesn't depend on Meta or anything operational.
- B4 (MSG91) and B5 (Resend) can be done in any order. MSG91 has a longer waiting tail (DLT) so start it first.
- B2 + B3 (Meta Business Manager + WABA) must be done in that order.

## What MUST be sequential

- A3 must happen at least 24 hours before C4. Don't skip the cooling timer — Meta will reject.
- B3 (create WABA) must happen at least 24 hours before C4 (in practice these wait timers overlap, which is why your total elapsed time is 3-4 days not 7).
- C4 must happen before C5 (token requires the WABA to have a phone).
- C7 (templates) can be done before D1 but templates are tied to the WABA, not the API token.
- D1 must happen before D2 (Meta webhook verification requires your server to know the verify token).

---

End of checklist. Print this or keep it open in a side tab. Tick items as you go.
