// Synchronisatie met Supabase (inloggen met e-mailcode, gegevens heen en weer).
import * as store from './store.js';

const cfg = window.MT_CONFIG || {};
const base = String(cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
const key = String(cfg.supabaseAnonKey || '').trim();
const AKEY = 'marathontracker.auth';

export const configured = () => !!(base && key);

let auth = null;
try { auth = JSON.parse(localStorage.getItem(AKEY) || 'null'); } catch (e) { auth = null; }

let state = { code: 'idle', msg: '' };
const subs = new Set();
export function onStatus(f) { subs.add(f); f(state); }
function setState(code, msg = '') { state = { code, msg }; subs.forEach((f) => f(state)); }
export const status = () => state;
export const email = () => (auth && auth.email) || '';
export const loggedIn = () => !!(auth && auth.refresh_token);

function saveAuth(a) {
  auth = a;
  try { if (a) localStorage.setItem(AKEY, JSON.stringify(a)); else localStorage.removeItem(AKEY); } catch (e) { /* */ }
}
function jwtPayload(t) {
  try {
    const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(p))));
  } catch (e) { return {}; }
}
function setSession(j) {
  const p = jwtPayload(j.access_token);
  saveAuth({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: p.exp ? p.exp * 1000 : Date.now() + (Number(j.expires_in) || 3600) * 1000,
    email: (j.user && j.user.email) || p.email || '',
    uid: p.sub
  });
}

async function call(path, { method = 'GET', body, headers = {}, authed = false } = {}) {
  const h = { apikey: key, ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (authed) { await ensureToken(); h.Authorization = 'Bearer ' + auth.access_token; }
  let res;
  try {
    res = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw Object.assign(new Error('Geen verbinding'), { offline: true });
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    const msg = (data && (data.msg || data.message || data.error_description || data.error)) || ('Fout ' + res.status);
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return data;
}

let refreshing = null;
async function ensureToken() {
  if (!auth) throw Object.assign(new Error('Niet ingelogd'), { needLogin: true });
  if (auth.expires_at - Date.now() > 60000) return;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const j = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: auth.refresh_token } });
        setSession(j);
      } catch (e) {
        if (e.status >= 400 && e.status < 500) { saveAuth(null); e.needLogin = true; }
        throw e;
      } finally { refreshing = null; }
    })();
  }
  return refreshing;
}

export async function sendCode(addr) {
  // De link in de mail brengt je terug naar precies deze app.
  const back = encodeURIComponent(location.origin + location.pathname);
  try {
    await call('/auth/v1/otp?redirect_to=' + back, { method: 'POST', body: { email: addr, create_user: false } });
  } catch (e) {
    if (e.status === 429) e.message = 'Er zijn te veel inlogmails verstuurd. Wacht een uur en probeer het dan één keer.';
    else if (e.status === 422 || /signups? not allowed|not found|gesloten/i.test(e.message)) e.message = 'Dit e-mailadres heeft geen toegang.';
    throw e;
  }
}
export async function verifyCode(addr, code) {
  const j = await call('/auth/v1/verify', { method: 'POST', body: { type: 'email', email: addr, token: String(code).replace(/\s/g, '') } });
  setSession(j);
  return sync();
}

// Inloglink uit de e-mail: Supabase stuurt je terug met de sleutels in het adres.
export function handleRedirect() {
  const h = location.hash;
  if (!/access_token=|error_description=/.test(h)) return null;
  const p = new URLSearchParams(h.replace(/^#\/?/, ''));
  history.replaceState(null, '', location.pathname + location.search + '#/meer');
  if (p.get('error_description')) return { error: p.get('error_description').replace(/\+/g, ' ') };
  setSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: p.get('expires_in') });
  return { ok: true };
}

export function logout() { saveAuth(null); setState('login'); }

let running = null, again = false;
export function sync() {
  if (running) { again = true; return running; }
  running = (async () => {
    try { do { again = false; await doSync(); } while (again); }
    finally { running = null; }
  })();
  return running;
}

async function doSync() {
  if (!configured()) return setState('local');
  if (!loggedIn()) return setState('login');
  if (!navigator.onLine) return setState('offline');
  setState('busy');
  try {
    // 1. Ophalen wat er sinds de vorige keer is veranderd.
    let changed = false;
    let since = store.meta().lastPull;
    for (;;) {
      let q = '/rest/v1/entries?select=data,server_ts&order=server_ts.asc&limit=500';
      if (since) q += '&server_ts=gt.' + encodeURIComponent(since);
      const rows = await call(q, { authed: true });
      for (const r of rows) { if (store.mergeRemote(r.data)) changed = true; since = r.server_ts; }
      if (rows.length < 500) break;
    }
    store.setMeta({ lastPull: since });

    // 2. Eigen wijzigingen versturen.
    const dirty = store.dirtyRecords();
    for (let i = 0; i < dirty.length; i += 200) {
      const chunk = dirty.slice(i, i + 200);
      await call('/rest/v1/entries?on_conflict=user_id,id', {
        method: 'POST', authed: true,
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: chunk.map((r) => ({ user_id: auth.uid, id: r.id, kind: r.kind, data: r, updated_at: r.updatedAt, deleted: !!r.deleted }))
      });
      chunk.forEach((r) => store.clearDirty(r.id, r.updatedAt));
    }
    store.setMeta({ lastSync: new Date().toISOString() });
    store.finishSync(changed);
    setState('ok');
  } catch (e) {
    console.warn('Synchroniseren mislukt:', e);
    if (e.needLogin) setState('login', 'Log opnieuw in');
    else if (e.offline) setState('offline');
    else setState('error', e.message);
  }
}
