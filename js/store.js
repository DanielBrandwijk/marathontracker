// Alle gegevens staan eerst op het apparaat zelf (localStorage).
// Elke wijziging krijgt een tijdstempel en wordt gemarkeerd om te synchroniseren.
const KEY = 'marathontracker.v1';
const EPOCH = '1970-01-01T00:00:00.000Z';

let db = load();
const subs = new Set();

function load() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (j && j.records) return { records: j.records, dirty: j.dirty || {}, lastPull: j.lastPull || null, lastSync: j.lastSync || null };
  } catch (e) { /* leeg beginnen */ }
  return { records: {}, dirty: {}, lastPull: null, lastSync: null };
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { console.error(e); alert('Opslaan op dit apparaat is mislukt. Maak via "Meer" een back-up.'); }
}
function emit(source) { subs.forEach((f) => f(source)); }

export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const get = (id) => { const r = db.records[id]; return r && !r.deleted ? r : null; };
export const getRaw = (id) => db.records[id] || null;
export const all = (kind) => Object.values(db.records).filter((r) => r.kind === kind && !r.deleted);
export const allRaw = (kind) => Object.values(db.records).filter((r) => !kind || r.kind === kind);

export function put(rec) {
  const r = { ...rec, updatedAt: new Date().toISOString() };
  db.records[r.id] = r;
  db.dirty[r.id] = true;
  persist(); emit('local');
  return r;
}
export function putMany(recs) {
  const now = new Date().toISOString();
  recs.forEach((rec) => { db.records[rec.id] = { ...rec, updatedAt: now }; db.dirty[rec.id] = true; });
  persist(); emit('local');
}
export function remove(id) { const r = db.records[id]; if (r) put({ ...r, deleted: true }); }

// Standaardgegevens (schema, instellingen): oudste tijdstempel, zodat elke echte wijziging wint.
export function seed(rec) {
  if (!db.records[rec.id]) { db.records[rec.id] = { ...rec, updatedAt: EPOCH }; persist(); }
}

export function mergeRemote(rec) {
  if (!rec || !rec.id) return false;
  const cur = db.records[rec.id];
  if (!cur || (rec.updatedAt || '') > (cur.updatedAt || '')) {
    db.records[rec.id] = rec;
    delete db.dirty[rec.id];
    return true;
  }
  return false;
}
export function mergeBackup(recs) {
  let n = 0;
  recs.forEach((r) => {
    if (!r || !r.id || !r.kind) return;
    const cur = db.records[r.id];
    if (!cur || (r.updatedAt || '') > (cur.updatedAt || '')) { db.records[r.id] = r; db.dirty[r.id] = true; n++; }
  });
  persist(); emit('local');
  return n;
}

export const dirtyRecords = () => Object.keys(db.dirty).map((id) => db.records[id]).filter(Boolean);
export const dirtyCount = () => Object.keys(db.dirty).length;
export function clearDirty(id, updatedAt) { const r = db.records[id]; if (r && r.updatedAt === updatedAt) delete db.dirty[id]; }
export const meta = () => ({ lastPull: db.lastPull, lastSync: db.lastSync });
export function setMeta(m) { Object.assign(db, m); persist(); }
export function finishSync(changed) { persist(); emit(changed ? 'remote' : 'sync'); }
