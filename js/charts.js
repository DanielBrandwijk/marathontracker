// Eenvoudige SVG-grafieken (werken zonder internet).
import { esc } from './util.js';

const M = { l: 40, r: 10, t: 16, b: 28 };

function nice(max, count = 4) {
  const raw = max / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  return { step, top: Math.ceil(max / step) * step };
}
function barPath(x, y, w, h, r) {
  if (h <= 0.5) return '';
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function xLabels(items, slot, H, iw) {
  const every = Math.max(1, Math.ceil(items.length / Math.max(1, Math.floor(iw / 50))));
  return items.map((d, i) => (i % every === 0 || d.current)
    ? `<text x="${(M.l + i * slot + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="ax${d.current ? ' ax-now' : ''}">${esc(d.label)}</text>`
    : '').join('');
}
function hits(items, slot, ih) {
  return items.map((d, i) => `<rect x="${(M.l + i * slot).toFixed(1)}" y="${M.t}" width="${slot.toFixed(1)}" height="${ih}" class="hit" data-tip="${esc(d.tip)}"/>`).join('');
}
// Breedte: past het niet, dan krijgt elke week minimaal `slot` pixels en kun je zijwaarts scrollen.
function widthFor(width, n, slot) {
  const vis = Math.max(260, Math.round(width));
  return slot ? Math.max(vis, M.l + M.r + n * slot) : vis;
}
// Scrollend deel + vaste as met getallen links.
function frame(W, H, body, axis, label) {
  return `<div class="chart-scroll"><svg class="chart-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${body}</svg></div>` +
    `<svg class="chart-svg chart-yaxis" width="${M.l}" height="${H}" aria-hidden="true"><rect x="0" y="0" width="${M.l - 2}" height="${H}" class="axis-bg"/>${axis}</svg>`;
}

// Staafgrafiek: lichte staaf = gepland, gekleurde staaf = gedaan, streepje = doel.
export function bars({ width, height = 220, items, label = '', fmt = (v) => v, slot: minSlot = 0 }) {
  const W = widthFor(width, items.length, minSlot), H = height, iw = W - M.l - M.r, ih = H - M.t - M.b;
  const maxV = Math.max(1, ...items.map((d) => Math.max(d.value || 0, d.plan || 0)));
  const { step, top } = nice(maxV);
  const y = (v) => M.t + ih - (v / top) * ih;
  let grid = '', axis = '';
  for (let v = 0; v <= top + 1e-9; v += step) {
    grid += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'base' : 'grid'}"/>`;
    axis += `<text x="${M.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  }
  const slot = iw / items.length, bw = Math.max(4, Math.min(24, slot * 0.64));
  let marks = '';
  items.forEach((d, i) => {
    const x = M.l + i * slot + (slot - bw) / 2;
    if (d.plan > 0) marks += `<path d="${barPath(x, y(d.plan), bw, y(0) - y(d.plan), 4)}" class="m-plan"/>`;
    if (d.value > 0) marks += `<path d="${barPath(x, y(d.value), bw, y(0) - y(d.value), 4)}" class="m-done"/>`;
    if (d.plan > 0) marks += `<line x1="${x - 2}" x2="${x + bw + 2}" y1="${y(d.plan)}" y2="${y(d.plan)}" class="m-target"/>`;
  });
  return frame(W, H, grid + hits(items, slot, ih) + marks + xLabels(items, slot, H, iw), axis, label);
}

// Lijngrafiek voor tempo: sneller staat hoger.
export function paceLine({ width, height = 220, items, goal, fmtY, label = '', slot: minSlot = 0 }) {
  const vals = items.map((d) => d.value).filter((v) => v != null);
  if (!vals.length) return '<p class="empty">Nog te weinig gegevens.</p>';
  let lo = Math.floor((Math.min(...vals, goal) - 10) / 15) * 15;
  let hi = Math.ceil((Math.max(...vals, goal) + 10) / 15) * 15;
  const W = widthFor(width, items.length, minSlot), H = height, iw = W - M.l - M.r, ih = H - M.t - M.b;
  const y = (v) => M.t + ((v - lo) / (hi - lo)) * ih;
  const stepY = hi - lo > 180 ? 60 : hi - lo > 90 ? 30 : 15;
  let grid = '', axis = '';
  for (let v = lo; v <= hi; v += stepY) {
    grid += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`;
    axis += `<text x="${M.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmtY(v)}</text>`;
  }
  const slot = iw / items.length;
  const cx = (i) => M.l + i * slot + slot / 2;
  let d = '', prev = false, pts = '';
  items.forEach((it, i) => {
    if (it.value == null) { prev = false; return; }
    d += (prev ? 'L' : 'M') + cx(i).toFixed(1) + ',' + y(it.value).toFixed(1);
    prev = true;
    pts += `<circle cx="${cx(i).toFixed(1)}" cy="${y(it.value).toFixed(1)}" r="4.5" class="m-pt"/>`;
  });
  const gy = y(goal);
  const goalLine = `<line x1="${M.l}" x2="${W - M.r}" y1="${gy}" y2="${gy}" class="m-goal"/>` +
    `<text x="${W - M.r}" y="${gy - 6}" text-anchor="end" class="goal-label">doel ${fmtY(goal)}</text>`;
  return frame(W, H, grid + goalLine + hits(items, slot, ih) + `<path d="${d}" class="m-line"/>` + pts + xLabels(items, slot, H, iw), axis, label);
}
