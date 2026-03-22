# Lina — Goals & Roadmap

> This is a living document. Edit anytime to add ideas, refine priorities, or update status.
> Tell Claude "check the goals" at the start of any session.

---

## Core Goals (must work perfectly)

These are the 5 things that replace Make.com + Google Sheets entirely:

- [ ] **Follow → Capture + Assign Date** — When someone follows LINE, save their line_id and auto-assign upcoming Wednesday as webinar_date (after Wed 9pm Malaysia → next Wednesday)
- [ ] **GHL Webhook → Save Contact** — When lead signs up on landing page, GHL sends contact to Lina. Deduplicate, merge tags, assign webinar date from `webinar-MMDD` tag
- [ ] **Email Match → Link Contacts** — When LINE user sends their email, match against existing GHL contacts, link their line_id, merge into one record
- [ ] **Auto-Push Webinar Link** — Once contact is matched (has line_id + webinar_link), immediately send their unique webinar link via LINE
- [ ] **Daily Reminders (Fri→Thu)** — Send reminders to everyone with the upcoming Wednesday webinar. Each day has its own message. Cron handles the sending

### Manual Fallback
- [ ] **Sheet View for Manual Matching** — When email doesn't match (typo, wrong email), need UI to manually search contacts and link line_id to the right GHL record

---

## Webinar Reminder Schedule

All reminders at **8:00pm MYT (12:00 UTC)**

| Day | Days Before Wed | Message |
|-----|-----------------|---------|
| Friday | 5 | Hi, today is [Countdown 5 days] |
| Saturday | 4 | Hi, today is [Countdown 4 days] |
| Sunday | 3 | Hi, today is [Countdown 3 days] |
| Monday | 2 | Hi, today is [Countdown 2 days] |
| Tuesday | 1 | Hi, today is [Countdown 1 day] |
| Wednesday | 0 | Hi, today is [Webinar day!] |
| Thursday | -1 | Hi, today is [Countdown day after] |

### Two message variants per reminder:
- **Message A** (has webinar_link): Standard reminder
- **Message B** (no webinar_link): Same reminder + extra line asking them to send their email so we can link their account

## Auto-Push Messages (sent when webinar link becomes available)

**Message 1 — Confirmation + Link:**
> 恭喜 {{name}}～ 已確認你註冊成功！
> 這是你的這兩天的直播連結：
> {{webinar_link}}

**Message 2 — Workbook (sent right after Message 1):**
> 👆👆點擊連結領取你的 Workbook：https://onegoodurl.com/ai-workbook
> 這是團隊為你精心製作的workbook~ 包含了 Day 1 & 2 所分享到 "普通小白如何賺美金" 的秘密，空的部分就交給你上課時自行填充
> 1. 你可以選擇印出來 OR
> 2. 直接在pdf上做筆記~
> 期待 晚上8:00pm 見到你 💪🔥

---

## Open Questions

- [x] ~~Exact reminder times and messages for each day~~ → 8pm MYT, countdown format
- [x] ~~Does GHL send webhook twice?~~ → Yes, second webhook brings webinar_link
- [x] ~~Do contacts without webinar_link get different reminder messages?~~ → Yes, Message B adds email prompt
- [ ] What happens after webinar — any follow-up sequence?

---

## Future Ideas

> Add anything here as it comes to mind:

- [ ] Post-webinar follow-up sequence (attended vs didn't attend)
- [ ] Rich menu integration
- [ ] Broadcast to filtered segments
- [ ] Analytics / dashboard
- [ ] _add more as needed..._

---

## What's Been Built

- [x] Supabase contacts table (replaces Sheet A + B)
- [x] GHL webhook with dedup + tag merge
- [x] LINE follow webhook → create contact + assign Wednesday
- [x] Email detection in LINE chat → smart merge
- [x] Auto-push webinar link on merge
- [x] Webinar sequence system (days_before + send_hour)
- [x] Cron for sending queued messages (every 15min)
- [x] Webinar date rotation (Wednesday 9pm)
- [x] Workflow builder UI (Make.com-style) — may simplify later
- [x] Variable rendering in messages ({{name}}, {{webinar_link}}, etc.)
- [x] Contact list / sheet view in UI
