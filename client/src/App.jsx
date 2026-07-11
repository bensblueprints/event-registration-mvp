import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Ticket, CalendarDays, MapPin, Video, Lock, LogOut, Plus, Pencil, Trash2, X, Check,
  QrCode, ScanLine, Download, Users, DollarSign, Clock, ExternalLink, ListChecks, Ban
} from 'lucide-react';
import { api, money, fmtDate } from './api.js';

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const fn = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return hash;
}

function Modal({ title, onClose, children, wide }) {
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto py-10 px-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <motion.div className={`card w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6`}
          initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
            <button className="text-zinc-500 hover:text-zinc-300" onClick={onClose}><X size={18} /></button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Public event page ─────────────────────────────────────────────────── */
function EventPage({ slug }) {
  const [ev, setEv] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', email: '', tier_id: null, custom_answers: {} });
  const [result, setResult] = useState(null);
  useEffect(() => { api(`/api/public/events/${slug}`).then(setEv).catch((e) => setErr(e.message)); }, [slug]);
  if (err) return <div className="max-w-lg mx-auto mt-24 card p-8 text-center text-red-400">{err}</div>;
  if (!ev) return <div className="text-center text-zinc-600 mt-24">Loading…</div>;
  const tier = ev.tiers.find((t) => t.id === form.tier_id);

  async function register(e) {
    e.preventDefault(); setErr('');
    try {
      const r = await api(`/api/public/events/${slug}/register`, { method: 'POST', body: form });
      setResult(r);
    } catch (e2) { setErr(e2.message); }
  }

  if (result) {
    return (
      <div className="max-w-lg mx-auto mt-16 px-4">
        <motion.div className="card p-8 text-center" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          {result.status === 'confirmed' ? (
            <>
              <div className="w-14 h-14 rounded-full bg-emerald-950 border border-emerald-900 flex items-center justify-center mx-auto mb-4"><Check className="text-emerald-400" /></div>
              <h2 className="text-xl font-semibold mb-1">You're in! 🎟</h2>
              <p className="text-zinc-400 text-sm mb-4">{ev.title} — {fmtDate(ev.starts_at)}</p>
              {result.price_cents > 0 && (
                <p className="text-sm text-zinc-300 mb-3">Amount due: <b>{money(result.price_cents)}</b></p>
              )}
              {result.payment_url && (
                <a href={result.payment_url} target="_blank" rel="noreferrer" className="btn btn-primary justify-center w-full mb-3">
                  <DollarSign size={15} /> Pay {money(result.price_cents)} now <ExternalLink size={13} />
                </a>
              )}
              <a href={`#/ticket/${result.ticket_token}`} className="btn btn-ghost justify-center w-full mb-2"><QrCode size={15} /> View my QR ticket</a>
              <a href={`/api/public/events/${slug}/ics`} className="btn btn-ghost justify-center w-full"><CalendarDays size={15} /> Add to calendar (.ics)</a>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-amber-950 border border-amber-900 flex items-center justify-center mx-auto mb-4"><Clock className="text-amber-400" /></div>
              <h2 className="text-xl font-semibold mb-1">You're on the waitlist</h2>
              <p className="text-zinc-400 text-sm">Position #{result.waitlist_position}. We'll email you if a spot opens up.</p>
            </>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {ev.cover_url && <img src={ev.cover_url} alt="" className="w-full h-56 object-cover rounded-xl mb-6 bg-zinc-900" />}
      <h1 className="text-3xl font-bold text-zinc-50">{ev.title}</h1>
      <div className="flex flex-wrap gap-4 text-sm text-zinc-400 mt-3 mb-6">
        <span className="flex items-center gap-1.5"><CalendarDays size={15} className="text-violet-400" /> {fmtDate(ev.starts_at)}</span>
        <span className="flex items-center gap-1.5">
          {ev.is_virtual ? <Video size={15} className="text-violet-400" /> : <MapPin size={15} className="text-violet-400" />}
          {ev.location || (ev.is_virtual ? 'Online event' : 'TBA')}
        </span>
        <a href={`/api/public/events/${slug}/ics`} className="flex items-center gap-1 text-violet-400 hover:underline"><Download size={13} /> .ics</a>
      </div>
      <p className="text-zinc-300 whitespace-pre-wrap mb-8">{ev.description}</p>

      <form onSubmit={register} className="card p-6 space-y-4">
        <h2 className="font-semibold text-zinc-100 flex items-center gap-2"><Ticket size={16} className="text-violet-400" /> Register</h2>
        <div className="space-y-2">
          {ev.tiers.map((t) => (
            <label key={t.id} className={`flex items-center justify-between rounded-lg border px-4 py-3 cursor-pointer transition-colors
              ${form.tier_id === t.id ? 'border-violet-500 bg-violet-950/30' : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'}`}>
              <div className="flex items-center gap-3">
                <input type="radio" name="tier" className="accent-violet-500" checked={form.tier_id === t.id} onChange={() => setForm((f) => ({ ...f, tier_id: t.id }))} />
                <div>
                  <div className="text-sm font-medium text-zinc-100">{t.name}</div>
                  <div className="text-xs text-zinc-500">
                    {t.sold_out ? 'Sold out — join waitlist' : t.remaining != null ? `${t.remaining} left` : 'Available'}
                    {t.earlybird_active && <span className="text-emerald-400 ml-2">Early-bird until {new Date(t.earlybird_until).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
              <div className="text-right">
                {t.earlybird_active && <div className="text-xs text-zinc-600 line-through">{money(t.price_cents)}</div>}
                <div className="font-semibold text-zinc-100">{t.current_price_cents === 0 ? 'Free' : money(t.current_price_cents)}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <input className="input" placeholder="Full name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <input className="input" type="email" placeholder="Email *" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
        </div>
        {ev.questions.map((q) => (
          <input key={q.key} className="input" placeholder={q.label + (q.required ? ' *' : '')} required={q.required}
            value={form.custom_answers[q.key] || ''}
            onChange={(e) => setForm((f) => ({ ...f, custom_answers: { ...f.custom_answers, [q.key]: e.target.value } }))} />
        ))}
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button className="btn btn-primary w-full justify-center" disabled={!form.tier_id}>
          {tier?.sold_out ? 'Join waitlist' : tier && tier.current_price_cents > 0 ? `Register — ${money(tier.current_price_cents)}` : 'Register free'}
        </button>
        <p className="text-xs text-zinc-600 text-center">No platform fees. Powered by Eventcraft.</p>
      </form>
    </div>
  );
}

/* ── Ticket page ───────────────────────────────────────────────────────── */
function TicketPage({ token }) {
  const [t, setT] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/api/ticket/${token}`).then(setT).catch((e) => setErr(e.message)); }, [token]);
  if (err) return <div className="max-w-md mx-auto mt-24 card p-8 text-center text-red-400">{err}</div>;
  if (!t) return <div className="text-center text-zinc-600 mt-24">Loading…</div>;
  return (
    <div className="max-w-sm mx-auto mt-12 px-4">
      <motion.div className="card overflow-hidden" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <div className="bg-violet-950/60 border-b border-violet-900/40 p-5 text-center">
          <div className="text-xs uppercase tracking-widest text-violet-300 mb-1">Admit one</div>
          <h1 className="font-semibold text-zinc-50">{t.event.title}</h1>
          <p className="text-xs text-zinc-400 mt-1">{fmtDate(t.event.starts_at)}{t.event.location ? ` · ${t.event.location}` : ''}</p>
        </div>
        <div className="p-6 text-center">
          <img src={`/api/ticket/${token}/qr.png`} alt="QR ticket" className="w-56 h-56 mx-auto rounded-lg bg-white p-2" />
          <div className="mt-4 text-zinc-100 font-medium">{t.name}</div>
          <div className="text-sm text-zinc-500">{t.tier} · {t.price_cents === 0 ? 'Free' : money(t.price_cents)}</div>
          {t.checked_in_at && <div className="chip bg-emerald-950 text-emerald-300 border border-emerald-900/60 mt-3">✓ Checked in {fmtDate(t.checked_in_at)}</div>}
        </div>
      </motion.div>
      <p className="text-center text-xs text-zinc-600 mt-4">Show this QR code at the door.</p>
    </div>
  );
}

/* ── Check-in scanner ──────────────────────────────────────────────────── */
function ScanPage() {
  const videoRef = useRef(null);
  const [last, setLast] = useState(null);
  const [manual, setManual] = useState('');
  const [err, setErr] = useState('');
  const [scanning, setScanning] = useState(false);
  const lastCodeRef = useRef({ code: '', at: 0 });

  useEffect(() => {
    let stream, raf, canceled = false;
    let jsQR;
    (async () => {
      try {
        jsQR = (await import('jsqr')).default;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (canceled) { stream.getTracks().forEach((t) => t.stop()); return; }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const tick = () => {
          if (canceled) return;
          const v = videoRef.current;
          if (v && v.readyState === 4) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height);
            if (code?.data) {
              const now = Date.now();
              if (code.data !== lastCodeRef.current.code || now - lastCodeRef.current.at > 4000) {
                lastCodeRef.current = { code: code.data, at: now };
                checkin(code.data);
              }
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        setErr('Camera unavailable — use manual entry below. (' + e.message + ')');
      }
    })();
    return () => {
      canceled = true;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function checkin(code) {
    try {
      const r = await api('/api/checkin', { method: 'POST', body: { code } });
      setLast({ ...r, at: Date.now() });
      setErr('');
    } catch (e) {
      setLast(null);
      setErr(e.message);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <a href="#/" className="text-sm text-zinc-500 hover:text-zinc-300">← Back</a>
      <h1 className="text-xl font-semibold mt-2 mb-4 flex items-center gap-2"><ScanLine className="text-violet-400" /> Door check-in</h1>
      <div className="card overflow-hidden mb-4">
        <video ref={videoRef} className="w-full aspect-video object-cover bg-black" muted playsInline />
        {scanning && <div className="text-center text-xs text-zinc-500 py-2">Point the camera at a ticket QR code</div>}
      </div>
      {last && (
        <motion.div key={last.at} initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className={`card p-5 mb-4 border ${last.already_checked_in ? 'border-amber-900 bg-amber-950/30' : 'border-emerald-900 bg-emerald-950/30'}`}>
          <div className="flex items-center gap-3">
            {last.already_checked_in ? <Ban className="text-amber-400" /> : <Check className="text-emerald-400" />}
            <div>
              <div className="font-semibold text-zinc-100">{last.name} <span className="text-zinc-500 font-normal">· {last.tier}</span></div>
              <div className="text-sm text-zinc-400">
                {last.already_checked_in ? `⚠ ALREADY checked in at ${fmtDate(last.checked_in_at)}` : `Checked in — ${last.event}`}
              </div>
            </div>
          </div>
          <div className="text-xs text-zinc-500 mt-3">{last.stats.checked_in} / {last.stats.confirmed} attendees checked in</div>
        </motion.div>
      )}
      {err && <div className="card p-4 mb-4 border-red-900 bg-red-950/30 text-red-300 text-sm">{err}</div>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); checkin(manual); setManual(''); }}>
        <input className="input" placeholder="Or type ticket code manually" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button className="btn btn-primary">Check in</button>
      </form>
    </div>
  );
}

/* ── Admin: event editor modal ─────────────────────────────────────────── */
function toLocalInput(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventForm({ initial, onSave }) {
  const [f, setF] = useState(() => ({
    title: '', description: '', location: '', is_virtual: false, cover_url: '',
    questions: [], ...initial,
    starts_at: toLocalInput(initial?.starts_at), ends_at: toLocalInput(initial?.ends_at)
  }));
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      onSave({
        ...f,
        starts_at: f.starts_at ? new Date(f.starts_at).getTime() : null,
        ends_at: f.ends_at ? new Date(f.ends_at).getTime() : null
      });
    }}>
      <input className="input" placeholder="Event title *" value={f.title} onChange={(e) => set('title', e.target.value)} required />
      <textarea className="input" rows={4} placeholder="Description" value={f.description} onChange={(e) => set('description', e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-zinc-500">Starts *<input className="input mt-1" type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} required /></label>
        <label className="text-xs text-zinc-500">Ends<input className="input mt-1" type="datetime-local" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></label>
      </div>
      <div className="flex gap-3 items-center">
        <input className="input flex-1" placeholder={f.is_virtual ? 'Meeting link' : 'Venue address'} value={f.location} onChange={(e) => set('location', e.target.value)} />
        <label className="text-sm text-zinc-400 flex items-center gap-2 whitespace-nowrap">
          <input type="checkbox" className="accent-violet-500" checked={f.is_virtual} onChange={(e) => set('is_virtual', e.target.checked)} /> Virtual
        </label>
      </div>
      <input className="input" placeholder="Cover image URL" value={f.cover_url} onChange={(e) => set('cover_url', e.target.value)} />
      <div>
        <div className="text-xs text-zinc-500 mb-1.5">Custom registration questions</div>
        {f.questions.map((q, i) => (
          <div key={i} className="flex gap-2 mb-1.5">
            <input className="input" placeholder="key" value={q.key} onChange={(e) => set('questions', f.questions.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
            <input className="input" placeholder="Label" value={q.label} onChange={(e) => set('questions', f.questions.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
            <label className="text-xs text-zinc-500 flex items-center gap-1"><input type="checkbox" checked={q.required} onChange={(e) => set('questions', f.questions.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))} />req</label>
            <button type="button" className="text-zinc-600 hover:text-red-400" onClick={() => set('questions', f.questions.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost text-xs" onClick={() => set('questions', [...f.questions, { key: '', label: '', required: false }])}><Plus size={13} /> Question</button>
      </div>
      <button className="btn btn-primary w-full justify-center"><Check size={15} /> Save event</button>
    </form>
  );
}

function TierEditor({ event, reload }) {
  const [f, setF] = useState({ name: '', price: '', quantity: '', eb_price: '', eb_until: '', payment_link: '' });
  return (
    <div className="space-y-2">
      {event.tiers.map((t) => (
        <div key={t.id} className="flex items-center justify-between bg-zinc-900 rounded-lg px-3 py-2 text-sm">
          <div>
            <span className="text-zinc-200 font-medium">{t.name}</span>
            <span className="text-zinc-500 ml-2">{t.price_cents === 0 ? 'Free' : money(t.price_cents)}</span>
            {t.earlybird_price_cents != null && <span className="text-emerald-400 ml-2 text-xs">EB {money(t.earlybird_price_cents)}</span>}
            <span className="text-zinc-600 ml-2 text-xs">{t.quantity > 0 ? `${t.sold}/${t.quantity} sold` : `${t.sold} sold · unlimited`}</span>
          </div>
          <button className="text-zinc-600 hover:text-red-400" onClick={async () => {
            try { await api(`/api/tiers/${t.id}`, { method: 'DELETE' }); reload(); } catch (e) { alert(e.message); }
          }}><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="grid grid-cols-6 gap-2">
        <input className="input col-span-2" placeholder="Tier name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input" placeholder="$ price" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        <input className="input" placeholder="Qty (0=∞)" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
        <input className="input" placeholder="$ early-bird" value={f.eb_price} onChange={(e) => setF({ ...f, eb_price: e.target.value })} />
        <input className="input" type="date" title="Early-bird until" value={f.eb_until} onChange={(e) => setF({ ...f, eb_until: e.target.value })} />
      </div>
      <input className="input" placeholder="Stripe Payment Link (optional — BYO, zero platform fee)" value={f.payment_link} onChange={(e) => setF({ ...f, payment_link: e.target.value })} />
      <button className="btn btn-ghost text-xs" onClick={async () => {
        await api(`/api/events/${event.id}/tiers`, {
          method: 'POST',
          body: {
            name: f.name,
            price_cents: Math.round(parseFloat(f.price || '0') * 100),
            quantity: parseInt(f.quantity || '0', 10),
            earlybird_price_cents: f.eb_price !== '' ? Math.round(parseFloat(f.eb_price) * 100) : null,
            earlybird_until: f.eb_until ? new Date(f.eb_until + 'T23:59:59').getTime() : null,
            payment_link: f.payment_link
          }
        });
        setF({ name: '', price: '', quantity: '', eb_price: '', eb_until: '', payment_link: '' });
        reload();
      }}><Plus size={13} /> Add tier</button>
    </div>
  );
}

/* ── Admin: attendees ──────────────────────────────────────────────────── */
function Attendees({ event, reload }) {
  const [regs, setRegs] = useState([]);
  const load = useCallback(() => api(`/api/events/${event.id}/registrations`).then(setRegs), [event.id]);
  useEffect(() => { load(); }, [load]);
  const badge = {
    confirmed: 'bg-emerald-950 text-emerald-300 border border-emerald-900/60',
    waitlist: 'bg-amber-950 text-amber-300 border border-amber-900/60',
    cancelled: 'bg-zinc-900 text-zinc-500 border border-zinc-800'
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-zinc-400 flex items-center gap-4">
          <span><b className="text-zinc-200">{event.stats.confirmed}</b> confirmed</span>
          <span><b className="text-zinc-200">{event.stats.waitlist}</b> waitlist</span>
          <span><b className="text-zinc-200">{event.stats.checked_in}</b> checked in</span>
          <span><b className="text-zinc-200">{money(event.stats.revenue_cents)}</b> revenue</span>
        </div>
        <a className="btn btn-ghost text-xs" href={`/api/events/${event.id}/export.csv`}><Download size={13} /> CSV</a>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-zinc-500 border-b border-zinc-900">
            <th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Tier</th><th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Paid</th><th className="px-3 py-2 font-medium">Check-in</th><th />
          </tr></thead>
          <tbody>
            {regs.map((r) => (
              <tr key={r.id} className="border-b border-zinc-900/60">
                <td className="px-3 py-2 text-zinc-200">{r.name}</td>
                <td className="px-3 py-2 text-zinc-500">{r.email}</td>
                <td className="px-3 py-2 text-zinc-400">{r.tier_name}</td>
                <td className="px-3 py-2"><span className={`chip ${badge[r.status]}`}>{r.status}</span></td>
                <td className="px-3 py-2 text-zinc-400">{r.price_cents === 0 ? '—' : money(r.price_cents)}</td>
                <td className="px-3 py-2 text-zinc-400">{r.checked_in_at ? '✓ ' + new Date(r.checked_in_at).toLocaleTimeString() : '—'}</td>
                <td className="px-2">
                  {r.status !== 'cancelled' && (
                    <button className="text-zinc-600 hover:text-red-400" title="Cancel (auto-promotes waitlist)"
                      onClick={async () => { await api(`/api/registrations/${r.id}/cancel`, { method: 'POST' }); load(); reload(); }}>
                      <Ban size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {regs.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-zinc-600">No registrations yet — share #{'{'}public link{'}'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main app ──────────────────────────────────────────────────────────── */
export default function App() {
  const hash = useHashRoute();
  const [isAdmin, setIsAdmin] = useState(null);
  const [events, setEvents] = useState([]);
  const [publicEvents, setPublicEvents] = useState([]);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const loadAdmin = useCallback(async () => {
    try {
      await api('/api/me');
      setIsAdmin(true);
      const evs = await api('/api/events');
      setEvents(evs);
      setSelected((sel) => sel ? evs.find((e) => e.id === sel.id) || null : null);
    } catch {
      setIsAdmin(false);
      api('/api/public/events').then(setPublicEvents).catch(() => {});
    }
  }, []);
  useEffect(() => { loadAdmin(); }, [loadAdmin]);

  const evMatch = hash.match(/^#\/e\/([a-z0-9-]+)/);
  if (evMatch) return <EventPage slug={evMatch[1]} />;
  const tkMatch = hash.match(/^#\/ticket\/([a-f0-9]+)/);
  if (tkMatch) return <TicketPage token={tkMatch[1]} />;
  if (hash.startsWith('#/scan')) return <ScanPage />;

  async function login(e) {
    e.preventDefault(); setErr('');
    try {
      await api('/api/login', { method: 'POST', body: { password } });
      setPassword(''); setModal(null); loadAdmin();
    } catch { setErr('Wrong password'); }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 backdrop-blur bg-zinc-950/80 border-b border-zinc-900">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Ticket size={20} className="text-violet-400" />
          <span className="font-semibold text-zinc-100">Eventcraft</span>
          <span className="text-xs text-zinc-600 hidden sm:block">zero-fee event registration</span>
          <div className="flex-1" />
          {isAdmin ? (
            <>
              <a href="#/scan" className="btn btn-ghost text-xs"><ScanLine size={14} /> Check-in</a>
              <button className="btn btn-primary text-xs" onClick={() => { setEditing(null); setModal('event'); }}><Plus size={14} /> Event</button>
              <button className="btn btn-ghost text-xs" onClick={async () => { await api('/api/logout', { method: 'POST' }); loadAdmin(); }}><LogOut size={14} /></button>
            </>
          ) : isAdmin === false ? (
            <button className="btn btn-ghost text-xs" onClick={() => setModal('login')}><Lock size={14} /> Admin</button>
          ) : null}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {isAdmin ? (
          <div className="space-y-4">
            {events.map((ev) => (
              <div key={ev.id} className="card p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-semibold text-zinc-100 text-lg">{ev.title}</h2>
                    <div className="text-sm text-zinc-500 flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1"><CalendarDays size={13} /> {fmtDate(ev.starts_at)}</span>
                      <a href={`#/e/${ev.slug}`} className="text-violet-400 hover:underline flex items-center gap-1"><ExternalLink size={12} /> public page</a>
                      <a href={`/api/public/events/${ev.slug}/ics`} className="text-violet-400 hover:underline">.ics</a>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost text-xs" onClick={() => { setEditing(ev); setModal('event'); }}><Pencil size={13} /> Edit</button>
                    <button className="btn btn-ghost text-xs" onClick={() => setSelected(selected?.id === ev.id ? null : ev)}>
                      <Users size={13} /> {selected?.id === ev.id ? 'Hide' : 'Attendees'}
                    </button>
                    <button className="btn btn-danger text-xs" onClick={async () => { if (confirm('Delete event and all registrations?')) { await api(`/api/events/${ev.id}`, { method: 'DELETE' }); loadAdmin(); } }}><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="mt-4 border-t border-zinc-900 pt-4">
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2 flex items-center gap-1"><ListChecks size={12} /> Ticket tiers</div>
                  <TierEditor event={ev} reload={loadAdmin} />
                </div>
                {selected?.id === ev.id && (
                  <div className="mt-4 border-t border-zinc-900 pt-4">
                    <Attendees event={ev} reload={loadAdmin} />
                  </div>
                )}
              </div>
            ))}
            {events.length === 0 && (
              <div className="card p-16 text-center text-zinc-600">
                No events yet. Create your first event — no per-ticket fees, ever.
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="grid sm:grid-cols-2 gap-4">
              {publicEvents.map((ev) => (
                <a key={ev.slug} href={`#/e/${ev.slug}`} className="card p-5 hover:border-violet-800 transition-colors">
                  {ev.cover_url && <img src={ev.cover_url} alt="" className="w-full h-32 object-cover rounded-lg mb-3 bg-zinc-900" />}
                  <h2 className="font-semibold text-zinc-100">{ev.title}</h2>
                  <p className="text-sm text-zinc-500 mt-1 flex items-center gap-1.5"><CalendarDays size={13} /> {fmtDate(ev.starts_at)}</p>
                </a>
              ))}
            </div>
            {publicEvents.length === 0 && (
              <div className="card p-16 text-center text-zinc-600">No upcoming events.</div>
            )}
          </div>
        )}
      </main>

      {modal === 'login' && (
        <Modal title="Admin sign in" onClose={() => setModal(null)}>
          <form onSubmit={login} className="space-y-3">
            <input className="input" type="password" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            {err && <p className="text-sm text-red-400">{err}</p>}
            <button className="btn btn-primary w-full justify-center">Sign in</button>
          </form>
        </Modal>
      )}

      {modal === 'event' && (
        <Modal title={editing ? `Edit ${editing.title}` : 'Create event'} onClose={() => setModal(null)} wide>
          <EventForm initial={editing || undefined} onSave={async (form) => {
            if (editing) await api(`/api/events/${editing.id}`, { method: 'PUT', body: form });
            else await api('/api/events', { method: 'POST', body: form });
            setModal(null); loadAdmin();
          }} />
        </Modal>
      )}
    </div>
  );
}
