import * as store from './store.js';
import * as sync from './sync.js';
import * as plan from './plan.js';
import { predict } from './predict.js';
import * as charts from './charts.js';
import { parseGarmin, buildImport, TYPES } from './garmin.js';
import {
  todayISO, addDays, fromISO, daysBetween, fmtDate, fmtDateLong, fmtNL, fmtDur, fmtPace, fmtKm,
  esc, uid, downloadFile, toCSV, parseNum, MAANDEN
} from './util.js';

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const OWNER_DEFAULT = 'Daniël Brandwijk';
const FEEL = ['', 'Zwaar', 'Matig', 'Oké', 'Goed', 'Top'];
const CAT = { run: 'Hardlopen', gym: 'Sportschool', other: 'Overig' };
const MARA = 42.195;

const ICON = {
  run: '<svg viewBox="0 0 24 24"><circle cx="14" cy="4.5" r="2"/><path d="M6 21l3.5-6 3 2.5V22M8 11l2-4 4 1 2 4 3 1M10 7l-3 4H4"/></svg>',
  gym: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/></svg>',
  other: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>'
};

// ---------- basis ----------
const S = () => store.get('settings') || {};
const owner = () => S().owner || OWNER_DEFAULT;
const acts = () => store.all('act').sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
const goalSec = () => S().goalSec || 4 * 3600;

function ensureSeeds() {
  store.seed({ id: 'settings', kind: 'settings', owner: OWNER_DEFAULT, maxHr: 174, restHr: 42, goalSec: 4 * 3600 });
  store.seed({
    id: 'seed-hm-2026-10-11', kind: 'act', date: '2026-10-11', time: '', category: 'run', type: 'Wedstrijd',
    distanceKm: 21.14, durationSec: 8626, avgHr: null, feel: null, note: 'Eerste halve marathon – startpunt', source: 'handmatig'
  });
  plan.defaultWeeks().forEach((w) => store.seed(w));
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2800);
}

function weekRange(start) {
  const a = fromISO(start), b = fromISO(addDays(start, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MAANDEN[b.getMonth()]}`
    : `${a.getDate()} ${MAANDEN[a.getMonth()]} – ${b.getDate()} ${MAANDEN[b.getMonth()]}`;
}
const shortDate = (s) => { const d = fromISO(s); return d.getDate() + ' ' + MAANDEN[d.getMonth()]; };
const badge = (ev) => `<span class="badge b-${ev.code}">${ev.icon ? `<span aria-hidden="true">${ev.icon}</span>` : ''}${esc(ev.label)}</span>`;
function ratioCode(r, finished) { if (!finished) return r >= 1 ? 'good' : 'now'; return r >= 0.9 ? 'good' : r >= 0.7 ? 'warn' : 'bad'; }
function meter(label, done, tgt, unit, code) {
  const pct = tgt > 0 ? Math.min(100, (done / tgt) * 100) : (done > 0 ? 100 : 0);
  return `<div class="meter"><div class="meter-top"><span>${label}</span><span class="meter-val"><strong>${typeof done === 'number' && unit === 'km' ? fmtKm(done) : done}</strong> / ${unit === 'km' ? fmtKm(tgt) : tgt} ${unit}</span></div>` +
    `<div class="track" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="${label}"><div class="fill fill-${code}" style="width:${pct}%"></div></div></div>`;
}

// ---------- onderblad ----------
let sheetOpen = false;
function openSheet(html, mount) {
  const sh = $('#sheet');
  sh.innerHTML = html;
  $('#sheetWrap').hidden = false;
  document.body.classList.add('noscroll');
  sheetOpen = true;
  history.pushState({ sheet: true }, '');
  if (mount) mount(sh);
  const h = sh.querySelector('h2');
  if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
function closeSheet(fromPop) {
  if (!sheetOpen) return;
  $('#sheetWrap').hidden = true;
  $('#sheet').innerHTML = '';
  document.body.classList.remove('noscroll');
  sheetOpen = false;
  if (!fromPop && history.state && history.state.sheet) history.back();
}
window.addEventListener('popstate', () => { if (sheetOpen) closeSheet(true); });
$('#sheetWrap').addEventListener('click', (e) => {
  if (e.target.id === 'sheetWrap' || e.target.closest('[data-close]')) closeSheet();
});

// ---------- router ----------
let current = '';
const routes = { '': renderHome, trainingen: renderActs, schema: renderSchema, voortgang: renderProgress, meer: renderMore };
function route() {
  const [name, sub] = location.hash.replace(/^#\/?/, '').split('/');
  const changed = name !== current;
  current = routes[name] ? name : '';
  (routes[current])(sub);
  document.querySelectorAll('.tabbar a').forEach((a) => {
    const on = a.dataset.tab === current;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (changed && !sub) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
function safeRerender() {
  const ae = document.activeElement;
  if (sheetOpen || (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) return;
  const y = window.scrollY;
  route();
  window.scrollTo(0, y);
}

// ---------- Overzicht ----------
function countCard(race, today, all, cls) {
  const d = daysBetween(today, race.date);
  let big, sub;
  if (d > 0) { big = d; sub = `dagen · ${Math.floor(d / 7)} wk en ${d % 7} d`; }
  else if (d === 0) { big = 'Vandaag'; sub = 'Succes!'; }
  else {
    const res = all.find((a) => a.date === race.date && a.category === 'run' && a.distanceKm >= 40);
    big = res ? fmtDur(res.durationSec) : '✓';
    sub = res ? 'Gelopen!' : 'Voorbij';
  }
  return `<section class="card count ${cls}"><div class="count-name">${esc(race.name)}</div><div class="count-date">${esc(fmtDateLong(race.date))}</div>` +
    `<div class="count-big">${big}</div><div class="count-sub">${sub}</div></section>`;
}

function weekCardHtml(w, all, today) {
  const weeks = plan.weeks();
  const idx = weeks.findIndex((x) => x.id === w.id) + 1;
  const list = plan.actsInWeek(all, w.start);
  const st = plan.stats(list);
  const ev = plan.evaluate(w, st, today);
  const t = plan.target(w);
  const fin = today > plan.weekEnd(w);
  const days = plan.dayPlan(w, S(), list);
  return `<section class="card">
    <div class="card-head"><div><h2>Deze week</h2><div class="muted">Week ${idx} van ${weeks.length} · ${weekRange(w.start)}</div></div>${badge(ev)}</div>
    <p class="focus">${esc(w.focus || '')}</p>
    ${meter('Kilometers', st.km, t, 'km', ratioCode(t ? st.km / t : 1, fin))}
    ${meter('Lange loop', st.longest, w.lang, 'km', ratioCode(w.lang ? st.longest / w.lang : 1, fin))}
    ${meter('Sportschool', st.gymDays, w.gym, 'keer', ratioCode(w.gym ? st.gymDays / w.gym : 1, fin))}
    ${daysHtml(days)}
  </section>`;
}
function daysHtml(days) {
  return `<ul class="days">${days.map((r) => `<li><span class="d${r.done ? ' ok' : ''}">${r.d}</span><span${r.race ? ' class="week-race"' : ''}>${esc(r.t)}${r.hr ? `<small>${esc(r.hr)}</small>` : ''}</span></li>`).join('')}</ul>`;
}

function predCardHtml(pred) {
  if (!pred.time) {
    return `<section class="card"><h2>Voorspelde marathontijd</h2><p class="muted">Nog geen voorspelling. Voeg een wedstrijd of een lange loop (18 km of meer, met hartslag) toe.</p></section>`;
  }
  const g = goalSec();
  const diff = pred.time - g;
  const code = diff <= 0 ? 'good' : diff <= 600 ? 'warn' : 'bad';
  const label = diff <= 0 ? `${fmtDur(-diff)} onder doel` : `${fmtDur(diff)} boven doel`;
  return `<section class="card">
    <h2>Voorspelde marathontijd</h2>
    <div class="pred-row"><div class="pred-big">${fmtDur(pred.time)}</div>
      <div class="pred-goal">Doel <strong>${fmtDur(g)}</strong><br>${badge({ code, icon: diff <= 0 ? '✓' : '!', label })}</div></div>
    <p class="muted">Voorspeld tempo ${fmtPace(pred.time / MARA)}/km · nodig ${fmtPace(g / MARA)}/km</p>
    <a class="link" href="#/voortgang/voorspelling">Waarop is dit gebaseerd? →</a>
  </section>`;
}

function renderHome() {
  const today = todayISO(), all = acts(), weeks = plan.weeks();
  const cur = weeks.find((w) => today >= w.start && today <= plan.weekEnd(w));
  let html = `<div class="count-grid">${countCard(plan.MARATHON, today, all, 'main')}${countCard(plan.ROTTERDAM, today, all, 'second')}</div>`;
  if (cur) html += weekCardHtml(cur, all, today);
  else if (weeks.length && today < weeks[0].start) html += `<section class="card"><h2>Schema begint ${esc(fmtDateLong(weeks[0].start))}</h2></section>`;
  else html += `<section class="card"><h2>Schema afgerond</h2><p>Alle weken zijn voorbij. Bekijk je resultaten bij Voortgang.</p></section>`;
  html += predCardHtml(predict(all, S(), today));
  html += `<div class="btn-row">
    <button class="btn btn-accent btn-big" data-act="add">${ICON.plus}Training toevoegen</button>
    <button class="btn btn-secondary btn-big" data-act="import">${ICON.upload}Garmin importeren</button></div>`;
  html += `<section class="card"><div class="card-head"><h2>Laatste trainingen</h2><a class="link" href="#/trainingen">Alles →</a></div>${actList(all.slice(0, 5))}</section>`;
  view.innerHTML = html;
}

// ---------- Trainingen ----------
function actList(list) {
  if (!list.length) return '<p class="empty">Nog geen trainingen.</p>';
  return `<ul class="acts">${list.map((a) => {
    const pace = a.distanceKm && a.durationSec ? fmtPace(a.durationSec / a.distanceKm) + '/km' : '';
    const num = a.distanceKm
      ? `<strong>${fmtKm(a.distanceKm, 2)} km</strong><small>${fmtDur(a.durationSec)}${pace ? ' · ' + pace : ''}</small>`
      : `<strong>${a.durationSec ? Math.round(a.durationSec / 60) + ' min' : '–'}</strong><small>${a.avgHr ? 'hartslag ' + Math.round(a.avgHr) : ''}</small>`;
    const sub = [fmtDate(a.date) + (a.time ? ' ' + a.time : ''), a.category === 'run' && a.avgHr ? '♥ ' + Math.round(a.avgHr) : '', a.feel ? FEEL[a.feel] : '']
      .filter(Boolean).join(' · ');
    return `<li><button class="act" data-act="edit-act" data-id="${esc(a.id)}">
      <span class="act-ico cat-${a.category}" aria-hidden="true">${ICON[a.category] || ICON.other}</span>
      <span class="act-main"><span class="act-title">${esc(a.type)}${a.indoor ? ' (loopband)' : ''}</span><span class="act-sub">${esc(sub)}</span></span>
      <span class="act-num">${num}</span></button></li>`;
  }).join('')}</ul>`;
}

let actFilter = 'all';
function renderActs() {
  const all = acts().filter((a) => actFilter === 'all' || a.category === actFilter);
  const groups = new Map();
  for (const a of all) {
    const d = fromISO(a.date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  const chip = (v, l) => `<button class="chip" data-act="filter" data-v="${v}" aria-pressed="${actFilter === v}">${l}</button>`;
  let html = `<h1>Trainingen</h1><div class="chips" role="group" aria-label="Filter">${chip('all', 'Alles')}${chip('run', 'Hardlopen')}${chip('gym', 'Sportschool')}${chip('other', 'Overig')}</div>`;
  if (!groups.size) html += '<section class="card"><p class="empty">Nog geen trainingen. Voeg er een toe of importeer uit Garmin.</p></section>';
  for (const [k, list] of groups) {
    const st = plan.stats(list);
    const bits = [];
    if (st.km) bits.push(fmtKm(st.km) + ' km');
    if (st.gymDays) bits.push(st.gymDays + '× sportschool');
    html += `<section class="card"><div class="group-head"><h2>Week van ${shortDate(k)}</h2><span class="muted">${bits.join(' · ')}</span></div>${actList(list)}</section>`;
  }
  html += `<button class="btn btn-accent fab" data-act="add" aria-label="Training toevoegen">${ICON.plus}Toevoegen</button>`;
  view.innerHTML = html;
}

function openActForm(id) {
  const src = id ? store.get(id) : null;
  const a = src || { date: todayISO(), category: 'run', type: 'Rustige duurloop', distanceKm: null, durationSec: null, avgHr: null, feel: null, note: '' };
  const d = a.durationSec || 0;
  const h = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60), s = Math.round(d % 60);
  openSheet(`<h2>${src ? 'Training aanpassen' : 'Training toevoegen'}</h2>
  <form id="actForm" novalidate>
    <label class="field"><span>Datum</span><input type="date" name="date" value="${esc(a.date)}" required></label>
    <fieldset class="field"><legend>Soort</legend><div class="seg">${['run', 'gym', 'other'].map((c) =>
      `<label><input type="radio" name="category" value="${c}" ${a.category === c ? 'checked' : ''}><span>${CAT[c]}</span></label>`).join('')}</div></fieldset>
    <label class="field"><span>Type training</span><select name="type"></select></label>
    <label class="field f-dist"><span>Afstand (km)</span><input name="dist" inputmode="decimal" autocomplete="off" placeholder="bijv. 10,5" value="${a.distanceKm != null ? String(a.distanceKm).replace('.', ',') : ''}"></label>
    <fieldset class="field"><legend>Tijd</legend><div class="dur">
      <label><input name="h" inputmode="numeric" autocomplete="off" value="${d ? h : ''}" placeholder="0" aria-label="uren"><small>uur</small></label>
      <label><input name="m" inputmode="numeric" autocomplete="off" value="${d ? m : ''}" placeholder="0" aria-label="minuten"><small>min</small></label>
      <label><input name="s" inputmode="numeric" autocomplete="off" value="${d ? s : ''}" placeholder="0" aria-label="seconden"><small>sec</small></label></div></fieldset>
    <div class="calc muted" id="calc" aria-live="polite"></div>
    <label class="field"><span>Gemiddelde hartslag (optioneel)</span><input name="hr" inputmode="numeric" autocomplete="off" value="${a.avgHr != null ? Math.round(a.avgHr) : ''}" placeholder="bijv. 140"></label>
    <fieldset class="field"><legend>Gevoel</legend><div class="feel">${[1, 2, 3, 4, 5].map((n) =>
      `<label><input type="radio" name="feel" value="${n}" ${a.feel == n ? 'checked' : ''}><span><b>${n}</b><small>${FEEL[n]}</small></span></label>`).join('')}</div></fieldset>
    <label class="field"><span>Notitie</span><textarea name="note" rows="3">${esc(a.note || '')}</textarea></label>
    ${a.source === 'garmin' ? '<p class="hint">Geïmporteerd uit Garmin. Je kunt alles aanpassen; bij een volgende import wordt deze training niet dubbel toegevoegd.</p>' : ''}
    <p class="form-error" id="formErr" hidden></p>
    <div class="sheet-actions">
      <button class="btn btn-primary btn-big" type="submit">Opslaan</button>
      ${src ? '<button class="btn btn-danger" type="button" id="delAct">Verwijderen</button>' : ''}
      <button class="btn btn-ghost" type="button" data-close>Annuleren</button>
    </div>
  </form>`, (sh) => {
    const f = $('#actForm', sh), E = f.elements;
    const fillTypes = () => {
      const cat = E.category.value;
      let list = TYPES[cat].slice();
      if (a.category === cat && a.type && !list.includes(a.type)) list.unshift(a.type);
      const cur = E.type.value;
      E.type.innerHTML = list.map((t) => `<option>${esc(t)}</option>`).join('');
      E.type.value = list.includes(cur) ? cur : (a.category === cat && list.includes(a.type) ? a.type : list[0]);
      $('.f-dist', sh).hidden = cat === 'gym';
      calc();
    };
    const dur = () => (parseNum(E.h.value) || 0) * 3600 + (parseNum(E.m.value) || 0) * 60 + (parseNum(E.s.value) || 0);
    const calc = () => {
      const km = parseNum(E.dist.value), t = dur();
      $('#calc', sh).textContent = E.category.value !== 'gym' && km > 0 && t > 0 ? `Tempo ${fmtPace(t / km)} per km` : '';
    };
    fillTypes();
    f.addEventListener('change', (e) => { if (e.target.name === 'category') fillTypes(); });
    f.addEventListener('input', calc);
    // Gevoel nog een keer aantikken = leegmaken
    sh.querySelectorAll('.feel input').forEach((r) => r.addEventListener('click', () => {
      if (r.dataset.was === '1') { r.checked = false; r.dataset.was = ''; }
      else { sh.querySelectorAll('.feel input').forEach((x) => { x.dataset.was = ''; }); r.dataset.was = '1'; }
    }));
    sh.querySelectorAll('.feel input:checked').forEach((r) => { r.dataset.was = '1'; });

    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = (msg) => { const p = $('#formErr', sh); p.textContent = msg; p.hidden = false; p.scrollIntoView({ block: 'center' }); };
      const cat = E.category.value;
      const km = cat === 'gym' ? null : parseNum(E.dist.value);
      const t = dur();
      const hr = parseNum(E.hr.value);
      if (!E.date.value) return err('Vul een datum in.');
      if (cat === 'run' && !(km > 0)) return err('Vul de afstand in.');
      if (!(t > 0)) return err('Vul de tijd in.');
      if (hr != null && (hr < 40 || hr > 230)) return err('De hartslag lijkt niet te kloppen.');
      const feel = E.feel.value ? Number(E.feel.value) : null;
      store.put({
        ...(src || {}), id: src ? src.id : uid(), kind: 'act', date: E.date.value, time: src ? src.time || '' : '',
        category: cat, type: E.type.value, distanceKm: km, durationSec: Math.round(t), avgHr: hr,
        feel, note: E.note.value.trim(), source: src ? src.source : 'handmatig'
      });
      closeSheet(); toast('Opgeslagen'); route();
    });
    const del = $('#delAct', sh);
    if (del) del.addEventListener('click', () => {
      if (!confirm('Deze training verwijderen?')) return;
      store.remove(src.id); closeSheet(); toast('Verwijderd'); route();
    });
  });
}

// ---------- Garmin-import ----------
function openImport() {
  openSheet(`<h2>Importeren uit Garmin</h2>
    <ol class="steps">
      <li>Open <strong>connect.garmin.com</strong> in een browser (op de computer gaat dit het makkelijkst).</li>
      <li>Ga naar <strong>Activiteiten → Alle activiteiten</strong> en scrol naar beneden tot alles geladen is.</li>
      <li>Klik rechtsboven op <strong>Exporteer CSV</strong>.</li>
      <li>Kies hieronder dat bestand.</li>
    </ol>
    <label class="btn btn-primary btn-big filebtn">${ICON.upload}Kies CSV-bestand<input type="file" id="impFile" accept=".csv,text/csv,text/comma-separated-values,application/vnd.ms-excel"></label>
    <label class="check"><input type="checkbox" id="impOther"> Ook wandelen, fietsen en andere sporten importeren</label>
    <div id="impResult" aria-live="polite"></div>
    <div class="sheet-actions"><button class="btn btn-ghost" type="button" data-close>Sluiten</button></div>`, (sh) => {
    let parsed = null;
    const show = () => {
      const box = $('#impResult', sh);
      if (!parsed) { box.innerHTML = ''; return; }
      const r = buildImport(parsed, store.allRaw('act'), $('#impOther', sh).checked);
      const runs = r.add.filter((x) => x.category === 'run').length;
      const gyms = r.add.filter((x) => x.category === 'gym').length;
      const others = r.add.length - runs - gyms;
      box.innerHTML = `<div class="summary">
        <div><span>Nieuw</span><strong>${r.add.length}</strong></div>
        <div><span>· hardlopen / sportschool${others ? ' / overig' : ''}</span><span>${runs} / ${gyms}${others ? ' / ' + others : ''}</span></div>
        <div><span>Al aanwezig, overgeslagen</span><strong>${r.dups.length}</strong></div>
        <div><span>Wandelen, fietsen e.d. (niet gekozen)</span><strong>${r.skipped.length}</strong></div>
        ${r.bad ? `<div><span>Regels die niet te lezen waren</span><strong>${r.bad}</strong></div>` : ''}
      </div>
      ${r.add.length ? `<details class="table"><summary>Bekijk de nieuwe trainingen</summary><div class="tbl-wrap"><table><thead><tr><th>Datum</th><th>Type</th><th class="num">km</th><th class="num">Tijd</th></tr></thead><tbody>
        ${r.add.map((x) => `<tr><td>${fmtDate(x.date)} ${x.time}</td><td>${esc(x.type)}</td><td class="num">${x.distanceKm ? fmtKm(x.distanceKm, 2) : ''}</td><td class="num">${fmtDur(x.durationSec)}</td></tr>`).join('')}
        </tbody></table></div></details>
        <div class="sheet-actions"><button class="btn btn-accent btn-big" type="button" id="impGo">${r.add.length} training${r.add.length === 1 ? '' : 'en'} importeren</button></div>`
        : '<p class="hint">Er zijn geen nieuwe trainingen in dit bestand.</p>'}`;
      const go = $('#impGo', sh);
      if (go) go.addEventListener('click', () => {
        store.putMany(r.add.map((x) => ({
          id: uid(), kind: 'act', date: x.date, time: x.time, category: x.category, type: x.type,
          distanceKm: x.distanceKm, durationSec: x.durationSec, avgHr: x.avgHr, maxHr: x.maxHr, ascent: x.ascent,
          indoor: x.indoor, feel: null, note: '', source: 'garmin', garminKey: x.garminKey, garminType: x.garminType
        })));
        closeSheet(); toast(`${r.add.length} trainingen geïmporteerd`); route();
      });
    };
    $('#impFile', sh).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { parsed = parseGarmin(await file.text()); show(); }
      catch (err) { parsed = null; $('#impResult', sh).innerHTML = `<p class="form-error">${esc(err.message)}</p>`; }
    });
    $('#impOther', sh).addEventListener('change', show);
  });
}

// ---------- Schema ----------
const openWeeks = new Set();
function renderSchema() {
  const today = todayISO(), all = acts(), weeks = plan.weeks();
  let html = `<h1>Schema</h1>
    <p class="lead">${weeks.length} weken tot en met Rotterdam. Tik op een week voor de dagen, je trainingen en om de week aan te passen.</p>
    <div class="legend">${badge({ code: 'good', icon: '✓', label: 'Op koers' })}${badge({ code: 'warn', icon: '!', label: 'Bijna' })}${badge({ code: 'bad', icon: '✕', label: 'Achter' })}${badge({ code: 'pause', icon: '–', label: 'Ziek / gemist' })}</div>`;
  weeks.forEach((w, i) => {
    const list = plan.actsInWeek(all, w.start);
    const st = plan.stats(list);
    const ev = plan.evaluate(w, st, today);
    const t = plan.target(w);
    const fin = today > plan.weekEnd(w);
    const race = plan.raceIn(w);
    const isOpen = openWeeks.has(w.id) || (ev.code === 'now' && !openWeeks.has('closed-' + w.id));
    const show = ev.code !== 'future' && ev.code !== 'pause';
    html += `<article class="card week st-${ev.code}" id="${w.id}">
      <button class="week-head" data-act="toggle-week" data-id="${w.id}" aria-expanded="${isOpen}">
        <span><strong>Week ${i + 1}</strong> <span class="muted">${weekRange(w.start)}</span>${race ? `<span class="week-race">${esc(race.name)} · ${race.short}</span>` : ''}</span>${badge(ev)}
      </button>
      <p class="focus">${esc(w.focus || '')}</p>
      ${show
        ? meter('Kilometers', st.km, t, 'km', ratioCode(t ? st.km / t : 1, fin)) +
          meter(race ? 'Wedstrijd' : 'Lange loop', st.longest, w.lang, 'km', ratioCode(w.lang ? st.longest / w.lang : 1, fin)) +
          meter('Sportschool', st.gymDays, w.gym, 'keer', ratioCode(w.gym ? st.gymDays / w.gym : 1, fin))
        : `<p class="muted">Gepland: ${fmtKm(t)} km · lange loop ${fmtKm(w.lang)} km · sportschool ${w.gym}×</p>`}
      <div class="week-detail" ${isOpen ? '' : 'hidden'}>
        ${daysHtml(plan.dayPlan(w, S(), list))}
        <h3>Trainingen deze week</h3>${actList(list)}
        ${st.gymMin ? `<p class="muted">Sportschool totaal: ${st.gymMin} minuten</p>` : ''}
        <button class="btn btn-secondary" data-act="edit-week" data-id="${w.id}">Week aanpassen</button>
      </div>
    </article>`;
  });
  view.innerHTML = html;
  if (!renderSchema.scrolled) {
    renderSchema.scrolled = true;
    const cur = view.querySelector('.st-now');
    if (cur) setTimeout(() => cur.scrollIntoView({ block: 'start' }), 0);
  }
}

function openWeekForm(id) {
  const w = store.get(id);
  if (!w) return;
  const weeks = plan.weeks();
  const i = weeks.findIndex((x) => x.id === id);
  const prev = weeks[i - 1];
  const def = plan.defaultFor(w.start);
  const num = (n, v, l) => `<label class="field"><span>${l}</span><input name="${n}" inputmode="decimal" autocomplete="off" value="${String(v ?? 0).replace('.', ',')}"></label>`;
  openSheet(`<h2>Week ${i + 1} aanpassen</h2>
    <p class="muted">${weekRange(w.start)}</p>
    <form id="weekForm" novalidate>
      <fieldset class="field"><legend>Status</legend><div class="seg" style="--n:4">${Object.entries(plan.STATUS).map(([k, l]) =>
        `<label><input type="radio" name="status" value="${k}" ${(w.status || 'normaal') === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>
      <div class="grid2">
        ${num('ma', w.ma, 'Maandag (km)')}${num('wo', w.wo, 'Woensdag interval (km)')}
        ${num('dov', w.dov, 'Do/vr (km)')}${num('lang', w.lang, plan.raceIn(w) ? 'Wedstrijd (km)' : 'Lange loop (km)')}
      </div>
      <label class="field"><span>Sportschool (aantal keer)</span><input name="gym" inputmode="numeric" autocomplete="off" value="${w.gym ?? 0}"></label>
      <label class="field"><span>Focus van de week</span><input type="text" name="focus" value="${esc(w.focus || '')}"></label>
      <p class="muted" id="wkTotal"></p>
      <div class="inline-btns">
        ${prev ? '<button class="btn btn-secondary" type="button" id="wkPrev">Neem vorige week over</button>' : ''}
        ${def ? '<button class="btn btn-secondary" type="button" id="wkDef">Terug naar voorstel</button>' : ''}
      </div>
      <p class="hint">Ziek geweest of een week gemist? Zet die week op <b>Ziek</b> of <b>Gemist</b>; hij telt dan niet mee in de beoordeling.
        Bouw daarna rustig weer op: neem in de week erna de doelen over van een week vóór de uitval (één week korter of lichter is beter dan inhalen).</p>
      <div class="sheet-actions"><button class="btn btn-primary btn-big" type="submit">Opslaan</button><button class="btn btn-ghost" type="button" data-close>Annuleren</button></div>
    </form>`, (sh) => {
    const f = $('#weekForm', sh), E = f.elements;
    const total = () => { $('#wkTotal', sh).textContent = 'Totaal gepland: ' + fmtKm(['ma', 'wo', 'dov', 'lang'].reduce((s, k) => s + (parseNum(E[k].value) || 0), 0)) + ' km'; };
    const fill = (src) => { ['ma', 'wo', 'dov', 'lang'].forEach((k) => { E[k].value = String(src[k]).replace('.', ','); }); E.gym.value = src.gym; E.focus.value = src.focus || ''; total(); };
    total();
    f.addEventListener('input', total);
    const bp = $('#wkPrev', sh); if (bp) bp.addEventListener('click', () => fill(prev));
    const bd = $('#wkDef', sh); if (bd) bd.addEventListener('click', () => fill(def));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = (k) => Math.max(0, parseNum(E[k].value) || 0);
      store.put({ ...w, status: E.status.value, ma: v('ma'), wo: v('wo'), dov: v('dov'), lang: v('lang'), gym: Math.round(v('gym')), focus: E.focus.value.trim() });
      closeSheet(); toast('Week opgeslagen'); route();
    });
  });
}

// ---------- Voortgang ----------
// Grafieken beginnen eind augustus; weken vóór het schema hebben geen planning.
const HISTORY_START = '2026-08-24';
function weekSeries(all, today) {
  const planned = plan.weeks();
  const first = planned.length ? planned[0].start : plan.PLAN_START;
  const hist = [];
  for (let d = HISTORY_START; d < first; d = addDays(d, 7)) hist.push({ id: 'hist-' + d, start: d, lang: 0, gym: 0, history: true });
  let n = 0;
  return hist.concat(planned).map((w, i) => {
    const list = plan.actsInWeek(all, w.start);
    const st = plan.stats(list);
    const easy = list.filter((a) => a.category === 'run' && a.distanceKm && a.durationSec && !['Interval', 'Wedstrijd', 'Tempoloop'].includes(a.type));
    const eKm = easy.reduce((s, a) => s + a.distanceKm, 0), eSec = easy.reduce((s, a) => s + a.durationSec, 0);
    const name = w.history ? 'Voor het schema' : 'Week ' + (++n);
    return { w, i, name, st, past: w.start <= today, current: today >= w.start && today <= plan.weekEnd(w), pace: eKm ? eSec / eKm : null };
  });
}
const planLine = (x, v) => (x.w.history ? '' : `\nGepland: ${fmtKm(v)} km`);

let resizeTimer = null;
function renderProgress(sub) {
  const today = todayISO(), all = acts(), s = S();
  const runs = all.filter((a) => a.category === 'run' && a.distanceKm);
  const sinceStart = runs.filter((a) => a.date >= plan.PLAN_START);
  const totalKm = sinceStart.reduce((t, a) => t + a.distanceKm, 0);
  const longest = runs.reduce((m, a) => (!m || a.distanceKm > m.distanceKm ? a : m), null);
  const series = weekSeries(all, today);
  const done = series.filter((x) => x.past && !x.current);
  const last4 = done.slice(-4);
  const avg4 = last4.length ? last4.reduce((t, x) => t + x.st.km, 0) / last4.length : null;
  const paceWeeks = series.filter((x) => x.past && x.pace).slice(-4);
  const pace4 = paceWeeks.length ? paceWeeks.reduce((t, x) => t + x.pace, 0) / paceWeeks.length : null;
  const pred = predict(all, s, today);

  view.innerHTML = `<h1>Voortgang</h1>
    <div class="tiles">
      <div class="tile"><div class="v">${fmtKm(totalKm, 0)} km</div><div class="l">Gelopen sinds start schema (${sinceStart.length} ${sinceStart.length === 1 ? 'loop' : 'lopen'})</div></div>
      <div class="tile"><div class="v">${longest ? fmtKm(longest.distanceKm, 1) + ' km' : '–'}</div><div class="l">Langste loop${longest ? ' · ' + fmtDate(longest.date, { year: true }) : ''}</div></div>
      <div class="tile"><div class="v">${avg4 != null ? fmtKm(avg4, 0) + ' km' : '–'}</div><div class="l">Gemiddeld per week (laatste ${last4.length || 4} weken)</div></div>
      <div class="tile"><div class="v">${pace4 ? fmtPace(pace4) : '–'}</div><div class="l">Tempo rustige lopen, per km (laatste 4 weken)</div></div>
    </div>
    <section class="card"><h2>Kilometers per week</h2>
      <div class="chart-legend"><span><i class="sw sw-done"></i>Gedaan</span><span><i class="sw sw-plan"></i>Gepland</span></div>
      <div class="chart" id="chKm"></div>${tableKm(series)}</section>
    <section class="card"><h2>Langste loop per week</h2>
      <div class="chart-legend"><span><i class="sw sw-done"></i>Gedaan</span><span><i class="sw sw-plan"></i>Gepland</span></div>
      <div class="chart" id="chLr"></div></section>
    <section class="card"><h2>Tempo-ontwikkeling</h2>
      <p class="muted">Gemiddeld tempo van je rustige en lange lopen per week (zonder interval en wedstrijden). Hoger = sneller.</p>
      <div class="chart-legend"><span><i class="sw sw-done"></i>Tempo per km</span><span><i class="sw sw-goal"></i>Marathon-doeltempo</span></div>
      <div class="chart" id="chPace"></div></section>
    <section class="card" id="voorspelling">${predDetail(pred, s)}</section>`;

  const draw = () => {
    const el = $('#chKm'); if (!el) return;
    const w = el.clientWidth;
    const lbl = (x) => shortDate(x.w.start);
    el.innerHTML = charts.bars({
      width: w, slot: 30, label: 'Kilometers per week', fmt: (v) => fmtKm(v, 0),
      items: series.map((x) => ({
        label: lbl(x), value: x.past ? x.st.km : 0, plan: plan.target(x.w), current: x.current,
        tip: `${x.name} · ${weekRange(x.w.start)}\nGedaan: ${x.past ? fmtKm(x.st.km) + ' km' : '–'}${planLine(x, plan.target(x.w))}`
      }))
    });
    $('#chLr').innerHTML = charts.bars({
      width: w, slot: 30, label: 'Langste loop per week', fmt: (v) => fmtKm(v, 0),
      items: series.map((x) => ({
        label: lbl(x), value: x.past ? x.st.longest : 0, plan: x.w.lang, current: x.current,
        tip: `${x.name} · ${weekRange(x.w.start)}\nLangste loop: ${x.past ? fmtKm(x.st.longest) + ' km' : '–'}${planLine(x, x.w.lang)}`
      }))
    });
    const pItems = series.filter((x) => x.past);
    $('#chPace').innerHTML = charts.paceLine({
      width: w, slot: 30, label: 'Tempo per week', goal: goalSec() / MARA, fmtY: fmtPace,
      items: pItems.map((x) => ({
        label: lbl(x), value: x.pace, current: x.current,
        tip: `${x.name} · ${weekRange(x.w.start)}\nTempo: ${x.pace ? fmtPace(x.pace) + '/km' : 'geen rustige lopen'}`
      }))
    });
    // Begin bij de huidige week; naar links scrollen = verder terug.
    view.querySelectorAll('.chart-scroll').forEach((sc) => {
      const now = sc.querySelector('.ax-now');
      const x = now ? +now.getAttribute('x') : sc.scrollWidth;
      sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.75);
    });
  };
  draw();
  window.onresize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (current === 'voortgang') draw(); }, 150); };
  if (sub === 'voorspelling') setTimeout(() => $('#voorspelling').scrollIntoView({ block: 'start' }), 0);
}

function tableKm(series) {
  return `<details class="table"><summary>Toon als tabel</summary><div class="tbl-wrap"><table>
    <thead><tr><th>Week</th><th class="num">Gedaan</th><th class="num">Gepland</th><th class="num">Langste</th><th class="num">Sportschool</th></tr></thead><tbody>
    ${series.map((x) => `<tr><td>${x.w.history ? '' : x.name.replace('Week ', '') + ' · '}${weekRange(x.w.start)}</td><td class="num">${x.past ? fmtKm(x.st.km) : ''}</td><td class="num">${x.w.history ? '–' : fmtKm(plan.target(x.w))}</td><td class="num">${x.past ? fmtKm(x.st.longest) : ''}</td><td class="num">${x.past ? x.st.gymDays + (x.w.history ? '' : '/' + x.w.gym) : ''}</td></tr>`).join('')}
    </tbody></table></div></details>`;
}

function predDetail(pred, s) {
  const g = goalSec();
  let html = '<h2>Voorspelling: waarop gebaseerd</h2>';
  if (!pred.time) {
    html += '<p>Er is nog niet genoeg om een voorspelling te maken.</p>';
  } else {
    const diff = pred.time - g;
    const code = diff <= 0 ? 'good' : diff <= 600 ? 'warn' : 'bad';
    html += `<div class="pred-row"><div class="pred-big">${fmtDur(pred.time)}</div><div class="pred-goal">Doel <strong>${fmtDur(g)}</strong><br>${badge({ code, icon: diff <= 0 ? '✓' : '!', label: diff <= 0 ? fmtDur(-diff) + ' onder doel' : fmtDur(diff) + ' boven doel' })}</div></div>`;
    html += `<div class="tbl-wrap"><table><thead><tr><th>Bron</th><th class="num">Voorspelt</th><th class="num">Telt mee</th></tr></thead><tbody>
      ${pred.sources.map((x) => `<tr><td><strong>${x.kind}</strong> · ${fmtDate(x.a.date, { year: true })}<br><span class="muted">${esc(x.how)}</span></td><td class="num">${fmtDur(x.est)}</td><td class="num">${Math.round(x.share * 100)}%</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  if (pred.skipped.length) {
    html += `<p class="muted">Niet meegeteld: ${pred.skipped.map((x) => `${fmtDate(x.a.date)} ${fmtKm(x.a.distanceKm)} km (${x.why})`).join('; ')}.</p>`;
  }
  html += `<h3>Hoe werkt het?</h3>
    <ul class="steps">
      <li><b>Wedstrijden</b> (type "Wedstrijd") worden omgerekend naar 42,2 km met de formule van Riegel. Hoe langer geleden, hoe minder ze meetellen.</li>
      <li><b>Lange lopen</b> van 18 km of meer uit de laatste 6 weken, mét hartslag: je tempo wordt omgerekend naar het tempo bij marathon-inspanning (hartslag ±${pred.mpHr}, 80% van je hartslagreserve met rust ${s.restHr || 42} en max ${s.maxHr || 174}). Kortere lopen krijgen een kleine marge erbij en tellen minder zwaar dan een loop van 32 km.</li>
      <li>De voorspelling is het gewogen gemiddelde. Zie het als richting, niet als garantie: warmte, wind en voeding op de dag zelf maken ook verschil.</li>
    </ul>`;
  return html;
}

// ---------- Meer ----------
let pendingEmail = '';
try { pendingEmail = localStorage.getItem('marathontracker.loginEmail') || ''; } catch (e) { /* */ }
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (current === 'meer') safeRerender(); });

function syncSection() {
  if (!sync.configured()) {
    return `<h2>Synchroniseren</h2><p>Synchronisatie is nog niet ingesteld. Tot die tijd blijft alles op dit apparaat bewaard.</p>
      <p class="muted">Volg stap 2 van de handleiding (Supabase) om ook op je computer te kunnen kijken.</p>`;
  }
  if (!sync.loggedIn()) {
    return `<h2>Inloggen</h2><p>Log één keer in op elk apparaat. Je krijgt een e-mail met een inloglink.</p>
      <form id="loginForm" novalidate><label class="field"><span>E-mailadres</span><input type="email" name="email" autocomplete="email" required value="${esc(pendingEmail)}"></label>
      <button class="btn btn-primary btn-big" type="submit">Stuur inloglink</button></form>
      ${pendingEmail ? `<p style="margin-top:16px"><strong>Kijk in je mail</strong> (${esc(pendingEmail)}). Open de mail <em>op dit apparaat</em> en tik op <strong>Sign in</strong>. De app opent dan en je bent ingelogd. Geen mail? Kijk ook bij ongewenste e-mail.</p>
      <details style="margin-top:8px"><summary>Staat er een code in de mail?</summary>
      <form id="codeForm" novalidate style="margin-top:12px"><label class="field"><span>Code uit de e-mail</span><input name="code" inputmode="numeric" autocomplete="one-time-code" required></label>
      <button class="btn btn-accent btn-big" type="submit">Inloggen</button></form></details>` : ''}
      <p class="form-error" id="loginErr" hidden></p>`;
  }
  const m = store.meta();
  const st = sync.status();
  const when = m.lastSync ? new Date(m.lastSync).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) : 'nog niet';
  return `<h2>Synchroniseren</h2>
    <p>Ingelogd als <strong>${esc(sync.email())}</strong>.</p>
    <p class="muted">Laatst bijgewerkt: ${when}${store.dirtyCount() ? ` · ${store.dirtyCount()} wijziging(en) wachten` : ''}${st.code === 'error' ? ` · fout: ${esc(st.msg)}` : ''}</p>
    <div class="stack"><button class="btn btn-primary" data-act="sync-now">Nu synchroniseren</button>
    <button class="btn btn-ghost" data-act="logout">Uitloggen op dit apparaat</button></div>`;
}

function renderMore() {
  const s = S();
  const g = goalSec();
  view.innerHTML = `<h1>Meer</h1>
    ${installEvt ? `<section class="card"><h2>App installeren</h2><p>Zet de Marathontracker als app op je beginscherm.</p><button class="btn btn-accent btn-big" data-act="install">Installeren</button></section>` : ''}
    <section class="card" id="syncCard">${syncSection()}</section>
    <section class="card"><h2>Trainingen importeren</h2><p>Uit een CSV-export van Garmin Connect. Dubbele trainingen worden herkend en overgeslagen.</p>
      <button class="btn btn-primary btn-big" data-act="import">${ICON.upload}Garmin-bestand kiezen</button></section>
    <section class="card"><h2>Back-up en export</h2>
      <p>Bewaar af en toe een back-up, bijvoorbeeld in OneDrive of in je mail.</p>
      <div class="stack">
        <button class="btn btn-secondary btn-big" data-act="export-json">Back-up downloaden</button>
        <label class="btn btn-secondary btn-big filebtn">Back-up terugzetten<input type="file" id="restoreFile" accept=".json,application/json"></label>
        <button class="btn btn-secondary" data-act="export-acts">Trainingen voor Excel (CSV)</button>
        <button class="btn btn-secondary" data-act="export-plan">Schema voor Excel (CSV)</button>
      </div></section>
    <section class="card"><h2>Instellingen</h2>
      <form id="setForm" novalidate>
        <label class="field"><span>Eigenaar (staat op exports)</span><input type="text" name="owner" value="${esc(owner())}"></label>
        <div class="grid2">
          <label class="field"><span>Maximale hartslag</span><input name="maxHr" inputmode="numeric" value="${s.maxHr || 174}"></label>
          <label class="field"><span>Rusthartslag</span><input name="restHr" inputmode="numeric" value="${s.restHr || 42}"></label>
        </div>
        <label class="field"><span>Doeltijd marathon (u:mm:ss)</span><input name="goal" inputmode="numeric" value="${fmtDur(g)}"></label>
        <p class="form-error" id="setErr" hidden></p>
        <button class="btn btn-primary btn-big" type="submit">Instellingen opslaan</button>
      </form></section>
    <section class="card"><h2>Schema terugzetten</h2><p>Zet alle weken terug naar het oorspronkelijke voorstel. Je trainingen blijven bewaard.</p>
      <button class="btn btn-danger" data-act="reset-plan">Schema terugzetten</button></section>`;

  const lf = $('#loginForm');
  if (lf) lf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const em = lf.elements.email.value.trim();
    const errEl = $('#loginErr');
    if (!/^\S+@\S+\.\S+$/.test(em)) { errEl.textContent = 'Vul een geldig e-mailadres in.'; errEl.hidden = false; return; }
    const btn = lf.querySelector('button'); btn.disabled = true; btn.textContent = 'Bezig…';
    try {
      await sync.sendCode(em);
      pendingEmail = em;
      try { localStorage.setItem('marathontracker.loginEmail', em); } catch (x) { /* */ }
      toast('E-mail verstuurd'); renderMore();
    } catch (err) { errEl.textContent = 'Versturen lukte niet: ' + err.message; errEl.hidden = false; btn.disabled = false; btn.textContent = 'Stuur inloglink'; }
  });
  const cf = $('#codeForm');
  if (cf) cf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = cf.querySelector('button'); btn.disabled = true; btn.textContent = 'Bezig…';
    try { await sync.verifyCode(pendingEmail, cf.elements.code.value); toast('Ingelogd'); renderMore(); }
    catch (err) { const el = $('#loginErr'); el.textContent = 'Inloggen lukte niet: ' + err.message; el.hidden = false; btn.disabled = false; btn.textContent = 'Inloggen'; }
  });

  $('#setForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const E = e.target.elements;
    const err = (m) => { const p = $('#setErr'); p.textContent = m; p.hidden = false; };
    const maxHr = parseNum(E.maxHr.value), restHr = parseNum(E.restHr.value);
    const parts = E.goal.value.trim().split(':').map(Number);
    const gs = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 3600 + parts[1] * 60 : NaN;
    if (!(maxHr > 120 && maxHr < 230)) return err('Controleer de maximale hartslag.');
    if (!(restHr > 25 && restHr < maxHr - 40)) return err('Controleer de rusthartslag.');
    if (!(gs > 7200 && gs < 8 * 3600)) return err('Schrijf de doeltijd als 4:00:00.');
    store.put({ ...S(), id: 'settings', kind: 'settings', owner: E.owner.value.trim() || OWNER_DEFAULT, maxHr, restHr, goalSec: gs });
    toast('Instellingen opgeslagen'); renderMore();
  });

  $('#restoreFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      if (!j || !Array.isArray(j.records)) throw new Error('geen back-upbestand van de Marathontracker');
      const n = store.mergeBackup(j.records);
      toast(n ? `${n} onderdelen teruggezet` : 'Niets nieuws in deze back-up');
      renderMore();
    } catch (err) { alert('Terugzetten lukte niet: ' + err.message); }
    e.target.value = '';
  });
}

// ---------- exports ----------
const fileBase = () => `Marathonvoorbereiding ${owner()} ${todayISO()}`;
function exportJSON() {
  const data = {
    titel: 'Marathonvoorbereiding', eigenaar: owner(), exportdatum: new Date().toISOString(), versie: 1,
    records: store.allRaw()
  };
  downloadFile(fileBase() + '.json', JSON.stringify(data, null, 2), 'application/json');
}
const nl = (n, d = 2) => (n == null || n === '' ? '' : Number(n).toLocaleString('nl-NL', { maximumFractionDigits: d, useGrouping: false }));
function exportActs() {
  const rows = [
    ['Marathonvoorbereiding – trainingen'], ['Eigenaar', owner()], ['Exportdatum', fmtNL(todayISO())], [],
    ['Datum', 'Tijdstip', 'Categorie', 'Type', 'Afstand (km)', 'Duur', 'Tempo (min/km)', 'Gem. hartslag', 'Max. hartslag', 'Gevoel (1-5)', 'Notitie', 'Bron']
  ];
  acts().slice().reverse().forEach((a) => rows.push([
    fmtNL(a.date), a.time || '', CAT[a.category], a.type, nl(a.distanceKm), fmtDur(a.durationSec),
    a.distanceKm && a.durationSec ? fmtPace(a.durationSec / a.distanceKm) : '', nl(a.avgHr, 0), nl(a.maxHr, 0),
    a.feel || '', a.note || '', a.source === 'garmin' ? 'Garmin' : 'Handmatig'
  ]));
  downloadFile(fileBase() + ' trainingen.csv', toCSV(rows), 'text/csv;charset=utf-8');
}
function exportPlan() {
  const today = todayISO(), all = acts();
  const rows = [
    ['Marathonvoorbereiding – schema'], ['Eigenaar', owner()], ['Exportdatum', fmtNL(todayISO())], [],
    ['Week', 'Van', 'Tot', 'Status', 'Focus', 'Ma (km)', 'Wo interval (km)', 'Do/vr (km)', 'Lange loop (km)', 'Gepland totaal (km)',
      'Gedaan (km)', 'Langste loop gedaan (km)', 'Sportschool gepland', 'Sportschool gedaan', 'Beoordeling']
  ];
  plan.weeks().forEach((w, i) => {
    const st = plan.stats(plan.actsInWeek(all, w.start));
    const ev = plan.evaluate(w, st, today);
    const past = w.start <= today;
    rows.push([i + 1, fmtNL(w.start), fmtNL(plan.weekEnd(w)), plan.STATUS[w.status] || 'Normaal', w.focus || '',
      nl(w.ma), nl(w.wo), nl(w.dov), nl(w.lang), nl(plan.target(w)),
      past ? nl(st.km) : '', past ? nl(st.longest) : '', w.gym, past ? st.gymDays : '', ev.label]);
  });
  downloadFile(fileBase() + ' schema.csv', toCSV(rows), 'text/csv;charset=utf-8');
}

// ---------- klikken ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act, id = t.dataset.id;
  switch (act) {
    case 'add': openActForm(); break;
    case 'edit-act': openActForm(id); break;
    case 'import': openImport(); break;
    case 'filter': actFilter = t.dataset.v; renderActs(); break;
    case 'edit-week': openWeekForm(id); break;
    case 'toggle-week': {
      const det = t.parentElement.querySelector('.week-detail');
      const open = det.hidden;
      det.hidden = !open;
      t.setAttribute('aria-expanded', String(open));
      if (open) { openWeeks.add(id); openWeeks.delete('closed-' + id); } else { openWeeks.delete(id); openWeeks.add('closed-' + id); }
      break;
    }
    case 'sync-now': await sync.sync(); renderMore(); break;
    case 'logout': if (confirm('Uitloggen op dit apparaat? Je gegevens blijven hier bewaard.')) { sync.logout(); renderMore(); } break;
    case 'export-json': exportJSON(); break;
    case 'export-acts': exportActs(); break;
    case 'export-plan': exportPlan(); break;
    case 'reset-plan':
      if (confirm('Alle weken terugzetten naar het oorspronkelijke voorstel?')) {
        store.putMany(plan.defaultWeeks()); toast('Schema teruggezet');
      }
      break;
    case 'install':
      if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; renderMore(); }
      break;
  }
});
$('#syncBtn').addEventListener('click', () => { location.hash = '#/meer'; });

// ---------- tooltip grafieken ----------
const tip = $('#tip');
function showTip(el, x, y) {
  tip.textContent = el.getAttribute('data-tip');
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
  let top = y - r.height - 14;
  if (top < 8) top = y + 18;
  tip.style.left = left + 'px'; tip.style.top = top + 'px';
}
const hideTip = () => { tip.hidden = true; };
document.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el) showTip(el, e.clientX, e.clientY); else hideTip();
});
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el) showTip(el, e.clientX, e.clientY); else hideTip();
});
window.addEventListener('scroll', hideTip, { passive: true });

// ---------- synchronisatie-knop ----------
function renderSyncBtn(st) {
  const b = $('#syncBtn');
  const n = store.dirtyCount();
  const map = {
    ok: ['ok', 'Bijgewerkt'], busy: ['busy', 'Bezig…'], offline: ['offline', n ? `Offline · ${n} wacht` : 'Offline'],
    login: ['login', 'Inloggen'], local: ['local', 'Op dit apparaat'], error: ['error', 'Sync-fout'], idle: ['local', '…']
  };
  const [cls, txt] = map[st.code] || map.idle;
  b.className = 'syncbtn s-' + cls;
  b.innerHTML = `<span class="dot" aria-hidden="true"></span>${txt}`;
  b.title = st.msg || '';
  b.setAttribute('aria-label', 'Synchronisatie: ' + txt);
}

// ---------- start ----------
ensureSeeds();
const red = sync.handleRedirect();
if (red && red.error) setTimeout(() => toast('Inloggen mislukt: ' + red.error), 300);
else if (red) setTimeout(() => toast('Ingelogd'), 300);
sync.onStatus((st) => { renderSyncBtn(st); if (current === 'meer' && st.code !== 'busy') safeRerender(); });

let syncTimer = null;
store.subscribe((source) => {
  renderSyncBtn(sync.status());
  if (source === 'local') { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync.sync(), 1500); }
  if (source === 'remote') safeRerender();
});

route();
sync.sync();
window.addEventListener('online', () => sync.sync());
window.addEventListener('offline', () => sync.sync());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { sync.sync(); safeRerender(); } });
setInterval(() => { if (document.visibilityState === 'visible') sync.sync(); }, 5 * 60 * 1000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline-modus niet beschikbaar */ });
}
