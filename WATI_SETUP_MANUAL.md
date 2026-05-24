# MAINCHARACTER — Wati Setup Manual

**Version:** 1.0  
**Audience:** Solo founder, first 50 users, Week 1 trial operation  
**Platform:** [wati.io](https://www.wati.io)  
**Last updated:** May 2026

---

> This manual assumes you are starting from zero. Every step is written in order.  
> Do not skip ahead. Complete each part before moving to the next.  
> Total setup time: approximately 90 minutes (excluding template approval wait time).

---

## Table of Contents

1. [Account & Profile Setup](#part-1--account--profile-setup)
2. [Contact Setup](#part-2--contact-setup)
3. [Message Templates](#part-3--message-templates)
4. [Broadcast Scheduling](#part-4--broadcast-scheduling)
5. [Saved Replies](#part-5--saved-replies)
6. [Founder's Daily Workflow](#part-6--founders-daily-workflow)
7. [Analytics to Watch](#part-7--analytics-to-watch)
8. [What to Do When Things Go Wrong](#part-8--what-to-do-when-things-go-wrong)

---

## PART 1 — Account & Profile Setup

### 1.1 — Create Your Wati Account

1. Go to [wati.io](https://www.wati.io) and click **Start Free Trial**
2. Sign up with your business email (use your `@digitglobalservices.com` address, not a personal Gmail)
3. Choose the **Standard plan** — this is sufficient for 50 users. You can upgrade later
4. Complete email verification

### 1.2 — Connect a WhatsApp Business Number

**Important:** Use a dedicated phone number. Not your personal number. Not the number you use for anything else.

Options for getting a number:
- **Recommended:** Purchase a new SIM from Airtel/Jio — prepaid is fine. ₹200-300 total
- **Alternative:** Use a virtual number from Twilio or MessageBird (Wati supports both)

Steps:
1. Navigate to **Settings → WhatsApp Setup**
2. Click **Connect a phone number**
3. Wati will guide you through the Meta Business Verification process:
   - You will need a **Meta Business Manager** account (create one at [business.facebook.com](https://business.facebook.com) if you do not have one)
   - Verify your business with a business document (GST certificate, Udyam registration, or incorporation certificate)
   - This verification can take 24–72 hours — **start this step on Day -5 before launch**
4. Once Meta approves, enter your dedicated phone number
5. Wati will send a verification code via SMS to that number — enter it
6. Your number is now connected. Do not use this number for personal WhatsApp ever again

### 1.3 — Configure Business Profile

Navigate to **Settings → Business Profile** and fill in:

| Field | Value |
|---|---|
| **Business Name** | MainCharacter |
| **Category** | Education |
| **Description** | Your personal growth consultant. Three pillars. Daily quests. Real change. |
| **Website** | maincharacter.digitglobalservices.com |
| **Address** | *(your registered business address)* |
| **Email** | support@digitglobalservices.com |

**Profile Photo:**
- Use the dark obsidian background with gold MC monogram
- Dimensions: 640×640px minimum, square
- File: Use the favicon or monogram from your landing page assets
- The photo should be legible at 40×40px (WhatsApp thumbnail size)

Click **Save Profile**.

### 1.4 — Set Business Hours & Auto-Reply

Navigate to **Settings → Business Hours**

**Business Hours:**

| Day | Hours |
|---|---|
| Monday–Saturday | 7:30 AM – 10:00 PM IST |
| Sunday | 8:00 AM – 9:00 PM IST |

**Outside-Hours Auto-Reply Message:**

Navigate to **Automation → Away Message** and enable it.

Set the message to:

```
Your Consultant has noted your message and will respond during the next session window.

Morning window: 7:30–8:30 AM
Evening window: 7:30–9:00 PM

In the meantime, your protocol continues as scheduled.

— MainCharacter
```

**Important notes on brand voice:**
- No exclamation marks anywhere
- No "We'll get back to you ASAP!" or "Thanks for reaching out!"
- The tone is calm, certain, unhurried

---

## PART 2 — Contact Setup

### 2.1 — Create Contact List

1. Navigate to **Contacts → Contact Lists**
2. Click **Create List**
3. Name: `MainCharacter — Week 1 Trial`
4. Click **Save**

You will add users to this list as they complete the web funnel and land on WhatsApp.

### 2.2 — Create Custom Attributes

Navigate to **Settings → Custom Attributes** (or **Contacts → Attributes**, depending on your Wati version).

Create each of these attributes one by one:

| Attribute Name | Type | Purpose |
|---|---|---|
| `pillar_chosen` | Text | `orator`, `aesthetic`, or `sage` |
| `trial_day` | Number | 1 through 7 (current day in trial) |
| `rank` | Number | 1 through 5 (rank level) |
| `rank_name` | Text | The Initiate, The Seeker, The Practitioner, The Adept, The Orator |
| `streak` | Number | Consecutive days completed |
| `aura_sharpness` | Number | 1–10 (Aesthetic pillar) |
| `aura_presence` | Number | 1–10 (Aesthetic pillar) |
| `aura_vibe` | Number | 1–10 (Aesthetic pillar) |
| `paid_status` | Text | `trial`, `pro-monthly`, `pro-annual`, `expired` |
| `fluency_baseline` | Number | Day 1 fluency score (Orator pillar) |
| `fluency_current` | Number | Latest fluency score |
| `join_date` | Date | When they entered the trial |
| `notes` | Text | Your personal notes on this user |

For each attribute:
1. Click **Add Attribute**
2. Enter the name exactly as shown (lowercase with underscores)
3. Select the type
4. Click **Save**

### 2.3 — Create Contact Tags

Navigate to **Contacts → Tags** and create these tags:

| Tag | Colour | Used For |
|---|---|---|
| `orator-trial` | Amber/Orange | Currently in Orator 7-day trial |
| `aesthetic-trial` | Purple | Currently in Aesthetic 7-day trial |
| `sage-trial` | Teal/Green | Currently in Sage 7-day trial |
| `paid-pro` | Gold/Yellow | Paid Pro Monthly subscriber |
| `paid-annual` | Gold/Yellow | Paid Pro Annual subscriber |
| `at-risk` | Red | Has not responded in 48+ hours |
| `day7-pending` | Orange | On Day 7, paywall sent, no payment yet |
| `converted` | Green | Completed payment |
| `churned` | Grey | Did not convert after Day 7 |

### 2.4 — Import Contacts via CSV

If you have a batch of users (from a waitlist, landing page signups, etc.):

1. Navigate to **Contacts → Import**
2. Download the CSV template from Wati
3. Format your CSV with these columns:

```csv
phone,name,pillar_chosen,trial_day,paid_status
919876543210,Aarav Mehta,orator,1,trial
919876543211,Priya Sharma,aesthetic,1,trial
919876543212,Rohit Kapoor,sage,1,trial
```

**Phone number format:** Country code + number, no `+` sign, no spaces, no dashes.  
Example: `919876543210` (India = 91)

4. Upload the CSV
5. Map columns to Wati fields (Wati will show you a mapping screen)
6. Click **Import**
7. After import, select all new contacts → **Add to List** → `MainCharacter — Week 1 Trial`
8. Tag each contact with their pillar tag (`orator-trial`, etc.)

### 2.5 — Add Contacts Manually (One by One)

For users who complete the web funnel individually:

1. Navigate to **Contacts → Add Contact**
2. Enter:
   - Phone: full number with country code (e.g., `+91 98765 43210`)
   - Name: their name (as entered in the funnel)
3. Click **Save**
4. Open the contact → click **Edit**
5. Set custom attributes:
   - `pillar_chosen`: their chosen pillar
   - `trial_day`: `1`
   - `paid_status`: `trial`
   - `join_date`: today's date
6. Add to list: `MainCharacter — Week 1 Trial`
7. Add tag: `orator-trial` (or appropriate pillar tag)

---

## PART 3 — Message Templates

### Understanding Template Types

WhatsApp has two message categories. This distinction is critical:

| Type | When You Can Send | Approval Required | Cost |
|---|---|---|---|
| **Template Messages** (Broadcast) | Any time, to any opted-in contact | Yes — Meta must approve | ~₹0.50–0.80 per message |
| **Session Messages** (Replies) | Within 24 hours of user's last message | No | Free on most Wati plans |

**Strategy:**
- Submit your 4 broadcast templates **at least 3 days before launch** (Day -3)
- Most of your daily Consultant messages will be session messages (responding to user voice notes, photos, and replies) — these need no approval
- If a template gets rejected, you can still operate using session messages (see Part 8)

### 3.1 — Submit Templates for Approval

Navigate to **Settings → Message Templates → Create Template**

#### Template 1: `mc_welcome`

| Field | Value |
|---|---|
| **Template Name** | `mc_welcome` |
| **Category** | Utility |
| **Language** | English |

**Body:**
```
Hello {{1}}, welcome to MainCharacter.

Your {{2}} Consultant is ready. Your 7-day protocol begins now.

Reply *YES* to start.
```

**Variables:**
- `{{1}}` = Contact name
- `{{2}}` = Pillar name (Orator / Aesthetic / Sage)

**Sample values** (required by Meta):
- `{{1}}` = Aarav
- `{{2}}` = Orator

---

#### Template 2: `mc_morning_quest`

| Field | Value |
|---|---|
| **Template Name** | `mc_morning_quest` |
| **Category** | Utility |
| **Language** | English |

**Body:**
```
Good morning {{1}}.

Day {{2}} quest is ready. Your Consultant has your recording prompt.

Reply *READY* to receive it.
```

**Variables:**
- `{{1}}` = Contact name
- `{{2}}` = Day number (1–7)

**Sample values:**
- `{{1}}` = Aarav
- `{{2}}` = 3

---

#### Template 3: `mc_evening_reading`

| Field | Value |
|---|---|
| **Template Name** | `mc_evening_reading` |
| **Category** | Utility |
| **Language** | English |

**Body:**
```
{{1}}, your Day {{2}} reading is in. {{3}} points gained today.

Reply *READ* to see your full analysis.
```

**Variables:**
- `{{1}}` = Contact name
- `{{2}}` = Day number
- `{{3}}` = Points gained (e.g., "+4 fluency")

**Sample values:**
- `{{1}}` = Aarav
- `{{2}}` = 3
- `{{3}}` = +4 fluency

---

#### Template 4: `mc_day7_paywall`

| Field | Value |
|---|---|
| **Template Name** | `mc_day7_paywall` |
| **Category** | Marketing |
| **Language** | English |

**Body:**
```
{{1}}, your Weekly Evolution Report is ready.

Fluency: {{2}} → {{3}}

Your Day 8 quest is prepared. Reply *DAY8* to continue.
```

**Variables:**
- `{{1}}` = Contact name
- `{{2}}` = Day 1 fluency score
- `{{3}}` = Day 7 fluency score

**Sample values:**
- `{{1}}` = Aarav
- `{{2}}` = 67
- `{{3}}` = 81

> **Note:** This template is **Marketing** category because it promotes a paid upgrade. Marketing templates have a slightly higher rejection rate. If rejected, resubmit under **Utility** with softer language, or send this message as a session reply instead.

---

### 3.2 — Submitting Templates

For each template:
1. Click **Submit for Review**
2. Meta's review typically takes **24–72 hours** (weekdays)
3. Check status in **Message Templates** — it will show `Pending`, `Approved`, or `Rejected`

### 3.3 — If a Template Is Rejected

Common rejection reasons and fixes:

| Rejection Reason | Fix |
|---|---|
| "Potentially abusive or threatening" | Remove any urgency language. Replace "begins now" with "is ready when you are" |
| "Variable content mismatch" | Ensure sample values match the format described in the body |
| "Missing opt-out" | Not required for Utility templates, but for Marketing: add "Reply STOP to opt out" at the bottom |
| "URL not allowed in body" | Move URLs to a button (use Wati's "Call to Action" button with URL type) |

**If repeated rejections:** Abandon the template and use session messages instead (see Part 8 — Contingency).

---

## PART 4 — Broadcast Scheduling

### 4.1 — Navigating to Broadcasts

1. Navigate to **Campaigns → Broadcast**
2. Click **Create Broadcast**

### 4.2 — Full 7-Day Broadcast Schedule

Below is every broadcast you need to schedule. Set all of these up **before Day 1** so the entire week runs automatically.

**Timezone:** IST (Asia/Kolkata) — set this once in your Wati account settings under **Settings → General → Timezone**

**Audience filter for all:** Contact List = `MainCharacter — Week 1 Trial`

---

#### Day 1

| Time | Template | Variables | Notes |
|---|---|---|---|
| **8:00 AM** | `mc_welcome` | `{{1}}` = name, `{{2}}` = pillar | The very first message. Sets the tone. |
| **8:00 PM** | *(Session message)* | — | Send manually after user completes baseline recording and responds to audit. This is a reply to their conversation, not a broadcast. |

> **Day 1 Evening is manual.** The user will have replied YES, completed the audit questions, and sent a voice note. You reply within their 24-hour session window. No broadcast needed.

---

#### Day 2

| Time | Template | Variables | Notes |
|---|---|---|---|
| **7:45 AM** | `mc_morning_quest` | `{{1}}` = name, `{{2}}` = 2 | Morning quest delivery |
| **8:00 PM** | `mc_evening_reading` | `{{1}}` = name, `{{2}}` = 2, `{{3}}` = score delta | Evening analysis |

---

#### Day 3

| Time | Template | Variables | Notes |
|---|---|---|---|
| **7:45 AM** | `mc_morning_quest` | `{{1}}` = name, `{{2}}` = 3 | |
| **8:00 PM** | `mc_evening_reading` | `{{1}}` = name, `{{2}}` = 3, `{{3}}` = score delta | |

---

#### Day 4

| Time | Template | Variables | Notes |
|---|---|---|---|
| **7:45 AM** | `mc_morning_quest` | `{{1}}` = name, `{{2}}` = 4 | |
| **8:00 PM** | `mc_evening_reading` | `{{1}}` = name, `{{2}}` = 4, `{{3}}` = score delta | |

---

#### Day 5

| Time | Template | Variables | Notes |
|---|---|---|---|
| **7:45 AM** | `mc_morning_quest` | `{{1}}` = name, `{{2}}` = 5 | |
| **8:00 PM** | `mc_evening_reading` | `{{1}}` = name, `{{2}}` = 5, `{{3}}` = score delta | |

---

#### Day 6

| Time | Template | Variables | Notes |
|---|---|---|---|
| **7:45 AM** | `mc_morning_quest` | `{{1}}` = name, `{{2}}` = 6 | |
| **8:00 PM** | `mc_evening_reading` | `{{1}}` = name, `{{2}}` = 6, `{{3}}` = score delta | |

---

#### Day 7 — CONVERSION DAY

| Time | Template | Variables | Notes |
|---|---|---|---|
| **7:45 AM** | `mc_morning_quest` | `{{1}}` = name, `{{2}}` = 7 | Final quest |
| **7:00 PM** | `mc_day7_paywall` | `{{1}}` = name, `{{2}}` = baseline, `{{3}}` = current | The conversion message. Follow up manually. |

> **Day 7 requires manual follow-up.** See Part 6, Section 6.3 for the exact Day 7 routine.

---

### 4.3 — How to Schedule a Broadcast

For each row in the table above:

1. **Campaigns → Broadcast → Create Broadcast**
2. **Broadcast Name:** Use a clear name, e.g., `D2-AM-Quest` or `D5-PM-Reading`
3. **Select Template:** Choose the appropriate template
4. **Fill Variables:**
   - For `{{1}}` (name): Select **Contact Name** from the dropdown — Wati will auto-fill each user's name
   - For `{{2}}` (day number): Type the number directly (e.g., `3`)
   - For `{{3}}` (score): You have two options:
     - **Option A (manual):** Type a generic value like `+4 fluency` that applies broadly
     - **Option B (personalised):** Map to the `fluency_current` custom attribute (requires you to update attributes daily before the evening broadcast)
5. **Audience:**
   - Click **Select Audience**
   - Filter: Contact List = `MainCharacter — Week 1 Trial`
   - For pillar-specific messages, add filter: Tag = `orator-trial` (or appropriate pillar)
6. **Schedule:**
   - Select **Schedule for later**
   - Set date and time (IST)
   - Double-check the date — it is easy to set the wrong day
7. **Review and Confirm**
8. Click **Schedule Broadcast**

### 4.4 — Editing a Scheduled Broadcast

1. Navigate to **Campaigns → Broadcast → Scheduled**
2. Find the broadcast by name
3. Click the **three dots menu (⋮)** → **Edit**
4. Make your changes
5. Click **Update**

You can edit a broadcast any time before its scheduled send time.

### 4.5 — Emergency Stop — Pause All Broadcasts

If something goes wrong and you need to stop everything:

1. Navigate to **Campaigns → Broadcast → Scheduled**
2. Select all scheduled broadcasts (checkbox at top)
3. Click **Cancel Selected** or **Pause**

Alternatively, to pause one at a time:
- Click the broadcast → **⋮** → **Cancel**

Cancelled broadcasts can be rescheduled. They are not deleted.

---

## PART 5 — Saved Replies

Saved replies are pre-written messages you can insert with two clicks during a live conversation. For Week 1, you will use these primarily for Aesthetic pillar Aura Score responses.

### 5.1 — Navigate to Saved Replies

**Settings → Saved Replies → Create Reply**

### 5.2 — Aura Score Saved Replies

Create 9 saved replies covering the range of Aura Score combinations. Each dimension (Sharpness, Presence, Vibe) is categorised as Low (1-4), Mid (5-7), or High (8-10).

**Naming convention:** `AC_` prefix + three letters (S=Sharpness, P=Presence, V=Vibe), each L/M/H.

---

#### `AC_LLL` — All Low (S≤4, P≤4, V≤4)

```
Your Aura Baseline has been recorded.

*Sharpness:* {{sharpness}}/10 — The grooming foundation is present but not yet intentional. Small upgrades here will be visible immediately.

*Presence:* {{presence}}/10 — The body is not yet occupying space with awareness. This is the dimension with the most room to grow.

*Vibe:* {{vibe}}/10 — Style, grooming, and expression are not yet in agreement. When they align, the shift will be noticeable to everyone around you.

Your three Grooming Quests arrive tomorrow morning.

— Your Aesthetic Consultant
```

---

#### `AC_LMM` — Low Sharpness, Mid Presence, Mid Vibe

```
Your Aura Baseline has been recorded.

*Sharpness:* {{sharpness}}/10 — Grooming is the clearest opportunity. The raw material is strong — definition and precision will unlock the next level.

*Presence:* {{presence}}/10 — There is awareness in the body. Shoulders need to open a fraction more, and the gaze could hold longer.

*Vibe:* {{vibe}}/10 — The elements are starting to cohere. One intentional grooming upgrade would bring everything into alignment.

Your three Grooming Quests arrive tomorrow morning.

— Your Aesthetic Consultant
```

---

#### `AC_MLM` — Mid Sharpness, Low Presence, Mid Vibe

```
Your Aura Baseline has been recorded.

*Sharpness:* {{sharpness}}/10 — Grooming shows intention. The hairline is considered, skin condition is managed. Room to sharpen.

*Presence:* {{presence}}/10 — The body is not yet speaking. Posture, stillness, and directness of gaze are the primary levers here.

*Vibe:* {{vibe}}/10 — Style and grooming are developing but presence is pulling the overall impression down. Once the body catches up, the vibe will consolidate.

Your three Grooming Quests arrive tomorrow morning.

— Your Aesthetic Consultant
```

---

#### `AC_MML` — Mid Sharpness, Mid Presence, Low Vibe

```
Your Aura Baseline has been recorded.

*Sharpness:* {{sharpness}}/10 — Grooming fundamentals are solid. The next step is precision — details that signal intentionality.

*Presence:* {{presence}}/10 — The body is aware. Hold that stillness a beat longer and the room will read it differently.

*Vibe:* {{vibe}}/10 — This is where the work begins. The pieces exist individually but they are not yet telling the same story. Coherence is the target.

Your three Grooming Quests arrive tomorrow morning.

— Your Aesthetic Consultant
```

---

#### `AC_MMM` — All Mid (S 5-7, P 5-7, V 5-7)

```
Your Aura Baseline has been recorded.

*Sharpness:* {{sharpness}}/10 — There is intention in the grooming. The question now is: can it become precise.

*Presence:* {{presence}}/10 — Awareness is present. The body understands it is being read but is not yet fully committed to the frame.

*Vibe:* {{vibe}}/10 — The elements are approaching agreement. Two or three deliberate adjustments and this becomes a cohesive impression.

You are closer than most people at baseline. The protocol is designed for exactly this stage.

Your three Grooming Quests arrive tomorrow morning.

— Your Aesthetic Consultant
```

---

#### `AC_HMM` — High Sharpness, Mid Presence, Mid Vibe

```
Your Aura Baseline has been recorded.

*Sharpness:* {{sharpness}}/10 — This is a genuine strength. Grooming is intentional, defined, and communicates care. Protect this.

*Presence:* {{presence}}/10 — The body has not yet caught up with the face. Posture and gaze are the next frontier.

*Vibe:* {{vibe}}/10 — Sharpness is carrying the overall impression. Once presence rises, the vibe will consolidate naturally.

Your three Grooming Quests arrive tomorrow morning.

— Your Aesthetic Consultant
```

---

#### `AC_MHM` — Mid Sharpness, High Presence, Mid Vibe

```
Your Aura Baseline has been recorded.

*Sharpness:* {{sharpness}}/10 — Grooming is functional but not yet sharp. This is the single fastest lever to pull — one deliberate change here will shift everything.

*Presence:* {{presence}}/10 — This is your dominant strength. The body occupies the frame with intention. People already notice when you enter a room.

*Vibe:* {{vibe}}/10 — Presence is strong but the grooming and style are not yet at the same level. Alignment between all three is the objective.

Your three Grooming Quests arrive tomorrow morning.

— Your Aesthetic Consultant
```

---

#### `AC_MMH` — Mid Sharpness, Mid Presence, High Vibe

```
Your Aura Baseline has been recorded.

*Sharpness:* {{sharpness}}/10 — Grooming has room to sharpen. The style instinct is already there — now bring the details into focus.

*Presence:* {{presence}}/10 — Posture and gaze can rise. The body is not yet matching the story your style is telling.

*Vibe:* {{vibe}}/10 — This is your dominant strength. There is a clear aesthetic identity here. The protocol will now bring sharpness and presence into alignment with it.

Your three Grooming Quests arrive tomorrow morning.

— Your Aesthetic Consultant
```

---

#### `AC_HHH` — All High (S≥8, P≥8, V≥8)

```
Your Aura Baseline has been recorded.

*Sharpness:* {{sharpness}}/10 — Grooming is precise, intentional, and communicates mastery. This is rare at baseline.

*Presence:* {{presence}}/10 — The body is fully committed. Posture, gaze, and stillness are all working in concert.

*Vibe:* {{vibe}}/10 — Sharpness, presence, and style are in agreement. The impression is cohesive and unmistakable.

You are entering the protocol at a high baseline. The quests will shift from building foundations to refining edges — the 1% improvements that separate good from undeniable.

Your three Grooming Quests arrive tomorrow morning.

— Your Aesthetic Consultant
```

---

### 5.3 — How to Use Saved Replies

When you are in a user's conversation in the Wati inbox:

1. Click the **"/" icon** or type **/** in the message field
2. Search by typing the code (e.g., `AC_MMM`)
3. Select the saved reply
4. **Replace the `{{sharpness}}`, `{{presence}}`, `{{vibe}}` placeholders** with the actual scores before sending
5. Click **Send**

> Wati does not auto-fill saved reply placeholders the way templates do. You must manually replace `{{sharpness}}` with the number. This takes 10 seconds.

---

## PART 6 — Founder's Daily Workflow

### 6.1 — Morning Routine (8:00–8:10 AM, 10 minutes)

This is your most important 10 minutes of the day. Do this before anything else.

**Step 1 — Open Wati Inbox (2 min)**
1. Log in to [app.wati.io](https://app.wati.io)
2. Navigate to **Team Inbox**
3. Sort by **Unread** or **Most Recent**
4. Scan for overnight messages — users in different time zones may have sent responses late

**Step 2 — Process Voice Notes (3 min)**
1. Filter conversations by tag: `orator-trial`
2. For each user who sent a voice note:
   - The webhook server (`server.js`) will have already processed it if running
   - If the server analysed it: review the generated scores in your admin dashboard
   - If the server is down or did not process: note the user's phone number, download the voice note, and manually trigger analysis later
3. For each analysed voice note, the server sends the Consultant response automatically
4. If you need to send a manual response: open the conversation → use the score data → type a 2-sentence Consultant insight

**Step 3 — Process Photos (2 min)**
1. Filter conversations by tag: `aesthetic-trial`
2. For each user who sent a selfie:
   - Check if `auraScore.js` processed it (check admin dashboard)
   - If processed: review scores, verify the Consultant message was sent
   - If not processed: open the photo, assess visually, use a saved reply (`AC_XXX`)

**Step 4 — Reply to Questions (2 min)**
1. Check for any free-text messages that were not routed (they appear as `unhandled` in the server logs)
2. Reply in brand voice. Rules:
   - No exclamation marks
   - No "great question" or "thanks for asking"
   - Answer directly, with warmth but not enthusiasm
   - Sign off: `— Your Consultant`

**Step 5 — Update Tracker (1 min)**
1. Open your Google Sheet (or Notion table)
2. For each user: update streak count, mark if they completed yesterday's quest
3. Flag anyone who has not responded in 48+ hours → add `at-risk` tag in Wati

---

### 6.2 — Evening Routine (7:30–7:40 PM, 10 minutes)

**Step 1 — Check Quest Completions (3 min)**
1. Open Wati Inbox
2. Look for messages containing "done", "complete", or quest-related responses
3. The server handles most of these automatically — verify the responses were sent
4. Update your tracking sheet: mark quest completed, update streak

**Step 2 — Review Chronicle Replies / Sage Pillar (2 min)**
1. Filter by tag: `sage-trial`
2. For users who replied to Chronicle prompts (vocabulary words, reading reflections):
   - Send a 1-sentence acknowledgment in Consultant voice
   - Example: "Noted. That interpretation shows the word is landing in context, not just memory."
3. For users who replied "MASTERED" — the server handles this, but verify the mastery was logged

**Step 3 — Check Day 7 Users (3 min)**
1. Filter by custom attribute: `trial_day` = 7
2. For each Day 7 user:
   - Verify their evolution report data is ready (check admin dashboard)
   - If the paywall broadcast was sent at 7:00 PM, monitor for replies
   - Prepare to send manual follow-up if needed (see 6.3)

**Step 4 — Clear Unread Messages (2 min)**
1. Check for any remaining unread conversations
2. Reply or queue for morning
3. Mark conversations as "resolved" once handled

---

### 6.3 — Day 7 Routine (Special — 20 minutes)

This is the most important day for each user. Revenue depends on this being executed well.

**Preparation (do this at 6:00 PM, before the 7:00 PM paywall broadcast):**

1. **Pull each Day 7 user's score progression:**
   - Open admin dashboard or check `users.json`
   - Note their Day 1 scores and Day 7 scores for all 6 parameters
   - Calculate the gains

2. **Prepare the paywall URL for each user:**
   ```
   https://maincharacter.digitglobalservices.com/paywall.html
     ?name=Aarav%20Mehta
     &phone=919876543210
     &pillar=orator
     &fluency_start=67&fluency_end=81
     &pronunciation_start=78&pronunciation_end=87
     &pacing_start=58&pacing_end=76
     &vocabulary_start=88&vocabulary_end=91
     &confidence_start=60&confidence_end=79
     &fillers_start=51&fillers_end=74
   ```

3. **Have the following ready to send manually (in order) after the broadcast:**

**Message sequence (send these as session replies, 1 minute apart):**

**Message A — The Day 1 Recording (8:00 PM):**
```
Before we talk about what comes next — listen to this.

This is your Day 1 baseline. Sixty seconds, recorded seven days ago.

[Attach their Day 1 voice note file]
```

**Message B — The Day 7 Analysis (8:02 PM):**
```
Now listen to this morning's recording.

[Attach their Day 7 voice note file]

The difference is not subtle.
```

**Message C — The Stats (8:04 PM):**
```
Your Week 1 Evolution Report:

Fluency: 67 → 81 (+14)
Pronunciation: 78 → 87 (+9)
Pacing: 58 → 76 (+18) ← biggest shift
Vocabulary: 88 → 91 (+3)
Confidence: 60 → 79 (+19)
Fillers: 51 → 74 (+23)

Full interactive report:
[Insert paywall URL]

— Your Orator Consultant
```

**Message D — The Close (if no reply after 60 minutes):**
```
Day 8 is written. Your quest is ready for tomorrow morning.

Reply *PAY* when you are ready.

— Your Consultant
```

4. **Do NOT send more than 4 messages.** If they do not reply after Message D, let it rest. Check again at 10:00 PM. If still no reply, that is their answer. Move on.

5. **If they reply PAY:** The server handles this — it sends the upgrade link automatically.

6. **If they reply with a question:** Answer it directly. No selling. No persuading. Just answer the question and end with: `Reply PAY when ready.`

---

## PART 7 — Analytics to Watch

### 7.1 — Daily Metrics

Navigate to **Analytics → Message Analytics** in Wati.

| Metric | Target | Where to Find |
|---|---|---|
| **Delivery Rate** | 95%+ | Analytics → Delivery Reports |
| **Read Rate** | 60%+ | Analytics → Read Reports |
| **Reply Rate** | 30%+ | Analytics → Response Reports |
| **Average Response Time** | < 2 hours | Team Inbox → Performance |

Check these numbers every morning during your 10-minute routine.

### 7.2 — Weekly Metrics (check every Sunday)

| Metric | How to Calculate | Target |
|---|---|---|
| **Day 7 Conversion Rate** | (Users who replied PAY) / (Total users who reached Day 7) | 20%+ is good, 35%+ is excellent |
| **Trial Completion Rate** | (Users who completed all 7 days) / (Total users started) | 60%+ |
| **Average Streak** | Sum of all streaks / number of users | 5+ out of 7 |
| **At-Risk Rate** | Users tagged `at-risk` / total active users | Below 20% |

### 7.3 — Red Flags

| Signal | What It Means | Action |
|---|---|---|
| Delivery rate drops below 90% | Your number may be getting flagged or users are blocking you | Check if your message frequency is too high. Reduce to 2 messages/day. Review message content. |
| Read rate drops below 40% | Users are receiving but not opening | Your message preview text is not compelling. Rework the first line of each template. |
| Reply rate drops below 15% | Content is not resonating | Review quest design. Are you asking too much? Is the voice too formal? |
| Multiple users unsubscribe same day | Something in that day's message triggered it | Pull that day's broadcast content immediately. Review tone. |
| Day 7 conversion below 10% | The paywall experience is not working | Review the stats delivery, paywall page, and payment flow. Consider extending trial to 10 days. |

---

## PART 8 — What to Do When Things Go Wrong

### 8.1 — Template Rejected

**Do not panic.** You can operate entirely on session messages.

**Session message strategy:**
- All Consultant messages (quest prompts, analysis responses, evening readings) can be sent as session replies — as long as the user has messaged you within the past 24 hours
- To keep the 24-hour window open: design each message to require a reply (this is already built into the MainCharacter protocol — every message ends with a reply prompt like "Reply READY" or "Reply READ")
- The only time you need a broadcast template is for the very first message to a new user (Day 1 welcome). If `mc_welcome` is rejected:
  - Have the user message you first (add "Send us 'HI' on WhatsApp to begin" on your landing page)
  - Once they message, you are in a session window and can send the welcome message without a template

### 8.2 — User Unsubscribes

A user may reply "STOP" or block your number.

1. **If they reply STOP:**
   - Acknowledge: send one final message — `"Understood. Your data has been noted. If you ever want to return, this line remains open. — MainCharacter"`
   - In Wati: remove them from the broadcast list immediately
   - In your tracking sheet: mark as `churned`, add date
   - **Do not re-add them. Do not re-message them. Ever.**

2. **If they block you:**
   - You will see `failed` delivery status in Wati
   - Remove from list, mark as churned
   - No action needed — they have made their decision

### 8.3 — Wati Goes Down

Wati has occasional outages (usually brief, < 1 hour).

**Immediate backup plan:**
1. Maintain a personal WhatsApp group called `MC Emergency` with all active trial users
2. If Wati is down during a critical window (Day 7 paywall, morning quest):
   - Send the message from your personal WhatsApp to each user individually
   - Use the exact same message text — maintain brand voice
   - Note which users you messaged manually so you do not double-send when Wati comes back

**How to check if Wati is down:**
- Try sending a test message from the Wati inbox
- Check [status.wati.io](https://status.wati.io) for service status
- Check your webhook server logs — if no incoming messages for 2+ hours during business hours, Wati may be experiencing issues

### 8.4 — Webhook Server Goes Down

If your `server.js` on Render goes down:

1. **Check:** Visit `https://your-render-url.onrender.com/health` — if it does not respond, the server is down
2. **Restart:** Go to [dashboard.render.com](https://dashboard.render.com) → select your service → click **Manual Deploy** → **Deploy latest commit**
3. **While it is down:** All messages still arrive in the Wati inbox — you just will not have automated responses. Handle everything manually using saved replies and your tracking sheet.
4. **Render free tier caveat:** Free tier services spin down after 15 minutes of inactivity. The first incoming webhook after a spin-down takes 30–60 seconds to process (cold start). If this is a problem, upgrade to Render's $7/month plan for always-on.

### 8.5 — User Disputes or Refund Requests

**Policy:** 7-day money-back guarantee. No questions asked.

**If a user asks for a refund:**

1. Reply immediately:
   ```
   Your refund has been initiated. You will see it reflected within 5-7 business days.

   Your protocol access continues until the end of your current billing period.

   — MainCharacter
   ```
2. Process the refund in Razorpay Dashboard:
   - Navigate to [dashboard.razorpay.com](https://dashboard.razorpay.com)
   - **Payments** → find their payment → click **Refund** → **Full Refund**
3. Update their status in Wati: change `paid_status` to `trial`, remove `paid-pro` tag, add `churned` tag
4. The webhook server will handle the Razorpay `refund.created` event automatically and revert their tier

**If a user threatens legal action or escalation:**
- Remain calm. Process the refund immediately.
- Reply: `"Your refund has been processed. We wish you well. — MainCharacter"`
- Do not engage further. Do not argue. Do not explain.

### 8.6 — You Run Out of Session Windows

If a user has not messaged in 24+ hours, you cannot send session messages. You can only reach them via broadcast templates.

**Solutions:**
1. Use your approved broadcast template (`mc_morning_quest` or `mc_evening_reading`) to re-engage
2. If no templates are approved: you cannot message them. Wait for them to message you.
3. **Prevention:** The MainCharacter protocol is designed so every message ends with a reply prompt. If the user replies, the 24-hour window resets. This is why the reply prompts ("Reply READY", "Reply READ") exist — they are not optional design choices, they are session window maintenance.

---

## Quick Reference Card

Print this or keep it on your desktop.

```
┌─────────────────────────────────────────────┐
│  MAINCHARACTER — Daily Quick Reference      │
├─────────────────────────────────────────────┤
│                                             │
│  MORNING (8:00 AM, 10 min)                  │
│  □ Open Wati inbox, sort by Unread          │
│  □ Process voice notes (Orator)             │
│  □ Process photos (Aesthetic)               │
│  □ Reply to questions                       │
│  □ Update streak tracker                    │
│                                             │
│  EVENING (7:30 PM, 10 min)                  │
│  □ Check quest completions                  │
│  □ Review Chronicle replies (Sage)          │
│  □ Check Day 7 users → prep reports         │
│  □ Clear unread messages                    │
│                                             │
│  WEEKLY (Sunday, 15 min)                    │
│  □ Check conversion rate                    │
│  □ Check delivery/read/reply rates          │
│  □ Review at-risk users                     │
│  □ Prep next week's broadcast variables     │
│                                             │
│  BRAND VOICE RULES                          │
│  ✗ No exclamation marks                     │
│  ✗ No "great job", "amazing", "awesome"     │
│  ✗ No begging or chasing                    │
│  ✓ Warm, certain, mentor tone               │
│  ✓ Sign off: — Your Consultant              │
│  ✓ Under 200 words per message              │
│                                             │
│  EMERGENCY CONTACTS                         │
│  Wati status: status.wati.io                │
│  Render dashboard: dashboard.render.com     │
│  Razorpay dashboard: dashboard.razorpay.com │
│                                             │
└─────────────────────────────────────────────┘
```

---

*This manual was written for MainCharacter Week 1 operations with up to 50 users. As you scale beyond 50, you will need to automate the manual steps described in Part 6 using Wati's Flow Builder and your webhook server. That is a separate document.*

— MainCharacter Operations
