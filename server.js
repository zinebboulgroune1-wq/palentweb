/* palentweb: website + admin dashboard (visitors, sources, leads, bookings). No dependencies. Node 18+. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TZ = process.env.STATS_TZ || 'Europe/Istanbul';
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
const KEEP_DAYS = +process.env.KEEP_DAYS || 400;
const PUB = path.join(__dirname, 'public');

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) console.warn('[palentweb] ADMIN_EMAIL / ADMIN_PASSWORD are not set: admin login is disabled until you add them in Railway Variables.');
if (!process.env.SESSION_SECRET) console.warn('[palentweb] SESSION_SECRET not set: admins will be logged out on every restart.');
fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------------- storage ---------------- */
const F = { visits: path.join(DATA_DIR, 'visits.ndjson'), leads: path.join(DATA_DIR, 'leads.json'), bookings: path.join(DATA_DIR, 'bookings.json') };
function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return [] } }
function writeJSON(f, v) { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v)); fs.renameSync(tmp, f) }
let visits = [];
try { visits = fs.readFileSync(F.visits, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) } catch {}
const leads = readJSON(F.leads), bookings = readJSON(F.bookings);
(function prune() {
  const cut = Date.now() - KEEP_DAYS * 864e5, before = visits.length;
  visits = visits.filter(v => v.at >= cut);
  if (visits.length !== before) { const tmp = F.visits + '.tmp'; fs.writeFileSync(tmp, visits.map(v => JSON.stringify(v)).join('\n') + (visits.length ? '\n' : '')); fs.renameSync(tmp, F.visits) }
})();
console.log(`[palentweb] data in ${DATA_DIR}: ${visits.length} visits, ${leads.length} leads, ${bookings.length} bookings`);
const saveLeads = () => writeJSON(F.leads, leads), saveBookings = () => writeJSON(F.bookings, bookings);

/* ---------------- helpers ---------------- */
const str = (v, n = 200) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const id = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const ipOf = req => (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '');
const isBot = ua => /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor|curl|wget|python-requests/i.test(ua || '');
function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, Object.assign({ 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy() } else chunks.push(c) });
    req.on('end', () => { const raw = Buffer.concat(chunks).toString('utf8'); if (!raw) return resolve({}); try { resolve(JSON.parse(raw)) } catch { reject(Object.assign(new Error('bad json'), { code: 400 })) } });
    req.on('error', reject);
  });
}
/* simple fixed-window rate limiter */
const RL = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(); let e = RL.get(key);
  if (!e || now > e.reset) { e = { n: 0, reset: now + windowMs }; RL.set(key, e) }
  e.n++; return e.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, e] of RL) if (now > e.reset) RL.delete(k) }, 60e3).unref();

/* ---------------- sessions (signed cookie) ---------------- */
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
function makeSession() { const exp = Date.now() + 12 * 3600e3, v = `${exp}.${crypto.randomBytes(9).toString('base64url')}`; return `${v}.${sign(v)}` }
function cookies(req) { const o = {}; String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()) }); return o }
function authed(req) {
  const c = cookies(req).pw_admin; if (!c) return false;
  const i = c.lastIndexOf('.'), v = c.slice(0, i), s = c.slice(i + 1);
  const good = sign(v); if (s.length !== good.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return false;
  return +v.split('.')[0] > Date.now();
}
const secure = req => (req.headers['x-forwarded-proto'] || '').includes('https');
const eqSafe = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y) };

/* ---------------- traffic source ---------------- */
function sourceOf(ref, utm, host) {
  const u = (utm && (utm.source || '')).toLowerCase(), clid = utm && utm.clid;
  const map = [[/google|gclid/, 'Google'], [/bing/, 'Bing'], [/yahoo/, 'Yahoo'], [/duckduckgo/, 'DuckDuckGo'], [/yandex/, 'Yandex'], [/instagram|^ig$/, 'Instagram'],
    [/facebook|^fb$|fbclid|messenger/, 'Facebook'], [/tiktok|ttclid/, 'TikTok'], [/whatsapp|wa\.me/, 'WhatsApp'], [/snapchat|sc-static/, 'Snapchat'],
    [/twitter|^x$|t\.co$|x\.com/, 'X (Twitter)'], [/linkedin|lnkd/, 'LinkedIn'], [/youtube|youtu\.be/, 'YouTube'], [/telegram|t\.me/, 'Telegram'], [/pinterest/, 'Pinterest'], [/chatgpt|openai|claude|perplexity/, 'AI assistants']];
  for (const s of [u, clid || ''].filter(Boolean)) for (const [re, n] of map) if (re.test(s)) return n;
  let h = ''; try { h = new URL(ref).hostname.replace(/^www\./, '').toLowerCase() } catch {}
  if (!h || (host && h === String(host).replace(/^www\./, '').toLowerCase())) return u ? u.replace(/^./, c => c.toUpperCase()) : 'Direct';
  for (const [re, n] of map) if (re.test(h)) return n;
  return h;
}
const lastSrc = vid => { if (!vid) return ''; for (let i = visits.length - 1; i >= 0; i--) if (visits[i].vid === vid && visits[i].src) return visits[i].src; return '' };
const STATUS_L = ['new', 'contacted', 'won', 'lost'], STATUS_B = ['new', 'confirmed', 'done', 'cancelled'];

/* ---------------- public API ---------------- */
function corsHeaders(req) {
  const o = (req.headers.origin || '').replace(/\/$/, '');
  if (o && ALLOWED.includes(o)) return { 'Access-Control-Allow-Origin': o, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' };
  return {};
}
async function track(req, res) {
  const ip = ipOf(req), ua = str(req.headers['user-agent'], 300);
  if (limited('t:' + ip, 120, 60e3)) return send(res, 429, { ok: false }, corsHeaders(req));
  const b = await readBody(req, 8 * 1024);
  if (isBot(ua)) return send(res, 204, '', corsHeaders(req));
  const t = b.t === 'view' ? 'view' : 'visit', utm = b.utm && typeof b.utm === 'object' ? b.utm : {};
  const v = {
    t, at: Date.now(), vid: str(b.vid, 40), sid: str(b.sid, 40), path: str(b.path, 120) || '/', lang: str(b.lang, 5),
    tz: str(b.tz, 60), country: str(req.headers['cf-ipcountry'] || b.country, 60), device: str(b.device, 20), os: str(b.os, 20), br: str(b.br, 30),
    src: t === 'visit' ? sourceOf(str(b.ref, 300), { source: str(utm.source, 60), clid: str(utm.clid, 20) }, req.headers.host) : undefined,
    ref: t === 'visit' ? str(b.ref, 300) : undefined, camp: t === 'visit' ? str(utm.campaign, 80) || undefined : undefined, newv: t === 'visit' ? !!b.newv : undefined
  };
  visits.push(v); fs.appendFile(F.visits, JSON.stringify(v) + '\n', () => {});
  send(res, 204, '', corsHeaders(req));
}
async function addLead(req, res) {
  const ip = ipOf(req);
  if (limited('l:' + ip, 8, 10 * 60e3)) return send(res, 429, { ok: false, error: 'Too many requests' }, corsHeaders(req));
  const b = await readBody(req);
  if (b.website) return send(res, 200, { ok: true }, corsHeaders(req)); // honeypot
  const name = str(b.name, 80), phone = str(b.phone, 40);
  if (!name || !phone) return send(res, 400, { ok: false, error: 'name and phone are required' }, corsHeaders(req));
  const l = { id: id(), at: Date.now(), status: 'new', note: '', name, phone, email: str(b.email, 120), country: str(b.country, 60), field: str(b.field, 80),
    services: Array.isArray(b.services) ? b.services.slice(0, 12).map(s => str(s, 60)).filter(Boolean) : [], pkg: str(b.pkg, 80), sup: !!b.sup,
    msg: str(b.msg, 2000), lang: str(b.lang, 5), tz: str(b.tz, 60), vid: str(b.vid, 40), src: str(b.src, 60) || lastSrc(str(b.vid, 40)), page: str(b.page, 120) };
  leads.unshift(l); if (leads.length > 5000) leads.length = 5000; saveLeads();
  send(res, 200, { ok: true, id: l.id }, corsHeaders(req));
}
async function addBooking(req, res) {
  const ip = ipOf(req);
  if (limited('b:' + ip, 6, 10 * 60e3)) return send(res, 429, { ok: false, error: 'Too many requests' }, corsHeaders(req));
  const b = await readBody(req);
  if (b.website) return send(res, 200, { ok: true }, corsHeaders(req));
  const name = str(b.name, 80), phone = str(b.phone, 40), date = str(b.date, 10), time = str(b.time, 10);
  if (!name || !phone || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return send(res, 400, { ok: false, error: 'invalid booking' }, corsHeaders(req));
  const k = { id: id(), at: Date.now(), status: 'new', note: '', name, phone, date, time, dateLabel: str(b.dateLabel, 60), tz: str(b.tz, 60), lang: str(b.lang, 5), vid: str(b.vid, 40), src: str(b.src, 60) || lastSrc(str(b.vid, 40)) };
  bookings.unshift(k); if (bookings.length > 5000) bookings.length = 5000; saveBookings();
  send(res, 200, { ok: true, id: k.id }, corsHeaders(req));
}

/* ---------------- stats ---------------- */
const dayKey = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
const hourOf = (ms) => +new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(ms);
function top(arr, key, n = 8) {
  const m = new Map(); arr.forEach(x => { const k = (typeof key === 'function' ? key(x) : x[key]) || '—'; m.set(k, (m.get(k) || 0) + 1) });
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, v }));
}
function stats(days) {
  const now = Date.now(), from = now - days * 864e5, prevFrom = from - days * 864e5;
  const inR = v => v.at >= from, inP = v => v.at >= prevFrom && v.at < from;
  const V = visits.filter(v => v.t === 'visit' && inR(v)), PV = visits.filter(inR), Vp = visits.filter(v => v.t === 'visit' && inP(v));
  const uniq = a => new Set(a.map(v => v.vid || v.sid)).size;
  const L = leads.filter(inR), B = bookings.filter(inR), Lp = leads.filter(inP), Bp = bookings.filter(inP);
  const series = []; for (let i = days - 1; i >= 0; i--) { const k = dayKey(now - i * 864e5); series.push({ d: k, visits: 0, uniq: new Set(), leads: 0, bookings: 0 }) }
  const idx = new Map(series.map((s, i) => [s.d, i]));
  V.forEach(v => { const i = idx.get(dayKey(v.at)); if (i != null) { series[i].visits++; series[i].uniq.add(v.vid || v.sid) } });
  L.forEach(v => { const i = idx.get(dayKey(v.at)); if (i != null) series[i].leads++ }); B.forEach(v => { const i = idx.get(dayKey(v.at)); if (i != null) series[i].bookings++ });
  const hours = Array(24).fill(0); V.forEach(v => hours[hourOf(v.at)]++);
  const active = new Set(visits.filter(v => v.at > now - 5 * 60e3).map(v => v.sid || v.vid)).size;
  const u = uniq(V), up = uniq(Vp);
  return {
    range: days, tz: TZ, active,
    kpi: { visits: V.length, visitsPrev: Vp.length, unique: u, uniquePrev: up, pageviews: PV.length, leads: L.length, leadsPrev: Lp.length, bookings: B.length, bookingsPrev: Bp.length,
      newVisitors: V.filter(v => v.newv).length, conv: u ? +(((L.length + B.length) / u) * 100).toFixed(1) : 0, convPrev: up ? +(((Lp.length + Bp.length) / up) * 100).toFixed(1) : 0,
      pagesPerVisit: V.length ? +(PV.length / V.length).toFixed(1) : 0 },
    series: series.map(s => ({ d: s.d, visits: s.visits, unique: s.uniq.size, leads: s.leads, bookings: s.bookings })),
    sources: top(V, 'src', 10), countries: top(V, 'country', 10), devices: top(V, 'device', 5), os: top(V, 'os', 6), browsers: top(V, 'br', 6),
    pages: top(PV, 'path', 8), langs: top(V, 'lang', 4), campaigns: top(V.filter(v => v.camp), 'camp', 6), hours,
    leadSources: top(L, 'src', 8),
    latest: { leads: leads.slice(0, 5), bookings: bookings.filter(b => b.status !== 'cancelled').slice(0, 5) },
    pending: { leads: leads.filter(l => l.status === 'new').length, bookings: bookings.filter(b => b.status === 'new').length }
  };
}
const csvCell = v => { let s = Array.isArray(v) ? v.join(' | ') : v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"' };
function toCSV(rows, cols) { return '﻿' + cols.join(',') + '\n' + rows.map(r => cols.map(c => csvCell(c === 'at' ? new Date(r.at).toISOString() : r[c])).join(',')).join('\n') }

/* ---------------- admin API ---------------- */
async function admin(req, res, url) {
  const p = url.pathname;
  if (p === '/api/admin/login' && req.method === 'POST') {
    const ip = ipOf(req);
    if (limited('login:' + ip, 6, 15 * 60e3)) return send(res, 429, { ok: false, error: 'locked' });
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return send(res, 503, { ok: false, error: 'not_configured' });
    const b = await readBody(req, 4096);
    const ok = eqSafe(str(b.email, 200).toLowerCase(), ADMIN_EMAIL) & eqSafe(String(b.password || ''), ADMIN_PASSWORD);
    if (!ok) { await new Promise(r => setTimeout(r, 600)); return send(res, 401, { ok: false, error: 'invalid' }) }
    return send(res, 200, { ok: true }, { 'Set-Cookie': `pw_admin=${makeSession()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure(req) ? '; Secure' : ''}` });
  }
  if (p === '/api/admin/logout' && req.method === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': `pw_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure(req) ? '; Secure' : ''}` });
  if (!authed(req)) return send(res, 401, { ok: false, error: 'auth' });
  if (req.method !== 'GET' && (req.headers['x-pw'] !== '1')) return send(res, 403, { ok: false });   // CSRF guard: custom header only same-origin JS can send
  if (p === '/api/admin/me') return send(res, 200, { ok: true, email: ADMIN_EMAIL });
  if (p === '/api/admin/stats') return send(res, 200, stats(Math.min(365, Math.max(1, +url.searchParams.get('days') || 30))));
  if (p === '/api/admin/leads' && req.method === 'GET') return send(res, 200, { items: leads });
  if (p === '/api/admin/bookings' && req.method === 'GET') return send(res, 200, { items: bookings });
  if (p === '/api/admin/export/leads.csv') return send(res, 200, toCSV(leads, ['at', 'status', 'name', 'phone', 'email', 'country', 'field', 'services', 'pkg', 'msg', 'src', 'note']), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="palentweb-leads.csv"' });
  if (p === '/api/admin/export/bookings.csv') return send(res, 200, toCSV(bookings, ['at', 'status', 'date', 'time', 'tz', 'name', 'phone', 'src', 'note']), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="palentweb-bookings.csv"' });
  const m = p.match(/^\/api\/admin\/(leads|bookings)\/([a-z0-9]+)$/);
  if (m) {
    const list = m[1] === 'leads' ? leads : bookings, save = m[1] === 'leads' ? saveLeads : saveBookings, allowed = m[1] === 'leads' ? STATUS_L : STATUS_B;
    const i = list.findIndex(x => x.id === m[2]); if (i < 0) return send(res, 404, { ok: false });
    if (req.method === 'PATCH') { const b = await readBody(req, 8192); if (b.status && allowed.includes(b.status)) list[i].status = b.status; if (typeof b.note === 'string') list[i].note = str(b.note, 1000); list[i].upd = Date.now(); save(); return send(res, 200, { ok: true, item: list[i] }) }
    if (req.method === 'DELETE') { list.splice(i, 1); save(); return send(res, 200, { ok: true }) }
  }
  return send(res, 404, { ok: false });
}

/* ---------------- static ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const BASE_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
function serveFile(req, res, file, extra = {}) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', BASE_HEADERS);
    const ext = path.extname(file).toLowerCase(), etag = `"${st.size}-${st.mtimeMs | 0}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, Object.assign({ ETag: etag }, BASE_HEADERS)); return res.end() }
    const h = Object.assign({ 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, ETag: etag, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' }, BASE_HEADERS, extra);
    res.writeHead(200, h); if (req.method === 'HEAD') return res.end(); fs.createReadStream(file).pipe(res);
  });
}

/* ---------------- router ---------------- */
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname;
  try {
    if (req.method === 'OPTIONS' && p.startsWith('/api/')) { res.writeHead(204, corsHeaders(req)); return res.end() }
    if (p === '/api/health') return send(res, 200, { ok: true, admin: !!(ADMIN_EMAIL && ADMIN_PASSWORD) }, corsHeaders(req));
    if (p === '/api/track' && req.method === 'POST') return await track(req, res);
    if (p === '/api/lead' && req.method === 'POST') return await addLead(req, res);
    if (p === '/api/booking' && req.method === 'POST') return await addBooking(req, res);
    if (p.startsWith('/api/admin/')) return await admin(req, res, url);
    if (p.startsWith('/api/')) return send(res, 404, { ok: false });
    if (p === '/admin' || p === '/admin/') return serveFile(req, res, path.join(__dirname, 'admin', 'admin.html'), { 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    let rel = decodeURIComponent(p); if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(PUB, rel));
    if (!file.startsWith(PUB + path.sep)) return send(res, 403, 'Forbidden');
    if (!path.extname(file) && !fs.existsSync(file)) return serveFile(req, res, path.join(PUB, 'index.html'));
    return serveFile(req, res, file);
  } catch (e) {
    const code = e && e.code && Number.isInteger(e.code) ? e.code : 500;
    if (code === 500) console.error(e);
    if (!res.headersSent) send(res, code, { ok: false });
  }
}).listen(PORT, () => console.log(`[palentweb] listening on :${PORT}`));
