# 🎟 Eventcraft

## Demo



https://github.com/user-attachments/assets/64d286a7-b15a-49a9-baad-c58abfd4c92a



[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Event registration and ticketing you buy once — with zero per-ticket fees.** Build an event page, sell ticket tiers with early-bird pricing, take registrations with your own custom questions, email QR-code tickets, scan attendees in at the door with any webcam or phone camera, and let the waitlist manage itself. Money is handled by *your* Stripe Payment Link — Eventcraft never touches the funds and never takes a cut.

Eventbrite charges **2.7% + $0.79 per ticket, on every ticket, forever**. Sell 500 tickets at $20 and that's roughly **$500+ in fees for one event**. Eventcraft is **$39 once** — after your first event it's already the cheapest ticketing stack you'll ever run.

![Eventcraft screenshot](docs/screenshot.png)

## ☕ Skip the setup — get the 1-click installer

Don't want to touch a terminal? Grab the packaged Windows installer (and support development):

**→ [Get Eventcraft on Whop](https://whop.com/benjisaiempire/eventcraft-app)** — pay once, own it forever.

## Features

- 📄 **Event pages** — title, rich description, date/time, venue or virtual link, cover image, shareable clean URL
- 🎫 **Ticket tiers** — free or paid, quantity limits, early-bird pricing windows; all money handled as **integer cents** internally (no floating-point pricing bugs)
- 💳 **BYO Stripe Payment Link** — paste your own Payment Link per tier; attendees pay Stripe's standard rate and *only* Stripe's rate. Eventcraft makes zero API calls to any payment provider
- ❓ **Custom registration questions** — per event, optional or required
- 📱 **QR-code tickets** — generated server-side, emailed on confirmation (optional SMTP), always viewable at a private ticket URL
- 📷 **Door check-in mode** — webcam scanner in the browser (jsQR), duplicate-scan detection, live checked-in counter, manual code fallback
- ⏳ **Capacity & waitlist** — sold-out tiers automatically waitlist; cancelling a confirmed seat auto-promotes the earliest waitlister (and emails them their ticket)
- 📅 **"Add to calendar"** — spec-correct RFC 5545 `.ics` files with proper escaping and line folding
- 📤 **CSV attendee export** — names, emails, tiers, payment, check-in times, custom answers
- 🌑 Premium dark UI — React + Tailwind + Framer Motion, session auth, zero telemetry, all data in one SQLite file

## Quick start

```bash
npm i
npm run build   # build the React frontend
npm start       # → http://localhost:5368
```

Default admin password is `admin` — copy `.env.example` to `.env` and change `ADMIN_PASSWORD`.

**Run it as a desktop app, or deploy to a $5 VPS when you need it public:**

- `npm run desktop` — Electron window, same app, data in your user profile, auto-logged-in as admin
- `docker compose up -d` — production deployment with a persistent SQLite volume

## Tech stack

Node 20+ · Express · better-sqlite3 · React 18 · Vite · Tailwind CSS 4 · Framer Motion · qrcode · jsQR · Electron (desktop mode)

## Eventcraft vs Eventbrite

| | **Eventcraft** | Eventbrite |
|---|---|---|
| Price | **$39 once** | 2.7% + $0.79 **per ticket** |
| 500 × $20 tickets | $39 total, ever | ≈ **$665 in fees** (that one event) |
| Payment processing | Your Stripe link (2.9% + 30¢, goes to Stripe) | Their checkout + their platform cut |
| Attendee data | Your SQLite file | Their platform |
| QR check-in | ✅ webcam, offline-capable | ✅ (their app) |
| Waitlist auto-promotion | ✅ | Plan-gated |
| Custom questions | ✅ unlimited | ✅ |
| Source code | MIT, yours | Proprietary |

## License

MIT © 2026 Ben (bensblueprints)

## macOS build

See [MAC-BUILD.md](MAC-BUILD.md). Quickest path: GitHub **Actions** tab -> run the **Mac Build** (`mac-build.yml`) workflow to get a downloadable `.dmg` (unsigned - right-click -> Open on first launch).
