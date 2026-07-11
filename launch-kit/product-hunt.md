# Product Hunt launch — Eventcraft

**Name:** Eventcraft

**Tagline (60 chars):** Self-hosted event ticketing with zero per-ticket fees

**Description (260 chars):**
Eventcraft is self-hosted event registration: event pages, ticket tiers with early-bird pricing, QR tickets, webcam door check-in, automatic waitlists, CSV export. Payments via your own Stripe link — no platform cut, ever. $39 once vs Eventbrite's fee on every ticket.

**Full description:**
Eventbrite's 2.7% + $0.79 per ticket is a tax on every ticket you ever sell. Eventcraft is the same core workflow, self-hosted, for a flat $39:

- Event page builder with clean shareable URLs and cover images
- Ticket tiers: free/paid, quantity caps, early-bird price windows (money stored as integer cents — no float bugs)
- BYO Stripe Payment Link per tier: attendees pay Stripe's standard rate and nothing else; Eventcraft never touches funds
- Custom registration questions per event
- Server-generated QR-code tickets, emailed via your SMTP (optional)
- Door check-in: webcam QR scanner in the browser with duplicate detection and a live counter
- Sold out? Automatic waitlist — cancellations auto-promote the earliest waitlister and email their ticket
- RFC-5545-correct .ics "add to calendar" files
- Attendee CSV export, Docker deploy, Electron desktop mode, MIT source

**Maker first comment:**
Hi PH 👋 I ran the numbers after organizing a 400-person meetup: Eventbrite's cut was more than the venue deposit. The kicker is the fee scales with *your* success while their software does the same thing at 50 tickets or 5,000. So I built Eventcraft: flat $39, self-hosted, your Stripe link so payment money never routes through anyone else, QR check-in from a laptop webcam at the door. The waitlist auto-promotion is my favorite part — cancellations used to mean manual spreadsheet triage at 11pm. Ask me anything!

**Gallery shots:**
1. Public event page with three ticket tiers, one showing early-bird strikethrough pricing
2. QR ticket page on a phone-width viewport
3. Door check-in scanner mid-scan with green "Checked in — Alice" toast and live counter
4. Admin dashboard: tiers editor + attendee table with confirmed/waitlist/cancelled chips
5. Fee comparison graphic: 500 × $20 tickets — Eventbrite ≈ $665 vs Eventcraft $39 flat
