# Lina CRM — Claude Guide

## Project Overview
Lina is a LINE-based CRM and marketing automation tool built with Next.js + Supabase. It manages contacts from GoHighLevel (GHL), sends LINE messages, and runs webinar sequences.

- **Deployed at:** https://lina-crm-sb-v1.vercel.app
- **GitHub:** https://github.com/rowanlee-hub/lina-crm-sb-v1
- **Stack:** Next.js 16 App Router, Supabase, LINE Messaging API, TypeScript

---

## Key Architecture

### Database (Supabase)
- `contacts` — main contact records
- `contact_history` — activity log per contact
- `automations` — simple IFTTT rules
- `webinar_sequences` — active webinar sequence config
- `webinar_sequence_steps` — steps with `days_before`, `send_hour`, `message`
- `webinar_enrollments` — per-contact enrollment with `webinar_date`
- `webinar_scheduled_messages` — queued sequence messages per contact
- `message_queue` — general scheduled messages
- `reminders` — legacy scheduled messages
- `settings` — key-value config (e.g. `active_webinar_date`)
- `tag_definitions` — registered tag names
- `templates` — message templates

### Key contacts table columns
`id, name, email, phone, line_id, tags (text[]), status, webinar_link, webinar_date, notes, ghl_contact_id, uid, attended, purchased, follow_up_note, signup_day, updated_at`

**Note:** `follow_up_at` does NOT exist in the schema — do not include it in API payloads.

---

## Webinar System

### How webinar dates work
- Webinars always start on **Wednesday** (2-day: Wednesday + Thursday)
- `active_webinar_date` in `settings` table holds the current upcoming Wednesday
- Cron at `/api/cron/rotate-webinar-date` runs every **Wednesday at 13:00 UTC (9pm Malaysia)** via cron-job.org — advances date by 7 days
- GHL webhook uses `webinar-MMDD` tag (e.g. `webinar-0325`) to determine which webinar a contact belongs to — picks the **latest** matching tag
- Falls back to `active_webinar_date` if no matching tag found

### Webinar sequence timing
- Steps have `days_before` (days before webinar date) and `send_hour`
- Past steps are auto-skipped on enrollment
- Cron at `/api/cron/reminders` runs every 15 minutes — processes pending messages

---

## Variable Rendering
Two functions in `src/lib/render-message.ts`:
- `renderMessage(message, contact)` — async, fetches custom values from DB
- `renderMessageSync(message, contact)` — sync, requires pre-loaded contact object

Supported variables: `{{name}}`, `{{email}}`, `{{phone}}`, `{{status}}`, `{{notes}}`, `{{uid}}`, `{{tags}}`, `{{webinar_link}}`, `{{webinar_date}}`, `{{follow_up_note}}`

**All send paths must render variables before sending.**

---

## API Routes
| Route | Purpose |
|---|---|
| `POST /api/contacts` | Save/update contact |
| `POST /api/ghl/webhook` | Receive GHL contact sync |
| `POST /api/line/webhook` | Receive LINE messages/follows |
| `POST /api/line/send` | Send LINE message manually |
| `POST /api/broadcast` | Broadcast to tag-filtered contacts |
| `GET /api/cron/reminders` | Process all queued messages (every 15min) |
| `GET /api/cron/rotate-webinar-date` | Advance active webinar date (Wednesday 9pm) |
| `GET /api/settings?key=` | Read a settings value |
| `GET/POST/PATCH/DELETE /api/webinar-sequence` | Manage sequence steps |
| `GET /api/webinar-sequence/enrollments` | List enrollments |
| `GET /api/webinar-sequence/messages` | List scheduled messages per contact |

---

## GHL Integration
- GHL webhook sends contact data to `/api/ghl/webhook`
- Deduplication order: `ghl_contact_id` → `email` → `phone`
- Tags are **merged** (never overwritten) with existing contact tags
- `webinar-MMDD` tag determines webinar date (latest tag wins for returning leads)
- Separate GHL workflow needed for "Tag Added" trigger → webhook to Lina

---

## LINE Integration
- Follow event → auto-creates contact in Supabase
- Upsert with `onConflict: 'line_id'` to prevent race condition duplicates
- All messages rendered with `renderMessage` before sending

---

## Automation Engine (`src/lib/automation-engine.ts`)
Action types: `SEND_MESSAGE`, `ADD_TAG`, `REMOVE_TAG`, `ENROLL_WEBINAR`
- `ENROLL_WEBINAR` fetches contact's `webinar_date` and calls `enrollInWebinarSequence`
- Adding a tag recursively triggers nested automations

---

## Important Rules & Past Mistakes
- **Never include `follow_up_at` in contacts API payload** — column does not exist in DB
- **Webinar date input** uses dropdown (Upcoming/Previous Wednesday), not a free date picker
- **Date comparisons** — always use `.substring(0, 10)` to strip time before comparing dates
- **Deleting a webinar step** must first delete `webinar_scheduled_messages` with that `step_id` (FK constraint)
- **active_webinar_date** in settings is the source of truth — do not trust dates from GHL body
- **Malaysia timezone** = UTC+8. Cron schedules: 13:00 UTC = 9pm Malaysia
- Webinar dates are always **Wednesdays**. March 18 = Wednesday, March 25 = next Wednesday
- **tags column** is `text[]` (PostgreSQL array) — use `'tag' = ANY(tags)` not JSON operators
