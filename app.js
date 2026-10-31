'use strict';

/*
 * LED Wall Focus Planner
 *
 * World coordinates (metres):
 *   x — across the stage (left/right), wall centred on x = 0
 *   y — height above the floor
 *   z — distance in front of the wall; the centre of the wall face sits at z = 0
 *
 * The optics and wall-geometry maths live in optics.js (unit-tested in tests/).
 */

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

// Sensor size (mm) and horizontal photosite count for a typical recording mode.
// Generic formats have no fixed resolution; 4096 px is assumed and can be edited.
const CAMERAS = [
  { id: 'ff', group: 'Generic formats', name: 'Full Frame (36 × 24)', w: 36.00, h: 24.00, res: 6000 },
  { id: 'lf65', group: 'Generic formats', name: 'Large Format 65 mm (54.12 × 25.58)', w: 54.12, h: 25.58, res: 6560 },
  { id: 'mf', group: 'Generic formats', name: 'Medium Format (44 × 33)', w: 44.00, h: 33.00, res: 8256 },
  { id: 'vv', group: 'Generic formats', name: 'Vista Vision / VV (40.96 × 21.60)', w: 40.96, h: 21.60, res: 8192 },
  { id: 'apsh', group: 'Generic formats', name: 'APS-H (27.9 × 18.6)', w: 27.90, h: 18.60, res: 4096 },
  { id: 's35', group: 'Generic formats', name: 'Super 35 4-perf (24.89 × 18.66)', w: 24.89, h: 18.66, res: 4096 },
  { id: 's35-3p', group: 'Generic formats', name: 'Super 35 3-perf / 16:9 (24.89 × 13.87)', w: 24.89, h: 13.87, res: 4096 },
  { id: 'apsc', group: 'Generic formats', name: 'APS-C (23.5 × 15.6)', w: 23.50, h: 15.60, res: 6000 },
  { id: 'apsc-canon', group: 'Generic formats', name: 'APS-C Canon (22.3 × 14.9)', w: 22.30, h: 14.90, res: 6000 },
  { id: 'mft', group: 'Generic formats', name: 'Micro Four Thirds (17.3 × 13.0)', w: 17.30, h: 13.00, res: 5184 },
  { id: 'one-inch', group: 'Generic formats', name: '1-inch (13.2 × 8.8)', w: 13.20, h: 8.80, res: 5472 },
  { id: 's16', group: 'Generic formats', name: 'Super 16 (12.52 × 7.41)', w: 12.52, h: 7.41, res: 2048 },
  { id: 'two-thirds', group: 'Generic formats', name: '2/3-inch broadcast (9.59 × 5.39)', w: 9.59, h: 5.39, res: 1920 },

  { id: 'alexa35', group: 'Cinema cameras', name: 'ARRI ALEXA 35 (4.6K Open Gate)', w: 27.99, h: 19.22, res: 4608 },
  { id: 'alexaminilf', group: 'Cinema cameras', name: 'ARRI ALEXA Mini LF (Open Gate)', w: 36.70, h: 25.54, res: 4448 },
  { id: 'alexamini', group: 'Cinema cameras', name: 'ARRI ALEXA Mini (3.4K Open Gate)', w: 28.25, h: 18.17, res: 3424 },
  { id: 'alexa65', group: 'Cinema cameras', name: 'ARRI ALEXA 65 (Open Gate)', w: 54.12, h: 25.58, res: 6560 },
  { id: 'vraptor', group: 'Cinema cameras', name: 'RED V-RAPTOR 8K VV', w: 40.96, h: 21.60, res: 8192 },
  { id: 'komodo', group: 'Cinema cameras', name: 'RED KOMODO 6K S35', w: 27.03, h: 14.26, res: 6144 },
  { id: 'venice2', group: 'Cinema cameras', name: 'Sony VENICE 2 8.6K (3:2)', w: 36.20, h: 24.10, res: 8640 },
  { id: 'fx6', group: 'Cinema cameras', name: 'Sony FX6 / FX3 (Full Frame)', w: 35.60, h: 23.80, res: 4240 },
  { id: 'ursa12k', group: 'Cinema cameras', name: 'Blackmagic URSA Mini Pro 12K', w: 27.03, h: 14.25, res: 12288 },
  { id: 'pocket6k', group: 'Cinema cameras', name: 'Blackmagic Pocket 6K', w: 23.10, h: 12.99, res: 6144 },
  { id: 'pocket4k', group: 'Cinema cameras', name: 'Blackmagic Pocket 4K (MFT)', w: 18.96, h: 10.00, res: 4096 },
  { id: 'c70', group: 'Cinema cameras', name: 'Canon C70 / C300 Mk III (S35)', w: 26.20, h: 13.80, res: 4096 },

  { id: 'custom', group: 'Custom', name: 'Custom sensor size…' },
];

// LED pixel pitch presets (mm).
const PITCHES = [1.2, 1.4, 1.5, 1.9, 2.3, 2.6, 2.8];

// Third-stop aperture scale.
const FSTOPS = [1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6,
  6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22];

const DEFAULTS = {
  wallW: 10, wallH: 4, wallBottom: 0, curve: 0, pitch: 1.5,
  camX: 0, camZ: 7, camY: 1.5,
  subX: 0.5, subZ: 4, subH: 1.8, aimH: 1.6,
  body: 'alexa35', sensorW: 27.99, sensorH: 19.22, resH: 4608,
  focal: 35, fstopIdx: FSTOPS.indexOf(2.8),
  focusAuto: true, focus: 3,
  cocAuto: true, coc: 0.025,
  stageDepth: 12,
};

const SLIDERS = {
  'ctl-wall': [
    { key: 'wallW', label: 'Width', min: 1, max: 30, step: 0.1, unit: 'm' },
    { key: 'wallH', label: 'Height', min: 0.5, max: 12, step: 0.1, unit: 'm' },
    { key: 'wallBottom', label: 'Bottom edge above floor', min: 0, max: 3, step: 0.05, unit: 'm' },
    { key: 'curve', label: 'Curvature (total arc)', min: -90, max: 300, step: 1, unit: '°' },
  ],
  'ctl-camera': [
    { key: 'camX', label: 'Position across stage (X)', min: -10, max: 10, step: 0.05, unit: 'm', dyn: 'x' },
    { key: 'camZ', label: 'Distance from wall centre (Z)', min: -20, max: 12, step: 0.05, unit: 'm', dyn: 'z' },
    { key: 'camY', label: 'Lens height', min: 0.1, max: 6, step: 0.05, unit: 'm' },
  ],
  'ctl-lens': [
    { key: 'focal', label: 'Focal length', min: 8, max: 300, step: 1, unit: 'mm', log: true },
    { key: 'fstopIdx', label: 'Aperture', min: 0, max: FSTOPS.length - 1, step: 1, format: i => 'f/' + FSTOPS[i] },
    { key: 'focus', label: 'Focus distance', min: 0.3, max: 60, step: 0.01, unit: 'm', log: true },
  ],
  'ctl-subject': [
    { key: 'subX', label: 'Position across stage (X)', min: -10, max: 10, step: 0.05, unit: 'm', dyn: 'x' },
    { key: 'subZ', label: 'Distance from wall centre (Z)', min: -20, max: 12, step: 0.05, unit: 'm', dyn: 'z' },
    { key: 'subH', label: 'Subject height', min: 0.5, max: 2.2, step: 0.01, unit: 'm' },
    { key: 'aimH', label: 'Aim point height', min: 0, max: 3, step: 0.01, unit: 'm' },
  ],
  'ctl-view': [
    { key: 'stageDepth', label: 'Stage depth shown', min: 4, max: 40, step: 0.5, unit: 'm' },
  ],
};

let state = { ...DEFAULTS };

/* ------------------------------------------------------------------ */
/* Vector helpers                                                      */
/* ------------------------------------------------------------------ */

const v3 = (x, y, z) => ({ x, y, z });
const vsub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const vadd = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const vmul = (a, k) => v3(a.x * k, a.y * k, a.z * k);
const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const vcross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const vlen = a => Math.hypot(a.x, a.y, a.z);
const vnorm = a => { const l = vlen(a); return l > 0 ? vmul(a, 1 / l) : a; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ */
/* Scene model                                                         */
/* ------------------------------------------------------------------ */

const wallShape = () => Optics.wallShape(state.wallW, state.curve);

// Plan-view extents of the wall (front face and a nominal back).
function wallExtents(shape) {
  let minZ = 0, maxZ = 0, maxX = 0;
  for (let i = 0; i <= 40; i++) {
    const p = Optics.wallPlan(shape, i / 40);
    minZ = Math.min(minZ, p.z - 0.3 * p.nz);
    maxZ = Math.max(maxZ, p.z);
    maxX = Math.max(maxX, Math.abs(p.x - 0.3 * p.nx));
  }
  return { minZ, maxZ, maxX };
}

// World rectangle shown in the top view (also the limits for moving camera/subject).
function stageBounds() {
  const e = wallExtents(wallShape());
  const half = Math.max(e.maxX + 2, 4);
  return { xmin: -half, xmax: half, zmin: Math.min(-1, e.minZ - 0.8), zmax: Math.max(state.stageDepth, e.maxZ + 1) };
}

// A point on the wall face. u runs left→right (0..1), v bottom→top (0..1).
function wallPoint(shape, u, v) {
  const p = Optics.wallPlan(shape, u);
  return { p: v3(p.x, state.wallBottom + v * state.wallH, p.z), n: v3(p.nx, 0, p.nz), t: v3(p.tx, 0, p.tz) };
}

function sensor() {
  return { w: state.sensorW, h: state.sensorH, res: state.resH };
}

// Camera position and orthonormal basis, aimed at the subject's aim point.
function cameraBasis() {
  const cam = v3(state.camX, state.camY, state.camZ);
  const aim = v3(state.subX, state.aimH, state.subZ);
  let F = vsub(aim, cam);
  if (vlen(F) < 1e-6) F = v3(0, 0, -1);
  F = vnorm(F);
  let R = vcross(F, v3(0, 1, 0));
  if (vlen(R) < 1e-6) R = v3(1, 0, 0);
  R = vnorm(R);
  const U = vcross(R, F);
  const horiz = Math.hypot(F.x, F.z);
  const tilt = Math.atan2(F.y, horiz);
  const heading = horiz > 1e-6 ? { x: F.x / horiz, z: F.z / horiz } : { x: 0, z: -1 };
  return { cam, aim, F, R, U, tilt, heading, subjectDist: vlen(vsub(aim, cam)) };
}

function compute() {
  const cb = cameraBasis();
  const sen = sensor();
  const fmm = state.focal;
  const f = fmm / 1000;
  const cocMm = state.cocAuto ? Math.hypot(sen.w, sen.h) / 1500 : state.coc;
  const c = cocMm / 1000;
  const N = FSTOPS[state.fstopIdx];

  if (state.focusAuto) state.focus = cb.subjectDist;
  const s = Math.max(state.focus, f * 1.5);

  // Thin-lens depth of field, all in metres.
  const { H, near, far } = Optics.dof(f, N, c, s);

  const hfov = 2 * Math.atan(sen.w / (2 * fmm));
  const vfov = 2 * Math.atan(sen.h / (2 * fmm));

  const o = {
    cb, sen, fmm, f, cocMm, c, N, s, H, near, far, hfov, vfov,
    th: Math.tan(hfov / 2), tv: Math.tan(vfov / 2),
    shape: wallShape(),
    v: Optics.imageDistance(f, s), // lens-to-sensor distance (m)
    photositeMm: sen.w / sen.res,
    pitchM: state.pitch / 1000,
  };
  o.wall = analyseWall(o);
  o.section = sightSection(o);
  return o;
}

// Project a world point to sensor-plane coordinates (m). Null if behind the lens.
function toSensor(p, o) {
  const { cam, F, R, U } = o.cb;
  const d = vsub(p, cam);
  const depth = vdot(d, F);
  if (depth <= 1e-6) return null;
  return { x: (o.v * vdot(d, R)) / depth, y: (o.v * vdot(d, U)) / depth, depth };
}

// Classify a point on the wall: in frame? inside the DOF? moiré risk?
function evalWallPoint(wp, o) {
  const { p, n, t } = wp;
  const { cam, F, R, U } = o.cb;
  const d = vsub(p, cam);
  const depth = vdot(d, F);
  const facing = vdot(n, d) < 0; // the LED face points toward the camera
  if (depth <= 1e-6 || !facing) return { visible: false, inDof: false, inFocus: false, depth, moire: 0 };
  const x = vdot(d, R) / depth;
  const y = vdot(d, U) / depth;
  const visible = Math.abs(x) <= o.th + 1e-9 && Math.abs(y) <= o.tv + 1e-9;
  const inDof = depth >= o.near && depth <= o.far;
  const e = { visible, inDof, inFocus: visible && inDof, depth, moire: 0 };
  if (visible) Object.assign(e, moireAt(wp, o, depth));
  return e;
}

// Moiré estimate at a wall point: image the LED pitch along both grid axes,
// compare with the sensor photosite pitch and the defocus blur there.
function moireAt(wp, o, depth) {
  const blurMm = Optics.blurDiameter(o.f, o.N, o.s, depth) * 1000;
  const s0 = toSensor(wp.p, o);
  let worst = null;
  for (const axis of [wp.t, v3(0, 1, 0)]) {
    const s1 = toSensor(vadd(wp.p, vmul(axis, o.pitchM)), o);
    if (!s0 || !s1) continue;
    const pImgMm = Math.hypot(s1.x - s0.x, s1.y - s0.y) * 1000;
    const m = Optics.moireLevel(pImgMm, o.photositeMm, blurMm);
    if (!worst || m.level > worst.level || (m.level === worst.level && m.contrast > worst.contrast)) {
      worst = { ...m, pImgMm };
    }
  }
  if (!worst) return { moire: 0 };
  return { moire: worst.level, contrast: worst.contrast, ratio: worst.ratio, pImgMm: worst.pImgMm, blurMm };
}

const WALL_NU = 161;
const WALL_NV = 61;

function analyseWall(o) {
  const cols = [];
  let visible = 0, inFocus = 0, moireCount = 0, minDepth = Infinity, maxDepth = -Infinity;
  let worst = null;     // sample with the highest moiré level / contrast
  let safeStop = Infinity; // widest-needed f-number that blurs away all near-Nyquist grid
  for (let i = 0; i < WALL_NU; i++) {
    const u = i / (WALL_NU - 1);
    const col = { u, visible: false, inFocus: false, moire: 0 };
    for (let j = 0; j < WALL_NV; j++) {
      const e = evalWallPoint(wallPoint(o.shape, u, j / (WALL_NV - 1)), o);
      if (!e.visible) continue;
      visible++;
      col.visible = true;
      minDepth = Math.min(minDepth, e.depth);
      maxDepth = Math.max(maxDepth, e.depth);
      if (e.inFocus) { inFocus++; col.inFocus = true; }
      col.moire = Math.max(col.moire, e.moire);
      if (e.moire >= 2) moireCount++;
      if (e.pImgMm && (!worst || e.moire > worst.moire || (e.moire === worst.moire && e.contrast > worst.contrast))) worst = e;
      // Blur scales with 1/N, so the stop giving blur = SAFE_BLUR_RATIO × imaged pitch is:
      if (e.pImgMm && e.ratio < Optics.BAYER_LIMIT) {
        safeStop = Math.min(safeStop, (o.N * e.blurMm) / (Optics.SAFE_BLUR_RATIO * e.pImgMm));
      }
    }
    cols.push(col);
  }
  return {
    cols, visible, inFocus, minDepth, maxDepth, worst, safeStop,
    fraction: visible ? inFocus / visible : 0,
    moireFraction: visible ? moireCount / visible : 0,
    moireLevel: worst ? worst.moire : 0,
  };
}

// Where the vertical plane through the line of sight meets the wall.
function sightSection(o) {
  const h = o.cb.heading;
  return Optics.rayWall(o.shape, state.camX, state.camZ, h.x, h.z);
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

function fmtM(d) {
  if (!isFinite(d)) return '∞';
  if (d >= 1000) return '> 1 km';
  if (d >= 100) return d.toFixed(0) + ' m';
  if (d >= 10) return d.toFixed(1) + ' m';
  return d.toFixed(2) + ' m';
}
const fmtDeg = r => (r * 180 / Math.PI).toFixed(1) + '°';
const fmtStop = n => 'f/' + (n >= 10 ? n.toFixed(0) : n.toFixed(1)).replace(/\.0$/, '');

/* ------------------------------------------------------------------ */
/* Canvas helpers                                                      */
/* ------------------------------------------------------------------ */

let colors = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const names = ['canvas-bg', 'grid', 'floor', 'text', 'muted', 'wall', 'wall-lit', 'frustum',
    'frustum-line', 'dof', 'focus', 'near', 'far', 'hyper', 'cam', 'subject', 'hazard-a', 'hazard-b',
    'moire-high', 'moire-mid'];
  colors = {};
  for (const n of names) colors[n] = cs.getPropertyValue('--' + n).trim();
}

const hazardCache = new WeakMap();
function hazard(ctx) {
  if (hazardCache.has(ctx)) return hazardCache.get(ctx);
  const S = 12;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = colors['hazard-b'] || '#111';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = colors['hazard-a'] || '#f5c400';
  g.lineWidth = 4.2;
  for (let off = -S; off <= S; off += S) {
    g.beginPath();
    g.moveTo(off, S);
    g.lineTo(off + S, 0);
    g.stroke();
  }
  const p = ctx.createPattern(c, 'repeat');
  hazardCache.set(ctx, p);
  return p;
}

function prepCanvas(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = colors['canvas-bg'];
  ctx.fillRect(0, 0, r.width, r.height);
  return { ctx, w: r.width, h: r.height };
}

// Uniform-scale fit of a world rectangle into the canvas.
// flipY: world "b" grows upward (side view); otherwise downward (top view, z toward camera).
function makeView(w, h, amin, amax, bmin, bmax, flipY, pad = 22) {
  const k = Math.min((w - 2 * pad) / (amax - amin), (h - 2 * pad) / (bmax - bmin));
  const ox = (w - k * (amax - amin)) / 2;
  const oy = (h - k * (bmax - bmin)) / 2;
  return {
    k, amin, amax, bmin, bmax,
    X: a => ox + (a - amin) * k,
    Y: b => flipY ? oy + (bmax - b) * k : oy + (b - bmin) * k,
    A: sx => amin + (sx - ox) / k,
    B: sy => flipY ? bmax - (sy - oy) / k : bmin + (sy - oy) / k,
  };
}

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawGrid(ctx, V, w, h) {
  const step = V.k < 14 ? 5 : V.k < 30 ? 2 : 1;
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  for (let a = Math.ceil(V.A(0) / step) * step; V.X(a) < w; a += step) line(ctx, V.X(a), 0, V.X(a), h);
  const b0 = Math.min(V.B(0), V.B(h)), b1 = Math.max(V.B(0), V.B(h));
  for (let b = Math.ceil(b0 / step) * step; b <= b1; b += step) line(ctx, 0, V.Y(b), w, V.Y(b));
  // Scale bar
  ctx.strokeStyle = colors.muted;
  ctx.fillStyle = colors.muted;
  ctx.lineWidth = 2;
  const x0 = 12, y0 = h - 12, len = V.k * step;
  line(ctx, x0, y0, x0 + len, y0);
  line(ctx, x0, y0 - 4, x0, y0 + 0);
  line(ctx, x0 + len, y0 - 4, x0 + len, y0 + 0);
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText(step + ' m', x0 + len + 6, y0 + 4);
}

function label(ctx, text, x, y, color, align = 'left') {
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = colors['canvas-bg'];
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function marker(ctx, x, y, kind) {
  ctx.lineWidth = 2;
  if (kind === 'near') {
    ctx.fillStyle = colors.near;
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'far') {
    ctx.fillStyle = colors.far;
    ctx.strokeStyle = colors.far;
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
  } else if (kind === 'hyper') {
    ctx.fillStyle = colors.hyper;
    poly(ctx, [[x, y - 6], [x + 6, y], [x, y + 6], [x - 6, y]]);
    ctx.fill();
  } else if (kind === 'focus') {
    ctx.strokeStyle = colors.focus;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
    line(ctx, x - 8, y, x + 8, y);
    line(ctx, x, y - 8, x, y + 8);
  }
}

// Camera glyph at screen (x, y) pointing along screen angle `ang`.
function drawCamera(ctx, x, y, ang, active) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = colors.cam;
  ctx.strokeStyle = colors['canvas-bg'];
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-16, -8, 20, 16, 3);
  ctx.fill(); ctx.stroke();
  poly(ctx, [[4, -4], [13, -8], [13, 8], [4, 4]]);
  ctx.fill(); ctx.stroke();
  ctx.restore();
  if (active) {
    ctx.strokeStyle = colors.focus;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.stroke();
  }
}

/* ------------------------------------------------------------------ */
/* Top view                                                            */
/* ------------------------------------------------------------------ */

const topCanvas = document.getElementById('top');
const sideCanvas = document.getElementById('side');
let topView = null, sideView = null;
let hover = { top: null, side: null };
let drag = null;

function drawTop(o) {
  const { ctx, w, h } = prepCanvas(topCanvas);
  const b = stageBounds();
  const V = makeView(w, h, b.xmin, b.xmax, b.zmin, b.zmax, false);
  topView = V;
  const shape = o.shape;
  drawGrid(ctx, V, w, h);

  const { cam, F, R, heading } = o.cb;
  const P = p => [V.X(p.x), V.Y(p.z)];
  const at = (d, side) => vadd(cam, vmul(vadd(F, vmul(R, side * o.th)), d)); // point at axial depth d on a FOV edge
  const FAR = 400;

  // Clip to the stage side of the wall's (extended) surface – what the camera can "see".
  ctx.save();
  ctx.beginPath();
  if (shape.flat) {
    ctx.rect(0, V.Y(0), w, h);
  } else if (shape.R > 0) {
    ctx.arc(V.X(0), V.Y(shape.R), shape.R * V.k, 0, Math.PI * 2);
  } else {
    ctx.rect(0, 0, w, h);
    ctx.arc(V.X(0), V.Y(shape.R), -shape.R * V.k, 0, Math.PI * 2, true);
  }
  ctx.clip('evenodd');

  // Field of view
  poly(ctx, [P(cam), P(at(FAR, -1)), P(at(FAR, 1))]);
  ctx.fillStyle = colors.frustum;
  ctx.fill();
  ctx.strokeStyle = colors['frustum-line'];
  ctx.lineWidth = 1.5;
  line(ctx, ...P(cam), ...P(at(FAR, -1)));
  line(ctx, ...P(cam), ...P(at(FAR, 1)));

  // Depth of field band
  const farD = isFinite(o.far) ? o.far : FAR;
  poly(ctx, [P(at(o.near, -1)), P(at(o.near, 1)), P(at(farD, 1)), P(at(farD, -1))]);
  ctx.fillStyle = colors.dof;
  ctx.fill();
  ctx.strokeStyle = colors.near;
  ctx.lineWidth = 1.5;
  line(ctx, ...P(at(o.near, -1)), ...P(at(o.near, 1)));
  if (isFinite(o.far)) line(ctx, ...P(at(o.far, -1)), ...P(at(o.far, 1)));

  // Focus plane
  ctx.strokeStyle = colors.focus;
  ctx.lineWidth = 2.5;
  line(ctx, ...P(at(o.s, -1)), ...P(at(o.s, 1)));

  // Optical axis
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  line(ctx, ...P(cam), ...P(vadd(cam, vmul(F, FAR))));
  ctx.setLineDash([]);
  ctx.restore();

  // Wall: one quad per analysed column, drawn as a slab behind the LED face.
  const thick = Math.max(0.25, 7 / V.k);
  const du = 0.5 / (WALL_NU - 1);
  const face = u => Optics.wallPlan(shape, Math.min(1, Math.max(0, u)));
  const quad = (u0, u1, off0, off1) => {
    const a = face(u0), c = face(u1);
    return [
      [V.X(a.x - a.nx * off0), V.Y(a.z - a.nz * off0)], [V.X(c.x - c.nx * off0), V.Y(c.z - c.nz * off0)],
      [V.X(c.x - c.nx * off1), V.Y(c.z - c.nz * off1)], [V.X(a.x - a.nx * off1), V.Y(a.z - a.nz * off1)],
    ];
  };
  for (const col of o.wall.cols) {
    poly(ctx, quad(col.u - du, col.u + du, 0, thick));
    ctx.fillStyle = col.inFocus ? hazard(ctx) : col.visible ? colors['wall-lit'] : colors.wall;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.6;
    ctx.fill();
    ctx.stroke();
    // Moiré strip on the stage side of the face
    if (col.moire >= 2) {
      poly(ctx, quad(col.u - du, col.u + du, -1.5 / V.k, -5 / V.k));
      ctx.fillStyle = col.moire === 3 ? colors['moire-high'] : colors['moire-mid'];
      ctx.fill();
    }
  }
  // Outline
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) { const p = face(i / 80); ctx[i ? 'lineTo' : 'moveTo'](V.X(p.x), V.Y(p.z)); }
  for (let i = 80; i >= 0; i--) { const p = face(i / 80); ctx.lineTo(V.X(p.x - p.nx * thick), V.Y(p.z - p.nz * thick)); }
  ctx.closePath();
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 1;
  ctx.stroke();
  const ext = wallExtents(shape);
  const curveTxt = shape.flat ? '' : ` · ${Math.abs(state.curve)}° ${state.curve > 0 ? 'concave' : 'convex'}`;
  label(ctx, `LED wall ${state.wallW.toFixed(1)} m × ${state.wallH.toFixed(1)} m${curveTxt}`,
    V.X(0), Math.max(12, V.Y(Math.min(ext.minZ, -thick)) - 9), colors.muted, 'center');

  // Axis markers (projected onto the floor plan)
  const perp = { x: -heading.z, z: heading.x };
  const axisPt = d => P(vadd(cam, vmul(F, d)));
  const tag = (d, kind, text, sideSign) => {
    const [x, y] = axisPt(d);
    // Points behind the wall face are not drawn here (see the side view / readouts).
    const q = vadd(cam, vmul(F, d));
    if (Optics.frontClearance(shape, q.x, q.z) < 0 || x < -20 || x > w + 20 || y < -20 || y > h + 20) return;
    marker(ctx, x, y, kind);
    const lx = x + perp.x * 16 * sideSign, ly = y + perp.z * 16 * sideSign;
    label(ctx, text, lx, ly, colors[kind], perp.x * sideSign >= 0 ? 'left' : 'right');
  };
  tag(o.H, 'hyper', 'Hyperfocal ' + fmtM(o.H), 1);
  if (isFinite(o.far)) tag(o.far, 'far', 'Far ' + fmtM(o.far), -1);
  tag(o.near, 'near', 'Near ' + fmtM(o.near), 1);

  // Focus-plane label at the edge of frame
  const [fx, fy] = P(at(o.s, 1));
  const fp = at(o.s, 1);
  if (Optics.frontClearance(shape, fp.x, fp.z) > 0) label(ctx, 'Focus ' + fmtM(o.s), fx + 6, fy, colors.focus);

  // Subject (top-down person: shoulders + head, facing the camera)
  const sx = V.X(state.subX), sy = V.Y(state.subZ);
  const toCam = Math.atan2(cam.z - state.subZ, cam.x - state.subX);
  const pk = Math.max(V.k, 30);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(toCam);
  ctx.fillStyle = colors.subject;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.12 * pk, 0.25 * pk, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors['canvas-bg'];
  ctx.beginPath(); ctx.arc(0, 0, 0.1 * pk + 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colors.subject;
  ctx.beginPath(); ctx.arc(0, 0, 0.1 * pk, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colors['canvas-bg'];
  ctx.beginPath(); ctx.arc(0.07 * pk, 0, 0.025 * pk, 0, Math.PI * 2); ctx.fill(); // nose
  ctx.restore();
  if (hover.top === 'subject' || drag?.target === 'subject') {
    ctx.strokeStyle = colors.focus;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, 0.28 * pk + 4, 0, Math.PI * 2); ctx.stroke();
  }

  // Camera
  const [cx, cy] = P(cam);
  drawCamera(ctx, cx, cy, Math.atan2(heading.z, heading.x), hover.top === 'camera' || drag?.target === 'camera');
  label(ctx, 'Camera', cx, cy + 26, colors.cam, 'center');
}

/* ------------------------------------------------------------------ */
/* Side view — vertical section along the line of sight               */
/* ------------------------------------------------------------------ */

function drawSide(o) {
  const { ctx, w, h } = prepCanvas(sideCanvas);
  const { tilt } = o.cb;
  const sec = o.section;
  const subDist = Math.hypot(state.subX - state.camX, state.subZ - state.camZ);
  const wallTop = state.wallBottom + state.wallH;

  const sMax = (sec ? Math.min(sec.t, 80) : Math.max(subDist * 1.5, 6)) + 1.2;
  const yMax = Math.max(wallTop, state.camY, state.subH, state.aimH) + 0.8;
  const V = makeView(w, h, -1.2, sMax, -0.4, yMax, true);
  sideView = V;
  drawGrid(ctx, V, w, h);

  // Floor
  ctx.fillStyle = colors.floor;
  ctx.fillRect(0, V.Y(0), w, h - V.Y(0));
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  line(ctx, 0, V.Y(0), w, V.Y(0));

  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const P = (s, y) => [V.X(s), V.Y(y)];
  // Point at axial depth d along the vertical FOV edge `side` (−1 bottom, +1 top), in section coords.
  const at = (d, side) => {
    const a = side * o.tv;
    return P((ct - a * st) * d, state.camY + (st + a * ct) * d);
  };
  const FAR = 400;

  ctx.save();
  ctx.beginPath();
  const clipS = sec ? V.X(sec.t) : w;
  ctx.rect(0, 0, clipS, V.Y(0));
  ctx.clip();

  poly(ctx, [P(0, state.camY), at(FAR, -1), at(FAR, 1)]);
  ctx.fillStyle = colors.frustum;
  ctx.fill();
  ctx.strokeStyle = colors['frustum-line'];
  ctx.lineWidth = 1.5;
  line(ctx, ...P(0, state.camY), ...at(FAR, -1));
  line(ctx, ...P(0, state.camY), ...at(FAR, 1));

  const farD = isFinite(o.far) ? o.far : FAR;
  poly(ctx, [at(o.near, -1), at(o.near, 1), at(farD, 1), at(farD, -1)]);
  ctx.fillStyle = colors.dof;
  ctx.fill();
  ctx.strokeStyle = colors.near;
  line(ctx, ...at(o.near, -1), ...at(o.near, 1));
  if (isFinite(o.far)) line(ctx, ...at(o.far, -1), ...at(o.far, 1));

  ctx.strokeStyle = colors.focus;
  ctx.lineWidth = 2.5;
  line(ctx, ...at(o.s, -1), ...at(o.s, 1));

  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  line(ctx, ...P(0, state.camY), ...P(ct * FAR, state.camY + st * FAR));
  ctx.setLineDash([]);
  ctx.restore();

  // Wall section
  if (sec) {
    const thick = Math.max(0.25, 7 / V.k);
    const x0 = V.X(sec.t), x1 = V.X(sec.t + thick);
    if (sec.onWall) {
      const segH = state.wallH / (WALL_NV - 1);
      for (let j = 0; j < WALL_NV; j++) {
        const v = j / (WALL_NV - 1);
        const y = state.wallBottom + v * state.wallH;
        const n = Optics.wallPlan(o.shape, sec.u);
        const e = evalWallPoint({ p: v3(sec.x, y, sec.z), n: v3(n.nx, 0, n.nz), t: v3(n.tx, 0, n.tz) }, o);
        const y0 = V.Y(Math.min(wallTop, y + segH / 2));
        const y1 = V.Y(Math.max(state.wallBottom, y - segH / 2));
        ctx.fillStyle = e.inFocus ? hazard(ctx) : e.visible ? colors['wall-lit'] : colors.wall;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0 + 0.5);
        if (e.moire >= 2) {
          ctx.fillStyle = e.moire === 3 ? colors['moire-high'] : colors['moire-mid'];
          ctx.fillRect(x0 - 5, y0, 3.5, y1 - y0 + 0.5);
        }
      }
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, V.Y(wallTop), x1 - x0, state.wallH * V.k);
      label(ctx, 'LED wall', x0 - 6, V.Y(wallTop) - 10, colors.muted, 'right');
    } else {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = colors.muted;
      ctx.strokeRect(x0, V.Y(wallTop), x1 - x0, state.wallH * V.k);
      ctx.setLineDash([]);
      label(ctx, 'Line of sight misses the wall', x0 - 6, V.Y(wallTop) - 10, colors.muted, 'right');
    }
  } else {
    label(ctx, 'Line of sight does not reach the wall', w - 12, 16, colors.muted, 'right');
  }

  // Axis markers
  const axisPt = d => P(ct * d, state.camY + st * d);
  const tag = (d, kind, text, dy) => {
    const [x, y] = axisPt(d);
    if (x < -20 || x > w + 20 || y < -20 || y > h + 20) return;
    ctx.globalAlpha = sec && ct * d > sec.t ? 0.45 : 1;
    marker(ctx, x, y, kind);
    label(ctx, text, x, y + dy, colors[kind], 'center');
    ctx.globalAlpha = 1;
  };
  tag(o.H, 'hyper', 'Hyperfocal', -14);
  if (isFinite(o.far)) tag(o.far, 'far', 'Far', 16);
  tag(o.near, 'near', 'Near', 16);
  const [fx, fy] = at(o.s, 1);
  label(ctx, 'Focus', fx, fy - 10, colors.focus, 'center');

  // Subject silhouette (side-on), facing the camera
  const sh = state.subH;
  const headR = 0.11 * sh / 1.8;
  const sx = V.X(subDist);
  ctx.fillStyle = colors.subject;
  ctx.beginPath();
  ctx.arc(sx, V.Y(sh - headR), headR * V.k, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(sx - 0.13 * V.k, V.Y(sh - 2 * headR - 0.04), 0.26 * V.k, (sh - 2 * headR - 0.04) * V.k, 0.08 * V.k);
  ctx.fill();

  // Aim point
  const ax = V.X(subDist), ay = V.Y(state.aimH);
  const aimActive = hover.side === 'aim' || drag?.target === 'aim';
  ctx.strokeStyle = aimActive ? colors.focus : colors.text;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(ax, ay, 6, 0, Math.PI * 2); ctx.stroke();
  line(ctx, ax - 10, ay, ax - 3, ay);
  line(ctx, ax + 3, ay, ax + 10, ay);
  label(ctx, 'Aim', ax + 12, ay, colors.text);

  // Camera on a stand
  const [cx, cy] = P(0, state.camY);
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 2;
  line(ctx, cx, cy, cx, V.Y(0));
  line(ctx, cx - 10, V.Y(0), cx, cy + 20 > V.Y(0) ? V.Y(0) : cy + 20);
  line(ctx, cx + 10, V.Y(0), cx, cy + 20 > V.Y(0) ? V.Y(0) : cy + 20);
  drawCamera(ctx, cx, cy, -tilt, hover.side === 'camera' || drag?.target === 'camera');
  label(ctx, `Tilt ${(tilt * 180 / Math.PI).toFixed(1)}°`, cx + 4, cy - 22, colors.muted);
}

/* ------------------------------------------------------------------ */
/* Readouts, advice and status                                         */
/* ------------------------------------------------------------------ */

function stat(k, v, s = '', bad = false) {
  return `<div class="stat${bad ? ' bad' : ''}"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
}

const MOIRE_LABEL = ['Low', 'Grid visible', 'Moderate', 'High'];
const fmtUm = mm => (mm * 1000).toFixed(1) + ' µm';

function renderReadouts(o) {
  const wall = o.wall;
  const D = wall.minDepth;
  const inShot = wall.visible > 0;
  const hazardOn = wall.inFocus > 0;
  const gap = inShot && isFinite(o.far) ? D - o.far : null;
  const mw = wall.worst;
  const moireOn = wall.moireLevel >= 2;

  document.getElementById('readouts').innerHTML = [
    stat('Horizontal FOV', fmtDeg(o.hfov), `Vertical ${fmtDeg(o.vfov)}`),
    stat('Focus distance', fmtM(o.s), state.focusAuto ? 'following subject' : 'manual'),
    stat('Nearest sharp', fmtM(o.near)),
    stat('Furthest sharp', fmtM(o.far), '', hazardOn),
    stat('Total depth of field', fmtM(o.far - o.near)),
    stat('Hyperfocal distance', fmtM(o.H), `at ${fmtStop(o.N)}`),
    stat('Nearest wall in frame', inShot ? fmtM(D) : '—', inShot ? `furthest ${fmtM(wall.maxDepth)}` : 'wall not in shot', hazardOn),
    stat('Far limit → wall', gap === null ? (inShot ? 'wall sharp' : '—') : (gap >= 0 ? fmtM(gap) : '−' + fmtM(-gap)),
      gap === null ? '' : gap >= 0 ? 'clearance behind DOF' : 'wall is inside DOF', hazardOn),
    stat('Circle of confusion', o.cocMm.toFixed(4) + ' mm', `${o.sen.w.toFixed(2)} × ${o.sen.h.toFixed(2)} mm sensor`),
    stat('Moiré risk', inShot && mw ? MOIRE_LABEL[wall.moireLevel] : '—',
      inShot && mw ? `${Math.round(wall.moireFraction * 100)}% of visible wall at moderate+` : 'wall not in shot', moireOn),
    stat('LED pitch on sensor', mw ? fmtUm(mw.pImgMm) : '—',
      mw ? `${mw.ratio.toFixed(2)} photosites (${fmtUm(o.photositeMm)} each)` : `photosite ${fmtUm(o.photositeMm)}`, moireOn),
    stat('Defocus blur at wall', mw ? fmtUm(mw.blurMm) : '—',
      mw ? `grid contrast left: ${Math.round(mw.contrast * 100)}%` : '', moireOn),
  ].join('');

  // Advice
  const tips = [];
  if (inShot) {
    const { f, c, s, N } = o;
    const maxStop = FSTOPS[FSTOPS.length - 1];
    if (D > s) {
      // Aperture at which the far limit lands exactly on the nearest visible wall.
      const nLimit = Optics.stopForFarLimit(f, c, s, D);
      if (hazardOn) {
        tips.push(nLimit >= FSTOPS[0]
          ? `Open up to wider than <b>${fmtStop(nLimit)}</b> to push the far limit in front of the wall.`
          : `Even wide open (${fmtStop(FSTOPS[0])}) the wall stays sharp at this focus distance — move the subject/camera away from the wall or use a longer lens.`);
      } else if (nLimit <= maxStop) {
        tips.push(`Stopping down past <b>${fmtStop(nLimit)}</b> will bring the wall into focus.`);
      } else {
        tips.push(`The wall stays outside the depth of field at every stop up to ${fmtStop(maxStop)}.`);
      }
      // Furthest focus distance at the current stop before the wall sharpens.
      tips.push(`At ${fmtStop(N)}, keep focus closer than <b>${fmtM(Optics.maxFocusForFarLimit(f, N, c, D))}</b> to keep the wall soft.`);
    } else if (hazardOn) {
      tips.push('Focus is set at or beyond the nearest visible part of the wall — the wall will be sharp.');
    } else {
      tips.push('Focus is set behind the nearest visible part of the wall; that part sits in front of the near limit, so it is soft.');
    }
    if (hazardOn) {
      tips.push(`<b>${Math.round(wall.fraction * 100)}%</b> of the wall visible in frame is inside the depth of field (hazard-striped in both views).`);
    }
    tips.push(`Subject-to-wall gap along the lens axis: <b>${fmtM(D - o.cb.subjectDist)}</b> (nearest visible wall). More gap = softer wall.`);

    // Moiré guidance
    if (moireOn) {
      tips.push(`<b>Moiré ${MOIRE_LABEL[wall.moireLevel].toLowerCase()}:</b> the ${state.pitch} mm LED grid images at ${fmtUm(mw.pImgMm)} ` +
        `(${mw.ratio.toFixed(2)} photosites per LED pixel — finer than the ${Optics.BAYER_LIMIT}-photosite colour sampling limit of a Bayer sensor) ` +
        `and only ${fmtUm(mw.blurMm)} of defocus leaves ${Math.round(mw.contrast * 100)}% grid contrast. Marked with a red/orange strip on the wall.`);
      if (isFinite(wall.safeStop)) {
        tips.push(wall.safeStop >= FSTOPS[0]
          ? `Open up to <b>${fmtStop(wall.safeStop)}</b> or wider to blur the LED grid away (blur ≥ ${Optics.SAFE_BLUR_RATIO}× imaged pitch).`
          : 'Even wide open the LED grid stays resolved — increase the subject-to-wall distance, focus closer, or use a finer-pitch wall.');
      }
    } else if (wall.moireLevel === 1) {
      tips.push(`The LED grid is resolved (${fmtUm(mw.pImgMm)} per LED pixel, ${mw.ratio.toFixed(1)} photosites) — individual LEDs may be visible, but it is sampled finely enough that aliasing is unlikely.`);
    } else if (mw) {
      tips.push(`LED grid is blurred away by defocus (≤ ${Math.round(mw.contrast * 100)}% contrast) — moiré unlikely.`);
    }
  } else {
    tips.push('The LED wall is not in frame — pan the camera toward the wall or widen the lens.');
  }
  document.getElementById('advice').innerHTML = `<h3>Guidance</h3><ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul>`;

  // Status banner
  const el = document.getElementById('status');
  const moireTxt = moireOn ? ` · moiré risk ${MOIRE_LABEL[wall.moireLevel].toLowerCase()}` : '';
  if (!inShot) {
    el.className = 'status neutral';
    el.textContent = 'LED wall not in frame';
  } else if (hazardOn) {
    el.className = 'status hazard';
    el.innerHTML = `<span>⚠ LED wall in focus — ${Math.round(wall.fraction * 100)}% of the visible wall is inside the depth of field${moireTxt}</span>`;
  } else if (moireOn) {
    el.className = 'status warn';
    el.textContent = `⚠ Wall outside the DOF, but moiré risk is ${MOIRE_LABEL[wall.moireLevel].toLowerCase()}`;
  } else {
    el.className = 'status ok';
    el.textContent = gap !== null && gap >= 0
      ? `✓ Wall out of focus — ${fmtM(gap)} beyond the far limit`
      : '✓ Wall out of focus — it sits in front of the near limit';
  }
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

const rows = []; // { spec, range, num, out }

// Log-scale sliders use 0..1000 positions.
const toPos = (spec, v) => spec.log ? Math.round(1000 * Math.log(v / spec.min) / Math.log(spec.max / spec.min)) : v;
const fromPos = (spec, p) => spec.log ? spec.min * Math.pow(spec.max / spec.min, p / 1000) : +p;
const decimals = step => (String(step).split('.')[1] || '').length;

function buildControls() {
  for (const [containerId, specs] of Object.entries(SLIDERS)) {
    const box = document.getElementById(containerId);
    for (const spec of specs) {
      const id = 'in-' + spec.key;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="row-head">
          <label for="${id}">${spec.label}</label>
          <span class="val">${spec.format ? '<output></output>' : `<input type="number" step="${spec.step}"> ${spec.unit}`}</span>
        </div>
        <input id="${id}" type="range">`;
      box.appendChild(row);
      const range = row.querySelector('input[type=range]');
      const num = row.querySelector('input[type=number]');
      const out = row.querySelector('output');
      if (spec.log) { range.min = 0; range.max = 1000; range.step = 1; }
      else { range.min = spec.min; range.max = spec.max; range.step = spec.step; }

      range.addEventListener('input', () => {
        const d = decimals(spec.step);
        set(spec.key, +fromPos(spec, range.value).toFixed(d));
      });
      num?.addEventListener('change', () => {
        if (num.value === '' || !isFinite(+num.value)) return sync();
        set(spec.key, +num.value);
      });
      rows.push({ spec, range, num, out, row });
    }
  }

  const bodySel = document.getElementById('body');
  const groups = [...new Set(CAMERAS.map(c => c.group))];
  bodySel.innerHTML = groups.map(g => `<optgroup label="${g}">` +
    CAMERAS.filter(c => c.group === g).map(c => `<option value="${c.id}">${c.name}</option>`).join('') +
    '</optgroup>').join('');
  bodySel.addEventListener('change', () => {
    const cam = CAMERAS.find(c => c.id === bodySel.value);
    if (cam.id !== 'custom') { state.sensorW = cam.w; state.sensorH = cam.h; state.resH = cam.res; }
    set('body', cam.id);
  });

  const pitchSel = document.getElementById('pitchSel');
  pitchSel.innerHTML = PITCHES.map(p => `<option value="${p}">${p.toFixed(1)} mm</option>`).join('') +
    '<option value="custom">Custom…</option>';
  pitchSel.addEventListener('change', () => {
    if (pitchSel.value === 'custom') { document.getElementById('pitch').focus(); return; }
    set('pitch', +pitchSel.value);
  });

  // Free-entry number boxes. Typing a sensor size switches the camera to "Custom".
  const numberInputs = {
    sensorW: () => { state.body = 'custom'; },
    sensorH: () => { state.body = 'custom'; },
    resH: null, pitch: null, coc: null,
  };
  for (const [key, before] of Object.entries(numberInputs)) {
    const el = document.getElementById(key);
    el.addEventListener('change', () => {
      if (el.value === '' || !isFinite(+el.value) || +el.value <= 0) return sync();
      if (before) before();
      set(key, +el.value);
    });
  }
  for (const key of ['focusAuto', 'cocAuto']) {
    const el = document.getElementById(key);
    el.addEventListener('change', () => set(key, el.checked));
  }
  document.getElementById('reset').addEventListener('click', () => {
    state = { ...DEFAULTS };
    update();
  });
}

function set(key, value) {
  state[key] = value;
  if (key === 'focus') state.focusAuto = false; // moving the focus slider takes manual control
  update();
}

// Keep the scene physically sensible.
function normalise() {
  const s = state;
  for (const row of rows) {
    const { key, min, max } = row.spec;
    if (row.spec.dyn) continue;
    s[key] = clamp(s[key], min, max);
  }
  s.fstopIdx = Math.round(clamp(s.fstopIdx, 0, FSTOPS.length - 1));
  s.curve = Math.round(s.curve);

  const cam = CAMERAS.find(c => c.id === s.body);
  if (!cam) s.body = DEFAULTS.body;
  if (cam && cam.id !== 'custom') { s.sensorW = cam.w; s.sensorH = cam.h; }
  s.sensorW = clamp(s.sensorW, 1, 80);
  s.sensorH = clamp(s.sensorH, 1, 60);
  s.resH = Math.round(clamp(s.resH, 256, 20000));
  s.pitch = clamp(s.pitch, 0.3, 20);
  s.coc = clamp(s.coc, 0.002, 0.1);

  // Camera and subject stay on the stage, in front of the LED face.
  const b = stageBounds();
  const shape = wallShape();
  for (const [kx, kz, margin] of [['camX', 'camZ', 0.3], ['subX', 'subZ', 0.2]]) {
    let x = clamp(s[kx], b.xmin, b.xmax), z = clamp(s[kz], b.zmin, b.zmax);
    ({ x, z } = Optics.keepInFront(shape, x, z, margin));
    s[kx] = +x.toFixed(2);
    s[kz] = +z.toFixed(2);
  }
}

function sync(o) {
  const b = stageBounds();
  for (const { spec, range, num, out } of rows) {
    if (spec.dyn === 'x') { range.min = b.xmin; range.max = b.xmax; }
    if (spec.dyn === 'z') { range.min = b.zmin; range.max = b.zmax; }
    const v = state[spec.key];
    range.value = toPos(spec, v);
    if (num && document.activeElement !== num) num.value = (+v).toFixed(decimals(spec.step));
    if (out) out.textContent = spec.format(v);
  }
  const focusRow = rows.find(r => r.spec.key === 'focus');
  focusRow.row.classList.toggle('following', state.focusAuto);

  document.getElementById('body').value = state.body;
  for (const key of ['sensorW', 'sensorH', 'resH', 'pitch']) document.getElementById(key).value = state[key];
  const preset = PITCHES.find(p => Math.abs(p - state.pitch) < 1e-9);
  document.getElementById('pitchSel').value = preset !== undefined ? String(preset) : 'custom';
  const shape = wallShape();
  document.getElementById('curve-info').textContent = shape.flat
    ? 'Flat wall. Positive = concave (wraps around the stage), negative = convex.'
    : `${state.curve > 0 ? 'Concave' : 'Convex'} arc · radius ${Math.abs(shape.R).toFixed(2)} m · chord ${(2 * Math.abs(shape.R) * Math.sin(Math.abs(shape.theta) / 2)).toFixed(2)} m`;
  document.getElementById('focusAuto').checked = state.focusAuto;
  document.getElementById('cocAuto').checked = state.cocAuto;
  const cocEl = document.getElementById('coc');
  cocEl.disabled = state.cocAuto;
  if (o && document.activeElement !== cocEl) cocEl.value = o.cocMm.toFixed(4);
  if (o) {
    const diag = Math.hypot(o.sen.w, o.sen.h);
    document.getElementById('sensor-info').textContent =
      `Diagonal ${diag.toFixed(1)} mm · crop ${(43.27 / diag).toFixed(2)}× vs full frame · photosite ${fmtUm(o.photositeMm)}`;
  }
}

/* ------------------------------------------------------------------ */
/* Dragging                                                            */
/* ------------------------------------------------------------------ */

function localPos(cv, e) {
  const r = cv.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function hitTop(sx, sy) {
  const V = topView;
  if (!V) return null;
  const dCam = Math.hypot(sx - V.X(state.camX), sy - V.Y(state.camZ));
  const dSub = Math.hypot(sx - V.X(state.subX), sy - V.Y(state.subZ));
  const R = 22;
  if (dCam < R && dCam <= dSub) return 'camera';
  if (dSub < R) return 'subject';
  return null;
}

function hitSide(sx, sy) {
  const V = sideView;
  if (!V) return null;
  const subDist = Math.hypot(state.subX - state.camX, state.subZ - state.camZ);
  const dCam = Math.hypot(sx - V.X(0), sy - V.Y(state.camY));
  const dAim = Math.hypot(sx - V.X(subDist), sy - V.Y(state.aimH));
  if (dAim < 16) return 'aim';
  if (dCam < 22) return 'camera';
  return null;
}

function setupDrag(cv, which) {
  const hit = which === 'top' ? hitTop : hitSide;
  cv.addEventListener('pointerdown', e => {
    const [sx, sy] = localPos(cv, e);
    const target = hit(sx, sy);
    if (!target) return;
    drag = { which, target };
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
    update();
  });
  cv.addEventListener('pointermove', e => {
    const [sx, sy] = localPos(cv, e);
    if (drag && drag.which === which) {
      if (which === 'top') {
        const V = topView;
        const x = +V.A(sx).toFixed(2), z = +V.B(sy).toFixed(2);
        if (drag.target === 'camera') { state.camX = x; state.camZ = z; }
        else { state.subX = x; state.subZ = z; }
      } else {
        const y = +sideView.B(sy).toFixed(2);
        if (drag.target === 'camera') state.camY = y;
        else state.aimH = y;
      }
      update();
      return;
    }
    const h = hit(sx, sy);
    if (h !== hover[which]) {
      hover[which] = h;
      cv.style.cursor = h ? 'grab' : 'default';
      update(false);
    }
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    update();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => {
    if (hover[which] && !drag) { hover[which] = null; update(false); }
  });
}

/* ------------------------------------------------------------------ */
/* URL state (shareable links)                                         */
/* ------------------------------------------------------------------ */

function loadHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  for (const k of Object.keys(DEFAULTS)) {
    if (!p.has(k)) continue;
    const v = p.get(k), d = DEFAULTS[k];
    if (typeof d === 'number') state[k] = isFinite(+v) && v !== '' ? +v : d;
    else if (typeof d === 'boolean') state[k] = v === '1';
    else state[k] = v;
  }
}

let hashTimer = null;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const p = new URLSearchParams();
    for (const k of Object.keys(DEFAULTS)) {
      const v = state[k];
      p.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'number' ? String(+v.toFixed(3)) : v);
    }
    history.replaceState(null, '', '#' + p.toString());
  }, 250);
}

/* ------------------------------------------------------------------ */
/* Main loop                                                           */
/* ------------------------------------------------------------------ */

function update(persist = true) {
  normalise();
  const o = compute();
  drawTop(o);
  drawSide(o);
  renderReadouts(o);
  sync(o);
  if (persist) saveHash();
}

function init() {
  readColors();
  loadHash();
  buildControls();
  setupDrag(topCanvas, 'top');
  setupDrag(sideCanvas, 'side');
  new ResizeObserver(() => update(false)).observe(document.querySelector('.views'));
  // Redraw with the new colours when the theme changes: the system setting,
  // or data-theme on <html> (set by the Virtual Film Tools header switch).
  const onThemeChange = () => {
    readColors();
    hazardCache.delete(topCanvas.getContext('2d'));
    hazardCache.delete(sideCanvas.getContext('2d'));
    update(false);
  };
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onThemeChange);
  new MutationObserver(onThemeChange).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  update();
}

init();
