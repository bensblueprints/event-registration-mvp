// Eventcraft smoke test — boots the real server on an offset port with a temp
// DB and exercises: money-in-integer-cents (incl. early-bird windows),
// capacity + waitlist with EXACT number assertions, waitlist auto-promotion on
// cancel, QR ticket PNG validity, ICS calendar validity, webcam-code check-in
// (incl. duplicate detection) and attendee CSV export.
// No payment APIs are called anywhere (BYO Stripe Payment Link is a plain URL).
// Kills ONLY the spawned server child.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 5468; // offset from the app's 5368 for parallel-build safety
const ADMIN_PASSWORD = 'smoke-test-password';
const DB_PATH = path.join(__dirname, 'smoke.db');
const BASE = `http://127.0.0.1:${TEST_PORT}`;

for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

let serverProc = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, tries = 40, delay = 250) {
  for (let i = 0; i < tries; i++) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    await sleep(delay);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

let cookie = '';
async function api(pathname, options = {}) {
  const res = await fetch(BASE + pathname, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log('0. Unit: tierPriceCents — early-bird window math in integer cents');
  const { tierPriceCents } = require('../server/app.js');
  const tier = { price_cents: 2500, earlybird_price_cents: 1999, earlybird_until: 1_000_000 };
  assert.strictEqual(tierPriceCents(tier, 999_999), 1999, 'strictly before earlybird_until → early-bird price');
  assert.strictEqual(tierPriceCents(tier, 1_000_000), 2500, 'at earlybird_until → full price');
  assert.strictEqual(tierPriceCents({ price_cents: 2500 }, 0), 2500, 'no early-bird → full price');
  assert.strictEqual(tierPriceCents({ price_cents: 0 }, 0), 0, 'free tier → 0 cents');

  console.log('1. Booting Eventcraft on port', TEST_PORT, 'with temp DB');
  serverProc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(TEST_PORT), ADMIN_PASSWORD, DB_PATH },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', (d) => process.stdout.write(`   [server] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`   [server] ${d}`));
  await waitFor(async () => (await api('/api/health')).data.ok, 'server health');

  console.log('2. Auth gates');
  const unauth = await api('/api/events');
  assert.strictEqual(unauth.status, 401, 'admin event list must 401');
  const bad = await api('/api/login', { method: 'POST', body: { password: 'nope' } });
  assert.strictEqual(bad.status, 401, 'wrong password must 401');
  const good = await api('/api/login', { method: 'POST', body: { password: ADMIN_PASSWORD } });
  assert.strictEqual(good.status, 200, 'login must succeed');

  console.log('3. Create event with custom question + tiers (money in integer cents)');
  const starts = Date.now() + 7 * 86400000;
  const evRes = await api('/api/events', {
    method: 'POST',
    body: {
      title: 'Smoke Conf 2026; The Comma, Test',
      description: 'A conference about smoke testing.\nSecond line.',
      starts_at: starts, ends_at: starts + 3 * 3600000,
      location: 'Testville Hall, 1 Assert St',
      questions: [{ key: 'company', label: 'Company', required: true }]
    }
  });
  assert.strictEqual(evRes.status, 201, 'event create must 201');
  const ev = evRes.data;
  assert.ok(ev.slug && /^[a-z0-9-]+$/.test(ev.slug), 'event must get a URL-safe slug');

  // paid tier: $25.00 = 2500 cents, early-bird $19.99 = 1999 cents (active now), capacity 2
  const ebUntil = Date.now() + 86400000;
  const t1 = await api(`/api/events/${ev.id}/tiers`, {
    method: 'POST',
    body: {
      name: 'General', price_cents: 2500, earlybird_price_cents: 1999,
      earlybird_until: ebUntil, quantity: 2,
      payment_link: 'https://buy.stripe.com/test_FAKE_LINK'
    }
  });
  assert.strictEqual(t1.status, 201, 'tier create must 201');
  assert.strictEqual(t1.data.price_cents, 2500, 'tier price must be exactly 2500 cents');
  assert.strictEqual(t1.data.current_price_cents, 1999, 'early-bird active → current price exactly 1999 cents');
  assert.strictEqual(t1.data.earlybird_active, true);
  const free = await api(`/api/events/${ev.id}/tiers`, { method: 'POST', body: { name: 'Free stream', price_cents: 0, quantity: 0 } });
  assert.strictEqual(free.data.remaining, null, 'quantity 0 = unlimited (remaining null)');

  console.log('4. Public page shows tiers without admin fields');
  const savedCookie = cookie;
  cookie = '';
  const pub = await api(`/api/public/events/${ev.slug}`);
  assert.strictEqual(pub.status, 200, 'public event page must 200');
  assert.strictEqual(pub.data.tiers.length, 2);
  assert.ok(!('payment_link' in pub.data.tiers[0]), 'public payload must not leak payment_link');
  assert.ok(!('sold' in pub.data.tiers[0]), 'public payload must not leak raw sold counter');

  console.log('5. Capacity: 2 seats → 3 registrations = exactly 2 confirmed + 1 waitlisted');
  const reg = (name, email, extra = {}) => api(`/api/public/events/${ev.slug}/register`, {
    method: 'POST',
    body: { tier_id: t1.data.id, name, email, custom_answers: { company: 'ACME' }, ...extra }
  });
  const r1 = await reg('Alice', 'alice@example.com');
  assert.strictEqual(r1.status, 201);
  assert.strictEqual(r1.data.status, 'confirmed', 'seat 1 must be confirmed');
  assert.strictEqual(r1.data.price_cents, 1999, 'early-bird window → charged exactly 1999 cents');
  assert.ok(r1.data.ticket_token, 'confirmed registration must get a ticket token');
  assert.strictEqual(r1.data.payment_url, 'https://buy.stripe.com/test_FAKE_LINK',
    'paid ticket must link out to the BYO payment link — no API call');

  const missingAnswer = await api(`/api/public/events/${ev.slug}/register`, {
    method: 'POST', body: { tier_id: t1.data.id, name: 'No Co', email: 'noco@example.com' }
  });
  assert.strictEqual(missingAnswer.status, 400, 'missing required custom question must 400');

  const r2 = await reg('Bob', 'bob@example.com');
  assert.strictEqual(r2.data.status, 'confirmed', 'seat 2 must be confirmed');
  const r3 = await reg('Carol', 'carol@example.com');
  assert.strictEqual(r3.data.status, 'waitlist', '3rd registration on a 2-seat tier must be waitlisted');
  assert.strictEqual(r3.data.waitlist_position, 1, 'Carol must be waitlist position exactly 1');
  assert.strictEqual(r3.data.ticket_token, null, 'waitlisted registration must NOT get a ticket');
  assert.strictEqual(r3.data.price_cents, 0, 'waitlisted registration must not be charged');

  const dupe = await reg('Alice again', 'alice@example.com');
  assert.strictEqual(dupe.status, 409, 'duplicate email for same event must 409');

  const pubAfter = await api(`/api/public/events/${ev.slug}`);
  const genTier = pubAfter.data.tiers.find((t) => t.name === 'General');
  assert.strictEqual(genTier.sold_out, true, 'tier must report sold out');
  assert.strictEqual(genTier.remaining, 0, 'remaining must be exactly 0');

  cookie = savedCookie;
  const evs = await api('/api/events');
  const evFull = evs.data.find((e) => e.id === ev.id);
  assert.strictEqual(evFull.stats.confirmed, 2, 'admin stats: exactly 2 confirmed');
  assert.strictEqual(evFull.stats.waitlist, 1, 'admin stats: exactly 1 waitlisted');
  assert.strictEqual(evFull.stats.revenue_cents, 3998, 'admin stats: revenue exactly 2 × 1999 cents = 3998');

  console.log('6. QR ticket PNG is a real PNG');
  const qrRes = await fetch(`${BASE}/api/ticket/${r1.data.ticket_token}/qr.png`);
  assert.strictEqual(qrRes.status, 200, 'QR endpoint must 200');
  assert.ok(qrRes.headers.get('content-type').includes('image/png'), 'QR must be image/png');
  const qrBuf = Buffer.from(await qrRes.arrayBuffer());
  assert.ok(qrBuf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'QR file must start with the PNG signature');
  const qrW = qrBuf.readUInt32BE(16), qrH = qrBuf.readUInt32BE(20);
  assert.strictEqual(qrW, 480, `QR width must be 480 (got ${qrW})`);
  assert.strictEqual(qrH, 480, `QR height must be 480 (got ${qrH})`);
  const ticketInfo = await api(`/api/ticket/${r1.data.ticket_token}`);
  assert.strictEqual(ticketInfo.data.name, 'Alice');
  assert.strictEqual(ticketInfo.data.event.title, 'Smoke Conf 2026; The Comma, Test');

  console.log('7. ICS calendar file is valid RFC 5545');
  const icsRes = await fetch(`${BASE}/api/public/events/${ev.slug}/ics`);
  assert.strictEqual(icsRes.status, 200, 'ICS must 200');
  assert.ok(icsRes.headers.get('content-type').includes('text/calendar'), 'ICS content-type must be text/calendar');
  const ics = await icsRes.text();
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'), 'ICS must start with BEGIN:VCALENDAR + CRLF');
  assert.ok(ics.includes('\r\nEND:VCALENDAR'), 'ICS must end the calendar');
  assert.ok(ics.includes('BEGIN:VEVENT') && ics.includes('END:VEVENT'), 'ICS must contain a VEVENT');
  assert.ok(/\r\nDTSTART:\d{8}T\d{6}Z\r\n/.test(ics), 'DTSTART must be UTC basic format');
  assert.ok(/\r\nDTEND:\d{8}T\d{6}Z\r\n/.test(ics), 'DTEND must be present');
  assert.ok(ics.includes('SUMMARY:Smoke Conf 2026\\; The Comma\\, Test'), 'SUMMARY must escape ; and ,');
  assert.ok(ics.includes('\\nSecond line.'), 'DESCRIPTION must escape newlines');
  assert.ok(ics.includes('LOCATION:Testville Hall\\, 1 Assert St'), 'LOCATION must escape commas');
  const dtstart = ics.match(/DTSTART:(\d{8}T\d{6}Z)/)[1];
  const expected = new Date(starts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  assert.strictEqual(dtstart, expected, 'DTSTART must equal the event start time exactly');
  for (const line of ics.split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `ICS lines must be folded to <= 75 octets (got ${Buffer.byteLength(line)}: ${line.slice(0, 40)}…)`);
  }

  console.log('8. Check-in: scan → checked in, re-scan → duplicate flagged');
  const scan1 = await api('/api/checkin', { method: 'POST', body: { code: `ec:${r1.data.ticket_token}` } });
  assert.strictEqual(scan1.status, 200, 'check-in must 200');
  assert.strictEqual(scan1.data.ok, true, 'first scan must check in');
  assert.strictEqual(scan1.data.name, 'Alice');
  assert.strictEqual(scan1.data.stats.checked_in, 1, 'exactly 1 checked in after first scan');
  const scan2 = await api('/api/checkin', { method: 'POST', body: { code: r1.data.ticket_token } });
  assert.strictEqual(scan2.data.ok, false, 'second scan must be rejected');
  assert.strictEqual(scan2.data.already_checked_in, true, 'second scan must flag duplicate');
  assert.strictEqual(scan2.data.stats.checked_in, 1, 'checked-in count must STAY exactly 1');
  const scanBad = await api('/api/checkin', { method: 'POST', body: { code: 'ec:not-a-ticket' } });
  assert.strictEqual(scanBad.status, 404, 'unknown ticket must 404');

  console.log('9. Cancel a confirmed seat → waitlisted Carol auto-promoted (exact counts)');
  const regs = await api(`/api/events/${ev.id}/registrations`);
  const bobReg = regs.data.find((r) => r.email === 'bob@example.com');
  const cancel = await api(`/api/registrations/${bobReg.id}/cancel`, { method: 'POST' });
  assert.strictEqual(cancel.status, 200, 'cancel must 200');
  assert.ok(cancel.data.promoted, 'cancel must promote someone from the waitlist');
  assert.strictEqual(cancel.data.promoted.email, 'carol@example.com', 'earliest waitlister (Carol) must be promoted');

  const regsAfter = (await api(`/api/events/${ev.id}/registrations`)).data;
  const counts = { confirmed: 0, waitlist: 0, cancelled: 0 };
  for (const r of regsAfter) counts[r.status]++;
  assert.strictEqual(counts.confirmed, 2, `exactly 2 confirmed after promotion (got ${counts.confirmed})`);
  assert.strictEqual(counts.waitlist, 0, `exactly 0 waitlisted after promotion (got ${counts.waitlist})`);
  assert.strictEqual(counts.cancelled, 1, `exactly 1 cancelled (got ${counts.cancelled})`);
  const carol = regsAfter.find((r) => r.email === 'carol@example.com');
  assert.ok(carol.ticket_token, 'promoted Carol must now have a ticket token');
  assert.strictEqual(carol.price_cents, 1999, 'Carol promoted inside early-bird window → exactly 1999 cents');

  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH, { readonly: true });
  const tierRow = db.prepare('SELECT sold, quantity FROM ticket_tiers WHERE id = ?').get(t1.data.id);
  assert.strictEqual(tierRow.sold, 2, `tier.sold in SQLite must be exactly 2 (got ${tierRow.sold})`);
  assert.strictEqual(tierRow.quantity, 2, 'tier.quantity must remain 2');

  console.log('10. Attendee CSV export');
  const csvRes = await fetch(`${BASE}/api/events/${ev.id}/export.csv`, { headers: { Cookie: cookie } });
  assert.strictEqual(csvRes.status, 200);
  const csv = await csvRes.text();
  const lines = csv.trim().split(/\r?\n/);
  assert.strictEqual(lines.length, 4, `CSV must have header + 3 rows (got ${lines.length})`);
  assert.ok(lines[0].startsWith('name,email,tier,status,price_usd,checked_in,registered_at,company'), 'CSV header incl. custom question');
  assert.ok(csv.includes('19.99'), 'CSV must show dollar price derived from integer cents');
  assert.ok(csv.includes('cancelled'), 'CSV must include the cancelled row');

  db.close();
  console.log('\n✅ All Eventcraft smoke tests passed');
}

async function cleanup(code) {
  if (serverProc && !serverProc.killed) serverProc.kill(); // only OUR child
  await sleep(300);
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* windows lock */ }
  }
  process.exit(code);
}

main()
  .then(() => cleanup(0))
  .catch(async (err) => {
    console.error('\n❌ Smoke test failed:', err.message);
    await cleanup(1);
  });
