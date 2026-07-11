const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const QRCode = require('qrcode');
const { openDb, genToken, slugify, getSettings, setSettings } = require('./db');
const { eventIcs } = require('./ics');
const { stringifyCsv } = require('./csv');
const { sendMail } = require('./mail');

const SESSION_COOKIE = 'ec_session';

/** Active price for a tier at time `now` — integer cents, always. */
function tierPriceCents(tier, now = Date.now()) {
  if (
    tier.earlybird_price_cents != null &&
    tier.earlybird_until != null &&
    now < tier.earlybird_until
  ) {
    return tier.earlybird_price_cents;
  }
  return tier.price_cents;
}

function createApp({ dbPath, adminPassword, autologinToken = null } = {}) {
  const db = openDb(dbPath);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.locals.db = db;

  const findEvent = db.prepare('SELECT * FROM events WHERE id = ?');
  const findEventBySlug = db.prepare('SELECT * FROM events WHERE slug = ?');
  const findTier = db.prepare('SELECT * FROM ticket_tiers WHERE id = ?');
  const findReg = db.prepare('SELECT * FROM registrations WHERE id = ?');

  function requireAuth(req, res, next) {
    const token = req.cookies[SESSION_COOKIE];
    if (token && db.prepare('SELECT id FROM sessions WHERE token = ?').get(token)) return next();
    res.status(401).json({ error: 'unauthorized' });
  }

  function createSession(res) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, created_at) VALUES (?, ?)').run(token, Date.now());
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax' });
  }

  function tiersForEvent(eventId, now = Date.now()) {
    return db.prepare('SELECT * FROM ticket_tiers WHERE event_id = ? ORDER BY sort, id').all(eventId)
      .map((t) => ({
        ...t,
        current_price_cents: tierPriceCents(t, now),
        earlybird_active: tierPriceCents(t, now) !== t.price_cents,
        remaining: t.quantity > 0 ? Math.max(0, t.quantity - t.sold) : null,
        sold_out: t.quantity > 0 && t.sold >= t.quantity
      }));
  }

  function eventStats(eventId) {
    const g = (status) => db.prepare('SELECT COUNT(*) n FROM registrations WHERE event_id = ? AND status = ?').get(eventId, status).n;
    return {
      confirmed: g('confirmed'),
      waitlist: g('waitlist'),
      cancelled: g('cancelled'),
      checked_in: db.prepare("SELECT COUNT(*) n FROM registrations WHERE event_id = ? AND status = 'confirmed' AND checked_in_at IS NOT NULL").get(eventId).n,
      revenue_cents: db.prepare("SELECT COALESCE(SUM(price_cents),0) s FROM registrations WHERE event_id = ? AND status = 'confirmed'").get(eventId).s
    };
  }

  // ── health / auth ──────────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'eventcraft' }));

  app.post('/api/login', (req, res) => {
    if ((req.body || {}).password !== adminPassword) return res.status(401).json({ error: 'wrong password' });
    createSession(res);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  app.get('/auth/auto', (req, res) => {
    if (autologinToken && req.query.token === autologinToken) createSession(res);
    res.redirect('/');
  });

  app.get('/api/me', requireAuth, (req, res) => res.json({ ok: true }));

  // ── events CRUD (admin) ────────────────────────────────────────────────────
  function eventInput(b) {
    return {
      title: String(b.title || '').trim(),
      description: String(b.description || '').trim(),
      starts_at: Number(b.starts_at) || null,
      ends_at: Number(b.ends_at) || null,
      location: String(b.location || '').trim(),
      is_virtual: b.is_virtual ? 1 : 0,
      cover_url: String(b.cover_url || '').trim(),
      questions_json: JSON.stringify(Array.isArray(b.questions) ? b.questions.map((q) => ({
        key: String(q.key || '').trim(), label: String(q.label || '').trim(), required: Boolean(q.required)
      })).filter((q) => q.key && q.label) : []),
      published: b.published === false ? 0 : 1
    };
  }

  app.get('/api/events', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM events ORDER BY starts_at DESC').all();
    res.json(rows.map((e) => ({
      ...e, questions: JSON.parse(e.questions_json),
      tiers: tiersForEvent(e.id), stats: eventStats(e.id)
    })));
  });

  app.post('/api/events', requireAuth, (req, res) => {
    const v = eventInput(req.body || {});
    if (!v.title || !v.starts_at) return res.status(400).json({ error: 'title and starts_at are required' });
    let slug = slugify(v.title);
    let n = 1;
    while (findEventBySlug.get(slug)) slug = `${slugify(v.title)}-${++n}`;
    const info = db.prepare(`
      INSERT INTO events (slug, title, description, starts_at, ends_at, location, is_virtual, cover_url, questions_json, published, created_at)
      VALUES (@slug, @title, @description, @starts_at, @ends_at, @location, @is_virtual, @cover_url, @questions_json, @published, @created_at)
    `).run({ ...v, slug, created_at: Date.now() });
    const ev = findEvent.get(info.lastInsertRowid);
    res.status(201).json({ ...ev, questions: JSON.parse(ev.questions_json), tiers: [], stats: eventStats(ev.id) });
  });

  app.put('/api/events/:id', requireAuth, (req, res) => {
    const ev = findEvent.get(req.params.id);
    if (!ev) return res.status(404).json({ error: 'not found' });
    const v = eventInput({ ...ev, questions: JSON.parse(ev.questions_json), ...(req.body || {}) });
    db.prepare(`
      UPDATE events SET title=@title, description=@description, starts_at=@starts_at, ends_at=@ends_at,
        location=@location, is_virtual=@is_virtual, cover_url=@cover_url, questions_json=@questions_json, published=@published
      WHERE id=@id
    `).run({ ...v, id: ev.id });
    const out = findEvent.get(ev.id);
    res.json({ ...out, questions: JSON.parse(out.questions_json), tiers: tiersForEvent(ev.id), stats: eventStats(ev.id) });
  });

  app.delete('/api/events/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM registrations WHERE event_id = ?').run(req.params.id);
    db.prepare('DELETE FROM ticket_tiers WHERE event_id = ?').run(req.params.id);
    db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── ticket tiers (admin) ───────────────────────────────────────────────────
  app.post('/api/events/:id/tiers', requireAuth, (req, res) => {
    const ev = findEvent.get(req.params.id);
    if (!ev) return res.status(404).json({ error: 'event not found' });
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const price_cents = Math.max(0, Math.round(Number(b.price_cents) || 0));
    if (!Number.isSafeInteger(price_cents)) return res.status(400).json({ error: 'price_cents must be an integer' });
    const eb = b.earlybird_price_cents != null && b.earlybird_price_cents !== ''
      ? Math.max(0, Math.round(Number(b.earlybird_price_cents))) : null;
    const info = db.prepare(`
      INSERT INTO ticket_tiers (event_id, name, price_cents, earlybird_price_cents, earlybird_until, quantity, payment_link, sort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ev.id, name, price_cents, eb, b.earlybird_until ? Number(b.earlybird_until) : null,
           Math.max(0, Math.floor(Number(b.quantity) || 0)), String(b.payment_link || '').trim(), Number(b.sort) || 0);
    res.status(201).json(tiersForEvent(ev.id).find((t) => t.id === info.lastInsertRowid));
  });

  app.put('/api/tiers/:id', requireAuth, (req, res) => {
    const tier = findTier.get(req.params.id);
    if (!tier) return res.status(404).json({ error: 'not found' });
    const b = { ...tier, ...(req.body || {}) };
    db.prepare(`
      UPDATE ticket_tiers SET name=?, price_cents=?, earlybird_price_cents=?, earlybird_until=?, quantity=?, payment_link=?, sort=? WHERE id=?
    `).run(String(b.name).trim(), Math.max(0, Math.round(Number(b.price_cents) || 0)),
           b.earlybird_price_cents != null && b.earlybird_price_cents !== '' ? Math.round(Number(b.earlybird_price_cents)) : null,
           b.earlybird_until ? Number(b.earlybird_until) : null,
           Math.max(0, Math.floor(Number(b.quantity) || 0)), String(b.payment_link || '').trim(), Number(b.sort) || 0, tier.id);
    res.json(tiersForEvent(tier.event_id).find((t) => t.id === tier.id));
  });

  app.delete('/api/tiers/:id', requireAuth, (req, res) => {
    const tier = findTier.get(req.params.id);
    if (!tier) return res.status(404).json({ error: 'not found' });
    const regs = db.prepare("SELECT COUNT(*) n FROM registrations WHERE tier_id = ? AND status != 'cancelled'").get(tier.id).n;
    if (regs > 0) return res.status(409).json({ error: 'tier has registrations — cancel them first' });
    db.prepare('DELETE FROM ticket_tiers WHERE id = ?').run(tier.id);
    res.json({ ok: true });
  });

  // ── public event list + page ───────────────────────────────────────────────
  app.get('/api/public/events', (req, res) => {
    const rows = db.prepare('SELECT * FROM events WHERE published = 1 ORDER BY starts_at').all();
    res.json(rows.map((e) => ({
      slug: e.slug, title: e.title, starts_at: e.starts_at, location: e.location,
      is_virtual: Boolean(e.is_virtual), cover_url: e.cover_url,
      description: e.description.slice(0, 200)
    })));
  });

  app.get('/api/public/events/:slug', (req, res) => {
    const ev = findEventBySlug.get(req.params.slug);
    if (!ev || !ev.published) return res.status(404).json({ error: 'event not found' });
    const stats = eventStats(ev.id);
    res.json({
      slug: ev.slug, title: ev.title, description: ev.description,
      starts_at: ev.starts_at, ends_at: ev.ends_at, location: ev.location,
      is_virtual: Boolean(ev.is_virtual), cover_url: ev.cover_url,
      questions: JSON.parse(ev.questions_json),
      tiers: tiersForEvent(ev.id).map((t) => ({
        id: t.id, name: t.name, price_cents: t.price_cents,
        current_price_cents: t.current_price_cents, earlybird_active: t.earlybird_active,
        earlybird_until: t.earlybird_until, remaining: t.remaining, sold_out: t.sold_out
      })),
      confirmed_count: stats.confirmed
    });
  });

  // ── registration (public) — capacity + waitlist, money in integer cents ────
  const registerTx = db.transaction((ev, tier, name, email, answers, now) => {
    // Re-read the tier inside the transaction so two concurrent registrations
    // can't both take the last seat.
    const fresh = findTier.get(tier.id);
    const soldOut = fresh.quantity > 0 && fresh.sold >= fresh.quantity;
    const status = soldOut ? 'waitlist' : 'confirmed';
    const price = status === 'confirmed' ? tierPriceCents(fresh, now) : 0;
    const token = status === 'confirmed' ? genToken(16) : null;
    const info = db.prepare(`
      INSERT INTO registrations (event_id, tier_id, name, email, custom_answers_json, status, price_cents, ticket_token, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ev.id, fresh.id, name, email, JSON.stringify(answers), status, price, token, now);
    if (status === 'confirmed') {
      db.prepare('UPDATE ticket_tiers SET sold = sold + 1 WHERE id = ?').run(fresh.id);
    }
    return findReg.get(info.lastInsertRowid);
  });

  app.post('/api/public/events/:slug/register', (req, res) => {
    const ev = findEventBySlug.get(req.params.slug);
    if (!ev || !ev.published) return res.status(404).json({ error: 'event not found' });
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
    const tier = findTier.get(Number(b.tier_id));
    if (!tier || tier.event_id !== ev.id) return res.status(400).json({ error: 'invalid ticket tier' });

    const questions = JSON.parse(ev.questions_json);
    const answers = {};
    for (const q of questions) {
      const val = String((b.custom_answers || {})[q.key] || '').trim();
      if (q.required && !val) return res.status(400).json({ error: `"${q.label}" is required` });
      if (val) answers[q.key] = val;
    }

    const dupe = db.prepare(
      "SELECT id FROM registrations WHERE event_id = ? AND email = ? AND status != 'cancelled'"
    ).get(ev.id, email);
    if (dupe) return res.status(409).json({ error: 'this email is already registered for this event' });

    const reg = registerTx(ev, tier, name, email, answers, Date.now());
    const s = getSettings(db);
    const base = s.base_url || `http://localhost:${process.env.PORT || 5368}`;

    if (reg.status === 'confirmed') {
      sendMail(s, email, `🎟 Your ticket — ${ev.title}`,
        `Hi ${name},\n\nYou're confirmed for ${ev.title}.\nYour ticket: ${base}/#/ticket/${reg.ticket_token}\n\nShow the QR code at the door.\n`)
        .catch((e) => console.warn('[mail]', e.message));
    }

    res.status(201).json({
      id: reg.id,
      status: reg.status,
      price_cents: reg.price_cents,
      ticket_token: reg.ticket_token,
      ticket_url: reg.ticket_token ? `/#/ticket/${reg.ticket_token}` : null,
      // BYO Stripe Payment Link — Eventcraft never takes a cut and never calls Stripe's API
      payment_url: reg.status === 'confirmed' && reg.price_cents > 0 && tier.payment_link ? tier.payment_link : null,
      waitlist_position: reg.status === 'waitlist'
        ? db.prepare("SELECT COUNT(*) n FROM registrations WHERE tier_id = ? AND status = 'waitlist' AND id <= ?").get(tier.id, reg.id).n
        : null
    });
  });

  // ── ticket (public) ────────────────────────────────────────────────────────
  app.get('/api/ticket/:token', (req, res) => {
    const reg = db.prepare('SELECT * FROM registrations WHERE ticket_token = ?').get(req.params.token);
    if (!reg) return res.status(404).json({ error: 'ticket not found' });
    const ev = findEvent.get(reg.event_id);
    const tier = findTier.get(reg.tier_id);
    res.json({
      name: reg.name, status: reg.status, checked_in_at: reg.checked_in_at,
      price_cents: reg.price_cents, tier: tier?.name,
      event: { slug: ev.slug, title: ev.title, starts_at: ev.starts_at, location: ev.location }
    });
  });

  app.get('/api/ticket/:token/qr.png', async (req, res) => {
    const reg = db.prepare('SELECT * FROM registrations WHERE ticket_token = ?').get(req.params.token);
    if (!reg) return res.status(404).send('not found');
    const buf = await QRCode.toBuffer(`ec:${reg.ticket_token}`, { width: 480, margin: 2, errorCorrectionLevel: 'M' });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  });

  // ── ICS calendar file (public) ─────────────────────────────────────────────
  app.get('/api/public/events/:slug/ics', (req, res) => {
    const ev = findEventBySlug.get(req.params.slug);
    if (!ev || !ev.published) return res.status(404).send('not found');
    const s = getSettings(db);
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${ev.slug}.ics"`);
    res.send(eventIcs(ev, s.base_url));
  });

  // ── check-in (admin) ───────────────────────────────────────────────────────
  app.post('/api/checkin', requireAuth, (req, res) => {
    let code = String((req.body || {}).code || '').trim();
    if (code.startsWith('ec:')) code = code.slice(3);
    const reg = db.prepare('SELECT * FROM registrations WHERE ticket_token = ?').get(code);
    if (!reg) return res.status(404).json({ error: 'unknown ticket' });
    if (reg.status !== 'confirmed') return res.status(409).json({ error: `ticket is ${reg.status}` });
    const ev = findEvent.get(reg.event_id);
    const tier = findTier.get(reg.tier_id);
    if (reg.checked_in_at) {
      return res.status(200).json({
        ok: false, already_checked_in: true, name: reg.name, tier: tier?.name,
        event: ev.title, checked_in_at: reg.checked_in_at, stats: eventStats(ev.id)
      });
    }
    const now = Date.now();
    db.prepare('UPDATE registrations SET checked_in_at = ? WHERE id = ?').run(now, reg.id);
    res.json({
      ok: true, already_checked_in: false, name: reg.name, tier: tier?.name,
      event: ev.title, checked_in_at: now, stats: eventStats(ev.id)
    });
  });

  // ── registrations admin ────────────────────────────────────────────────────
  app.get('/api/events/:id/registrations', requireAuth, (req, res) => {
    const rows = db.prepare(`
      SELECT r.*, t.name AS tier_name FROM registrations r
      LEFT JOIN ticket_tiers t ON t.id = r.tier_id
      WHERE r.event_id = ? ORDER BY r.created_at
    `).all(req.params.id);
    res.json(rows.map((r) => ({ ...r, custom_answers: JSON.parse(r.custom_answers_json) })));
  });

  // Cancel a registration; auto-promote the earliest waitlisted person.
  app.post('/api/registrations/:id/cancel', requireAuth, (req, res) => {
    const reg = findReg.get(req.params.id);
    if (!reg) return res.status(404).json({ error: 'not found' });
    if (reg.status === 'cancelled') return res.status(409).json({ error: 'already cancelled' });

    let promoted = null;
    const tx = db.transaction(() => {
      const wasConfirmed = reg.status === 'confirmed';
      db.prepare("UPDATE registrations SET status = 'cancelled', ticket_token = NULL, checked_in_at = NULL WHERE id = ?").run(reg.id);
      if (wasConfirmed) {
        db.prepare('UPDATE ticket_tiers SET sold = sold - 1 WHERE id = ? AND sold > 0').run(reg.tier_id);
        const next = db.prepare(
          "SELECT * FROM registrations WHERE tier_id = ? AND status = 'waitlist' ORDER BY created_at, id LIMIT 1"
        ).get(reg.tier_id);
        if (next) {
          const tier = findTier.get(reg.tier_id);
          const token = genToken(16);
          const price = tierPriceCents(tier, Date.now());
          db.prepare("UPDATE registrations SET status = 'confirmed', ticket_token = ?, price_cents = ? WHERE id = ?")
            .run(token, price, next.id);
          db.prepare('UPDATE ticket_tiers SET sold = sold + 1 WHERE id = ?').run(tier.id);
          promoted = { ...next, status: 'confirmed', ticket_token: token, price_cents: price };
        }
      }
    });
    tx();

    if (promoted) {
      const ev = findEvent.get(reg.event_id);
      const s = getSettings(db);
      const base = s.base_url || `http://localhost:${process.env.PORT || 5368}`;
      sendMail(s, promoted.email, `🎟 You're off the waitlist — ${ev.title}`,
        `Hi ${promoted.name},\n\nA spot opened up and you're now confirmed for ${ev.title}.\nYour ticket: ${base}/#/ticket/${promoted.ticket_token}\n`)
        .catch((e) => console.warn('[mail]', e.message));
    }
    res.json({ ok: true, promoted: promoted ? { id: promoted.id, email: promoted.email } : null });
  });

  app.get('/api/events/:id/export.csv', requireAuth, (req, res) => {
    const ev = findEvent.get(req.params.id);
    if (!ev) return res.status(404).json({ error: 'not found' });
    const questions = JSON.parse(ev.questions_json);
    const rows = db.prepare(`
      SELECT r.*, t.name AS tier_name FROM registrations r
      LEFT JOIN ticket_tiers t ON t.id = r.tier_id WHERE r.event_id = ? ORDER BY r.created_at
    `).all(ev.id);
    const header = ['name', 'email', 'tier', 'status', 'price_usd', 'checked_in', 'registered_at', ...questions.map((q) => q.key)];
    const out = [header];
    for (const r of rows) {
      const answers = JSON.parse(r.custom_answers_json);
      out.push([
        r.name, r.email, r.tier_name || '', r.status,
        (r.price_cents / 100).toFixed(2),
        r.checked_in_at ? new Date(r.checked_in_at).toISOString() : '',
        new Date(r.created_at).toISOString(),
        ...questions.map((q) => answers[q.key] || '')
      ]);
    }
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${ev.slug}-attendees.csv"`);
    res.send(stringifyCsv(out));
  });

  // ── settings ───────────────────────────────────────────────────────────────
  app.get('/api/settings', requireAuth, (req, res) => {
    const s = getSettings(db);
    res.json({ ...s, smtp_pass: s.smtp_pass ? '********' : '' });
  });

  app.put('/api/settings', requireAuth, (req, res) => {
    const body = { ...(req.body || {}) };
    if (body.smtp_pass === '********') delete body.smtp_pass;
    setSettings(db, body);
    const s = getSettings(db);
    res.json({ ...s, smtp_pass: s.smtp_pass ? '********' : '' });
  });

  // ── static frontend ────────────────────────────────────────────────────────
  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/auth')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  return app;
}

module.exports = { createApp, tierPriceCents };
