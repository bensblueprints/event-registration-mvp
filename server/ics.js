// Minimal, spec-correct ICS (RFC 5545) generation — CRLF line endings,
// text escaping, UTC timestamps, 75-octet line folding.

function icsEscape(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsDate(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Fold lines longer than 75 octets per RFC 5545 §3.1. */
function fold(line) {
  const out = [];
  let s = line;
  while (Buffer.byteLength(s, 'utf8') > 75) {
    let i = 75;
    while (Buffer.byteLength(s.slice(0, i), 'utf8') > 75) i--;
    out.push(s.slice(0, i));
    s = ' ' + s.slice(i);
  }
  out.push(s);
  return out.join('\r\n');
}

/**
 * Build an ICS calendar file for an event.
 * @param {object} ev  event row (title, description, location, starts_at, ends_at, slug)
 * @param {string} baseUrl  public URL base for the event link
 */
function eventIcs(ev, baseUrl = '') {
  const uid = `event-${ev.id}-${ev.starts_at}@eventcraft`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Eventcraft//Self-hosted event registration//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(ev.starts_at)}`,
    `DTEND:${icsDate(ev.ends_at || ev.starts_at + 2 * 3600000)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    `DESCRIPTION:${icsEscape(ev.description)}`,
    `LOCATION:${icsEscape(ev.location)}`,
    ...(baseUrl ? [`URL:${baseUrl}/#/e/${ev.slug}`] : []),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { eventIcs, icsEscape, icsDate };
