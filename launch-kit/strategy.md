# Launch strategy — Eventcraft

## Target communities

- **r/selfhosted** — flagship audience. Lead with docker-compose + "one SQLite file" portability; they will ask about the check-in scanner working offline — it does (jsQR runs client-side).
- **r/Meetup / r/EventProduction** — fee-math angle: post the 500-ticket comparison table; disclose maker status, no link until asked (subreddit rules).
- **r/nonprofit** — charity events lose donation money to ticket fees; "fees are a tax on your fundraiser" angle.
- **Facebook groups for event organizers / wedding & community planners** — screenshots of the QR door check-in flow; least technical crowd, point at the Whop 1-click installer.
- **Indie Hackers** — "I replaced Eventbrite for my own meetups and turned it into a $39 product" build log.

## Show HN draft

**Title:** Show HN: Eventcraft – self-hosted event ticketing with no per-ticket fees

Eventbrite charges 2.7% + $0.79 per paid ticket. For a 500 × $20 event that's ~$665 — every event. Eventcraft is a self-hosted alternative: Node + SQLite + React, one process, one DB file.

Design decisions HN may find interesting: all money is integer cents end-to-end; payments are deliberately *not* integrated — each tier links out to your own Stripe Payment Link, so the software can't skim and there's no PCI surface; QR tickets are generated server-side (`qrcode`), check-in is jsQR + getUserMedia in the browser so the door station is any laptop; waitlist promotion is a SQLite transaction so two cancellations can't double-promote; .ics files are RFC 5545 correct (escaping, CRLF, 75-octet folding — surprisingly fiddly).

MIT licensed. I sell a packaged installer for non-terminal people; the source is complete here.

## SEO keywords

1. eventbrite alternative no fees
2. event registration software self hosted
3. ticketing platform one time purchase
4. event check in app qr code
5. sell tickets without platform fees
6. self hosted eventbrite
7. event waitlist software
8. qr code ticket generator
9. event registration with stripe payment link
10. open source event ticketing

## AppSumo / PitchGround pitch

Eventcraft turns the biggest recurring cost in events — per-ticket platform fees — into a $39 one-time purchase. Organizers get event pages, free/paid ticket tiers with early-bird windows, custom registration questions, QR-code tickets, a webcam door check-in scanner with duplicate detection, automatic waitlist promotion and CSV exports, all self-hosted with payments flowing through the organizer's own Stripe Payment Link (zero platform cut, zero PCI exposure). One Docker command to deploy, or run it as a Windows desktop app. Your buyers run events; every single one of them is currently paying rent on ticket fees.

## Pricing math

**$39 one-time.** One 74-ticket event at $20/ticket already costs more than $39 in Eventbrite fees (74 × ($0.54 + $0.79) ≈ $98). A monthly 100-person paid meetup saves **~$1,600/year**. Pays for itself in the first event.
