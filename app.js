'use strict';

/*
 * DoFoVision — LED wall focus planner
 *
 * World coordinates (metres):
 *   x — across the stage (left/right), main wall centred on x = 0
 *   y — height above the floor
 *   z — distance in front of the wall; the centre of the main wall face sits at z = 0
 *
 * Every LED surface (the main wall, wild walls, the ceiling) goes through the same
 * analysis: sampled on a grid, tested against the frame, the depth of field and moiré.
 * The optics and geometry maths live in optics.js (unit-tested in tests/).
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

// One-tap choices in simple mode.
const FOCALS = [18, 24, 28, 35, 50, 65, 85, 100, 135];
const FULL_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];

const NEW_WILD = () => ({ x: -4.5, z: 4, rot: 90, w: 4, h: 3, b: 0 });

// Every key here is a URL-hash key: add new keys rather than renaming old ones.
const DEFAULTS = {
  mode: 'simple',
  wallW: 10, wallH: 4, wallBottom: 0, curve: 0, pitch: 1.5, wallZ: 0,
  wallMode: 'simple', wallPts: [],
  wildOn: false, wild: [],
  ceilOn: false, ceil: { x: 0, z: 3, w: 10, d: 6, h: 4.5, rot: 0 }, ceilPitch: 2.6,
  camX: 0, camZ: 7, camY: 1.5,
  subX: 0.5, subZ: 4, subH: 1.8, aimH: 1.6,
  body: 'alexa35', sensorW: 27.99, sensorH: 19.22, resH: 4608,
  focal: 35, fstopIdx: FSTOPS.indexOf(2.8), fstop: 0, // fstop > 0: exact (de-clicked) f-number from dragging near/far
  focusAuto: true, focus: 3,
  cocAuto: true, coc: 0.025,
  stageDepth: 12,
};

const ceilSpec = (k, label, min, max, step, unit, dyn) =>
  ({ label, min, max, step, unit, dyn, get: () => state.ceil[k], set: v => { state.ceil[k] = v; } });

const SLIDERS = {
  'ctl-wall-simple': [
    { key: 'wallW', label: 'Width', min: 1, max: 30, step: 0.1, unit: 'm' },
    { key: 'curve', label: 'Curvature (total arc)', min: -90, max: 300, step: 1, unit: '°' },
    { key: 'wallZ', label: 'Position back / forward (Z)', min: -10, max: 20, step: 0.05, unit: 'm' },
  ],
  'ctl-wall': [
    { key: 'wallH', label: 'Height', min: 0.5, max: 12, step: 0.1, unit: 'm' },
    { key: 'wallBottom', label: 'Bottom edge above floor', min: 0, max: 3, step: 0.05, unit: 'm' },
  ],
  'ctl-ceil': [
    ceilSpec('h', 'Height above floor', 1.5, 12, 0.05, 'm'),
    ceilSpec('w', 'Width', 1, 30, 0.1, 'm'),
    ceilSpec('d', 'Depth', 1, 30, 0.1, 'm'),
    ceilSpec('x', 'Centre across stage (X)', -15, 15, 0.05, 'm', 'x'),
    ceilSpec('z', 'Centre from wall (Z)', -5, 30, 0.05, 'm', 'z'),
    ceilSpec('rot', 'Angle', -180, 180, 1, '°'),
  ],
  'ctl-camera': [
    { key: 'camX', label: 'Position across stage (X)', min: -10, max: 10, step: 0.05, unit: 'm', dyn: 'x' },
    { key: 'camZ', label: 'Distance from wall centre (Z)', min: -20, max: 12, step: 0.05, unit: 'm', dyn: 'z' },
    { key: 'camY', label: 'Lens height', min: 0.1, max: 6, step: 0.05, unit: 'm' },
  ],
  'ctl-lens': [
    { key: 'focal', label: 'Focal length', min: 8, max: 300, step: 1, unit: 'mm', log: true },
    { key: 'fstopIdx', label: 'Aperture', min: 0, max: FSTOPS.length - 1, step: 1, format: () => fmtStop(apertureN()) },
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
  // Simple mode: the few controls needed on set.
  's-focus': [
    { key: 'focus', label: 'Focus distance', min: 0.3, max: 60, step: 0.01, unit: 'm', log: true },
  ],
  // Distances from the wall's centre line, wherever the wall has been moved to.
  's-place': [
    { label: 'Talent → wall', min: 0.2, max: 30, step: 0.05, unit: 'm', get: () => state.subZ - wallRefZ(), set: v => { state.subZ = v + wallRefZ(); } },
    { label: 'Camera → wall', min: 0.3, max: 30, step: 0.05, unit: 'm', get: () => state.camZ - wallRefZ(), set: v => { state.camZ = v + wallRefZ(); } },
  ],
};

let state = structuredClone(DEFAULTS);
let lastO = null; // most recent compute() result, for dragging the depth of field

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
const DEG = Math.PI / 180;
const wrapDeg = a => ((((a + 180) % 360) + 360) % 360) - 180;

/* ------------------------------------------------------------------ */
/* Scene model                                                         */
/* ------------------------------------------------------------------ */

const wallShape = () => Optics.wallShape(state.wallW, state.curve);
const wallRefZ = () => (state.wallMode === 'custom' ? 0 : state.wallZ);

// The main wall: flat/curved (simple) or a chain of flat panels (custom).
function mainWall() {
  if (state.wallMode === 'custom') {
    const poly = Optics.polyBuild(state.wallPts);
    return {
      custom: true, poly, L: poly.L,
      plan: u => Optics.polyAt(poly, u),
      clearance: (x, z) => Optics.polyClearance(poly, x, z),
      keepInFront: (x, z, m) => Optics.polyKeepInFront(poly, x, z, m),
      ray: (ox, oz, dx, dz) => Optics.rayPoly(poly, ox, oz, dx, dz),
    };
  }
  // Flat/curved shapes are built centred on z = 0, then moved back or forward by wallZ.
  const shape = wallShape();
  const off = state.wallZ;
  return {
    custom: false, shape, L: state.wallW, off,
    plan: u => { const p = Optics.wallPlan(shape, u); return { ...p, z: p.z + off }; },
    clearance: (x, z) => Optics.frontClearance(shape, x, z - off),
    keepInFront: (x, z, m) => { const p = Optics.keepInFront(shape, x, z - off, m); return { x: p.x, z: p.z + off }; },
    ray: (ox, oz, dx, dz) => { const h = Optics.rayWall(shape, ox, oz - off, dx, dz); return h && { ...h, z: h.z + off }; },
  };
}

// All LED surfaces in the scene. kind 'v' = vertical (walls), 'h' = horizontal (ceiling).
function surfaces() {
  const mw = mainWall();
  const list = [{
    id: 'wall', name: 'LED wall', short: 'wall', kind: 'v', main: true, mw,
    plan: mw.plan, L: mw.L, bottom: state.wallBottom, height: state.wallH, pitch: state.pitch, nu: 161, nv: 61,
  }];
  if (state.wildOn) {
    state.wild.forEach((w, i) => {
      const poly = Optics.polyBuild(Optics.panelPoints(w.x, w.z, w.rot, w.w));
      list.push({
        id: 'wild' + i, idx: i, name: `Wild wall ${i + 1}`, short: `wild wall ${i + 1}`, kind: 'v', poly,
        plan: u => Optics.polyAt(poly, u), ray: (ox, oz, dx, dz) => Optics.rayPoly(poly, ox, oz, dx, dz),
        L: w.w, bottom: w.b, height: w.h, pitch: state.pitch, nu: 61, nv: 41,
      });
    });
  }
  if (state.ceilOn) {
    const c = state.ceil;
    list.push({
      id: 'ceil', name: 'LED ceiling', short: 'ceiling', kind: 'h', c,
      corners: Optics.rectCorners(c.x, c.z, c.w, c.d, c.rot), pitch: state.ceilPitch, nu: 41, nv: 41,
    });
  }
  return list;
}

// A point on a surface. u, v ∈ [0, 1]. Walls: u left→right, v bottom→top.
// Ceiling: u across its width, v across its depth; the LED face points down.
function surfPoint(S, u, v) {
  if (S.kind === 'v') {
    const p = S.plan(u);
    return { p: v3(p.x, S.bottom + v * S.height, p.z), n: v3(p.nx, 0, p.nz), t: v3(p.tx, 0, p.tz), pitchM: S.pitch / 1000 };
  }
  const c = S.c, a = c.rot * DEG, ca = Math.cos(a), sa = Math.sin(a);
  const lx = (u - 0.5) * c.w, lz = (v - 0.5) * c.d;
  return {
    p: v3(c.x + lx * ca + lz * sa, c.h, c.z - lx * sa + lz * ca), n: v3(0, -1, 0),
    t: v3(ca, 0, -sa), t2: v3(sa, 0, ca), pitchM: S.pitch / 1000,
  };
}

// Main-wall point for a flat/curved shape (kept for the smoke test's cross-checks).
function wallPoint(shape, u, v) {
  const p = Optics.wallPlan(shape, u);
  return { p: v3(p.x, state.wallBottom + v * state.wallH, p.z), n: v3(p.nx, 0, p.nz), t: v3(p.tx, 0, p.tz) };
}

// World rectangle shown in the top view (also the limits for moving things around).
function stageBounds() {
  let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
  const take = (x, z) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); };
  const mw = mainWall();
  for (let i = 0; i <= 40; i++) {
    const p = mw.plan(i / 40);
    take(p.x, p.z);
    take(p.x - 0.3 * p.nx, p.z - 0.3 * p.nz);
  }
  if (state.wildOn) for (const w of state.wild) for (const q of Optics.panelPoints(w.x, w.z, w.rot, w.w)) take(q.x, q.z);
  if (state.ceilOn) for (const q of Optics.rectCorners(state.ceil.x, state.ceil.z, state.ceil.w, state.ceil.d, state.ceil.rot)) take(q.x, q.z);
  const half = Math.max(Math.abs(minX) + 2, Math.abs(maxX) + 2, 4);
  return { xmin: -half, xmax: half, zmin: Math.min(-1, minZ - 0.8), zmax: Math.max(state.stageDepth, maxZ + 1) };
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
  const N = apertureN();

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
  o.surfs = surfaces();
  o.results = o.surfs.map(S => analyseSurface(S, o));
  o.main = o.results[0];
  o.wall = mergeResults(o.results);
  o.sections = sightSections(o);
  o.section = o.sections.main; // where the line of sight meets the main wall
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

// Classify a point on an LED surface: in frame? inside the DOF? moiré risk?
function evalWallPoint(wp, o) {
  const { p, n } = wp;
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

// Moiré estimate at a surface point: image the LED pitch along both grid axes,
// compare with the sensor photosite pitch and the defocus blur there.
function moireAt(wp, o, depth) {
  const blurMm = Optics.blurDiameter(o.f, o.N, o.s, depth) * 1000;
  const pitchM = wp.pitchM ?? o.pitchM;
  const s0 = toSensor(wp.p, o);
  let worst = null;
  for (const axis of [wp.t, wp.t2 || v3(0, 1, 0)]) {
    const s1 = toSensor(vadd(wp.p, vmul(axis, pitchM)), o);
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

// Kept as constants for the main wall's sampling density.
const WALL_NU = 161;
const WALL_NV = 61;

function analyseSurface(S, o) {
  const cols = [];
  const cells = S.kind === 'h' ? [] : null;
  let visible = 0, inFocus = 0, moireCount = 0, minDepth = Infinity, maxDepth = -Infinity;
  let worst = null;     // sample with the highest moiré level / contrast
  let safeStop = Infinity; // widest-needed f-number that blurs away all near-Nyquist grid
  for (let i = 0; i < S.nu; i++) {
    const u = i / (S.nu - 1);
    const col = { u, visible: false, inFocus: false, moire: 0 };
    const row = cells ? [] : null;
    for (let j = 0; j < S.nv; j++) {
      const e = evalWallPoint(surfPoint(S, u, j / (S.nv - 1)), o);
      if (row) row.push(e);
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
    if (cells) cells.push(row);
  }
  return {
    S, cols, cells, visible, inFocus, moireCount, minDepth, maxDepth, worst, safeStop,
    fraction: visible ? inFocus / visible : 0,
    moireFraction: visible ? moireCount / visible : 0,
    moireLevel: worst ? worst.moire : 0,
  };
}

// One summary over every surface, shaped like a single surface's result.
function mergeResults(results) {
  const m = { cols: results[0].cols, visible: 0, inFocus: 0, moireCount: 0, minDepth: Infinity, maxDepth: -Infinity, worst: null, safeStop: Infinity };
  for (const r of results) {
    m.visible += r.visible; m.inFocus += r.inFocus; m.moireCount += r.moireCount;
    m.minDepth = Math.min(m.minDepth, r.minDepth); m.maxDepth = Math.max(m.maxDepth, r.maxDepth);
    m.safeStop = Math.min(m.safeStop, r.safeStop);
    if (r.worst && (!m.worst || r.worst.moire > m.worst.moire || (r.worst.moire === m.worst.moire && r.worst.contrast > m.worst.contrast))) m.worst = r.worst;
  }
  m.fraction = m.visible ? m.inFocus / m.visible : 0;
  m.moireFraction = m.visible ? m.moireCount / m.visible : 0;
  m.moireLevel = m.worst ? m.worst.moire : 0;
  m.hot = results.filter(r => r.inFocus > 0).map(r => r.S.short);
  return m;
}

// Where the vertical plane through the line of sight meets each surface.
function sightSections(o) {
  const h = o.cb.heading;
  const out = { main: null, walls: [], ceil: null };
  for (const S of o.surfs) {
    if (S.main) {
      out.main = S.mw.ray(state.camX, state.camZ, h.x, h.z);
      if (out.main) out.walls.push({ S, hit: out.main });
    } else if (S.kind === 'v') {
      const hit = S.ray(state.camX, state.camZ, h.x, h.z);
      if (hit) out.walls.push({ S, hit });
    } else {
      // Traced both ways, so a ceiling over or behind the camera shows in full
      // (negative t = behind the camera).
      const iv = Optics.rayConvexInterval(S.corners, state.camX, state.camZ, h.x, h.z);
      const back = Optics.rayConvexInterval(S.corners, state.camX, state.camZ, -h.x, -h.z);
      if (iv || back) out.ceil = { S, t0: back ? -back[1] : iv[0], t1: iv ? iv[1] : -back[0] };
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Depth of field dragging                                             */
/* ------------------------------------------------------------------ */

// The aperture in use: a de-clicked value set by dragging, else the chosen third stop.
const apertureN = () => (state.fstop > 0 ? state.fstop : FSTOPS[state.fstopIdx]);

const nearestStopIdx = N => {
  let best = 0;
  FSTOPS.forEach((n, i) => { if (Math.abs(Math.log(n / N)) < Math.abs(Math.log(FSTOPS[best] / N))) best = i; });
  return best;
};

// Drag the near limit, far limit or focus point to axial depth d.
// Near and far work like opening up or stopping down on set: the focus stays
// where it is, the aperture that puts the dragged limit at d is worked out
// (rounded to the nearest third stop), and the other limit follows.
// Dragging the focus point moves the focus and keeps the aperture.
function dragDepth(which, d) {
  const o = lastO;
  if (!o) return;
  d = clamp(d, o.f * 3, 1000);
  if (which === 'focus') { state.focusAuto = false; state.focus = +clamp(d, 0.3, 60).toFixed(2); return; }
  const s = o.s;
  let N;
  if (which === 'near') {
    N = Optics.stopForNearLimit(o.f, o.c, s, Math.min(d, s * 0.98));
  } else if (d > 200) {
    N = (o.f * o.f) / (o.c * (s - o.f)); // far limit at infinity: focus at the hyperfocal distance
  } else {
    N = Optics.stopForFarLimit(o.f, o.c, s, Math.max(d, s * 1.02));
  }
  N = clamp(N, FSTOPS[0], FSTOPS[FSTOPS.length - 1]);
  state.fstop = +N.toFixed(3); // de-clicked: the limit follows the pointer smoothly
  state.fstopIdx = nearestStopIdx(N);
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
const listText = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

/* ------------------------------------------------------------------ */
/* Canvas helpers                                                      */
/* ------------------------------------------------------------------ */

let colors = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const names = ['canvas-bg', 'grid', 'floor', 'text', 'muted', 'wall', 'wall-lit', 'frustum',
    'frustum-line', 'dof', 'focus', 'near', 'far', 'hyper', 'cam', 'subject', 'hazard-a', 'hazard-b',
    'moire-high', 'moire-mid', 'handle', 'ceil'];
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
  if (!(V.k > 0)) return; // canvas too small to draw (e.g. hidden)
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
  ctx.font = `600 ${Math.round(11 * ui())}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = colors['canvas-bg'];
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Bigger glyphs and grab areas in simple mode and on touch screens.
const coarse = window.matchMedia('(pointer: coarse)');
const ui = () => (state.mode === 'simple' ? 1.35 : 1) * (coarse.matches ? 1.15 : 1);
const grabR = () => 18 * ui();

function marker(ctx, x, y, kind, active) {
  const k = ui();
  ctx.lineWidth = 2;
  if (kind === 'near') {
    ctx.fillStyle = colors.near;
    ctx.beginPath(); ctx.arc(x, y, 4.5 * k, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'far') {
    ctx.fillStyle = colors.far;
    ctx.strokeStyle = colors.far;
    ctx.beginPath(); ctx.arc(x, y, 3.5 * k, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 7 * k, 0, Math.PI * 2); ctx.stroke();
  } else if (kind === 'hyper') {
    ctx.fillStyle = colors.hyper;
    poly(ctx, [[x, y - 6], [x + 6, y], [x, y + 6], [x - 6, y]]);
    ctx.fill();
  } else if (kind === 'focus') {
    ctx.strokeStyle = colors.focus;
    ctx.beginPath(); ctx.arc(x, y, 5 * k, 0, Math.PI * 2); ctx.stroke();
    line(ctx, x - 8 * k, y, x + 8 * k, y);
    line(ctx, x, y - 8 * k, x, y + 8 * k);
  }
  if (active) grabRing(ctx, x, y, colors[kind]);
}

function grabRing(ctx, x, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.arc(x, y, grabR(), 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// Square drag handle (custom wall points, wild walls, ceiling).
function handle(ctx, x, y, active, round) {
  const s = 6 * ui();
  ctx.fillStyle = active ? colors.focus : colors.handle;
  ctx.strokeStyle = colors['canvas-bg'];
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (round) ctx.arc(x, y, s, 0, Math.PI * 2); else ctx.rect(x - s, y - s, 2 * s, 2 * s);
  ctx.fill(); ctx.stroke();
}

// Camera glyph at screen (x, y) pointing along screen angle `ang`.
function drawCamera(ctx, x, y, ang, active) {
  const k = ui();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(k, k);
  ctx.fillStyle = colors.cam;
  ctx.strokeStyle = colors['canvas-bg'];
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-16, -8, 20, 16, 3);
  ctx.fill(); ctx.stroke();
  poly(ctx, [[4, -4], [13, -8], [13, 8], [4, 4]]);
  ctx.fill(); ctx.stroke();
  ctx.restore();
  if (active) grabRing(ctx, x, y, colors.focus);
}

/* ------------------------------------------------------------------ */
/* Top view                                                            */
/* ------------------------------------------------------------------ */

const topCanvas = document.getElementById('top');
const sideCanvas = document.getElementById('side');
let topView = null, sideView = null;
let hover = { top: null, side: null };
let drag = null;
let handles = { top: [], side: [] }; // grab points registered while drawing, in priority order

const isActive = (which, id) => hover[which] === id || drag?.target === id;

// The stage side of the main wall's (extended) surface: what the camera can "see".
function frontClip(ctx, V, mw, w, h) {
  ctx.beginPath();
  if (!mw.custom) {
    const shape = mw.shape, off = mw.off;
    if (shape.flat) ctx.rect(0, V.Y(off), w, h);
    else if (shape.R > 0) ctx.arc(V.X(0), V.Y(shape.R + off), shape.R * V.k, 0, Math.PI * 2);
    else { ctx.rect(0, 0, w, h); ctx.arc(V.X(0), V.Y(shape.R + off), -shape.R * V.k, 0, Math.PI * 2, true); }
    ctx.clip('evenodd');
    return;
  }
  const segs = mw.poly.segs;
  if (!segs.length) { ctx.rect(0, 0, w, h); ctx.clip(); return; }
  const BIG = 1000, a = segs[0], b = segs[segs.length - 1];
  let nx = 0, nz = 0;
  for (const g of segs) { nx += g.nx * g.len; nz += g.nz * g.len; }
  const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
  const pts = [{ x: a.x0 - a.tx * BIG, z: a.z0 - a.tz * BIG }, ...mw.poly.pts, { x: b.x1 + b.tx * BIG, z: b.z1 + b.tz * BIG }];
  const endA = pts[pts.length - 1], startA = pts[0];
  pts.push({ x: endA.x + nx * BIG, z: endA.z + nz * BIG }, { x: startA.x + nx * BIG, z: startA.z + nz * BIG });
  poly(ctx, pts.map(p => [V.X(p.x), V.Y(p.z)]));
  ctx.clip();
}

// Moiré band: width and gap from the LED face, in screen pixels.
const MOIRE_W = 8, MOIRE_GAP = 4;

// A vertical LED surface in plan: one slab per analysed column, behind the face.
function drawWallPlan(ctx, V, res, thick) {
  const S = res.S;
  const du = 0.5 / (S.nu - 1);
  const face = u => S.plan(clamp(u, 0, 1));
  const quad = (u0, u1, off0, off1) => {
    const a = face(u0), c = face(u1);
    return [
      [V.X(a.x - a.nx * off0), V.Y(a.z - a.nz * off0)], [V.X(c.x - c.nx * off0), V.Y(c.z - c.nz * off0)],
      [V.X(c.x - c.nx * off1), V.Y(c.z - c.nz * off1)], [V.X(a.x - a.nx * off1), V.Y(a.z - a.nz * off1)],
    ];
  };
  for (const col of res.cols) {
    poly(ctx, quad(col.u - du, col.u + du, 0, thick));
    ctx.fillStyle = col.inFocus ? hazard(ctx) : col.visible ? colors['wall-lit'] : colors.wall;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.6;
    ctx.fill();
    ctx.stroke();
  }
  // Moiré band on the stage side of the face: wide, and held clear of the wall by a
  // gap so it reads separately from the hazard stripes. Labelled once per surface.
  let moireMid = null;
  for (const col of res.cols) {
    if (col.moire < 2) continue;
    poly(ctx, quad(col.u - du, col.u + du, -MOIRE_GAP / V.k, -(MOIRE_GAP + MOIRE_W) / V.k));
    ctx.fillStyle = col.moire === 3 ? colors['moire-high'] : colors['moire-mid'];
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.6;
    ctx.fill();
    ctx.stroke();
    if (!moireMid || Math.abs(col.u - 0.5) < Math.abs(moireMid.u - 0.5)) moireMid = col;
  }
  if (moireMid) {
    const p = face(moireMid.u), off = (MOIRE_GAP + MOIRE_W + 9) / V.k;
    label(ctx, moireMid.moire === 3 ? 'Moiré high' : 'Moiré', V.X(p.x + p.nx * off), V.Y(p.z + p.nz * off),
      colors[moireMid.moire === 3 ? 'moire-high' : 'moire-mid'], 'center');
  }
  ctx.beginPath();
  const n = 80;
  for (let i = 0; i <= n; i++) { const p = face(i / n); ctx[i ? 'lineTo' : 'moveTo'](V.X(p.x), V.Y(p.z)); }
  for (let i = n; i >= 0; i--) { const p = face(i / n); ctx.lineTo(V.X(p.x - p.nx * thick), V.Y(p.z - p.nz * thick)); }
  ctx.closePath();
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// The ceiling in plan: a translucent grid over everything, hazard where it is in focus.
function drawCeilPlan(ctx, V, res) {
  const S = res.S, n = S.nu - 1, m = S.nv - 1;
  const at = (u, v) => { const q = surfPoint(S, u, v).p; return [V.X(q.x), V.Y(q.z)]; };
  ctx.save();
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const e = res.cells[i][j];
    if (!e.visible) continue;
    poly(ctx, [at(i / n, j / m), at((i + 1) / n, j / m), at((i + 1) / n, (j + 1) / m), at(i / n, (j + 1) / m)]);
    ctx.globalAlpha = e.inFocus ? 0.75 : e.moire >= 2 ? 0.7 : 0.28;
    ctx.fillStyle = e.inFocus ? hazard(ctx) : e.moire >= 2 ? colors['moire-mid'] : colors.ceil;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  poly(ctx, S.corners.map(q => [V.X(q.x), V.Y(q.z)]));
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = colors.ceil;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawTop(o) {
  const { ctx, w, h } = prepCanvas(topCanvas);
  if (w < 40 || h < 40) return; // hidden or not laid out yet
  const b = stageBounds();
  const V = makeView(w, h, b.xmin, b.xmax, b.zmin, b.zmax, false);
  topView = V;
  const H = [];
  const mw = o.main.S.mw;
  const adv = state.mode === 'advanced';
  drawGrid(ctx, V, w, h);

  const { cam, F, R, heading } = o.cb;
  const P = p => [V.X(p.x), V.Y(p.z)];
  const at = (d, side) => vadd(cam, vmul(vadd(F, vmul(R, side * o.th)), d)); // point at axial depth d on a FOV edge
  const FAR = 400;

  ctx.save();
  frontClip(ctx, V, mw, w, h);

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

  // LED walls
  const thick = Math.max(0.25, 7 / V.k);
  for (const res of o.results) if (res.S.kind === 'v') drawWallPlan(ctx, V, res, thick);

  // Main wall label (and panel lengths for a custom shape)
  let top = Infinity, mid = { x: 0, z: 0 };
  for (let i = 0; i <= 40; i++) { const p = mw.plan(i / 40); if (p.z - thick < top) top = p.z - thick; }
  const c0 = mw.plan(0.5); mid = { x: c0.x, z: top };
  const curveTxt = mw.custom ? ` · ${mw.poly.segs.length} flat sections` : mw.shape.flat ? '' : ` · ${Math.abs(state.curve)}° ${state.curve > 0 ? 'concave' : 'convex'}`;
  label(ctx, `LED wall ${mw.L.toFixed(1)} m × ${state.wallH.toFixed(1)} m${curveTxt}`,
    V.X(mid.x), Math.max(12, V.Y(Math.min(top, wallRefZ())) - 9), colors.muted, 'center');
  if (mw.custom && adv) {
    for (const g of mw.poly.segs) {
      // On the stage side of each run, clear of the wall's own label behind it.
      const mx = (g.x0 + g.x1) / 2 + g.nx * 14 / V.k, mz = (g.z0 + g.z1) / 2 + g.nz * 14 / V.k;
      label(ctx, g.len.toFixed(2) + ' m', V.X(mx), V.Y(mz), colors.muted, 'center');
    }
  }
  // Wild wall labels
  for (const res of o.results) {
    if (!res.S.id.startsWith('wild')) continue;
    const p = res.S.plan(0.5);
    label(ctx, `Wild ${res.S.idx + 1}`, V.X(p.x - p.nx * (thick + 0.4)), V.Y(p.z - p.nz * (thick + 0.4)), colors.muted, 'center');
  }

  // Ceiling (overhead, so drawn over the floor plan)
  const ceilRes = o.results.find(r => r.S.kind === 'h');
  if (ceilRes) {
    drawCeilPlan(ctx, V, ceilRes);
    const c = state.ceil;
    label(ctx, `LED ceiling at ${c.h.toFixed(2)} m`, V.X(c.x), V.Y(c.z) - 16 * ui(), colors.ceil, 'center');
  }

  // Axis markers (projected onto the floor plan)
  const perp = { x: -heading.z, z: heading.x };
  const axisPt = d => P(vadd(cam, vmul(F, d)));
  const tag = (d, kind, text, sideSign, grab) => {
    const [x, y] = axisPt(d);
    // Points behind the wall face are not drawn here (see the side view / readouts).
    const q = vadd(cam, vmul(F, d));
    if (mw.clearance(q.x, q.z) < 0 || x < -20 || x > w + 20 || y < -20 || y > h + 20) return;
    marker(ctx, x, y, kind, grab && isActive('top', kind));
    const lx = x + perp.x * 18 * ui() * sideSign, ly = y + perp.z * 18 * ui() * sideSign;
    label(ctx, text, lx, ly, colors[kind], perp.x * sideSign >= 0 ? 'left' : 'right');
    if (grab) H.push({ id: kind, x, y });
  };
  if (adv) tag(o.H, 'hyper', 'Hyperfocal ' + fmtM(o.H), 1, false);
  if (isFinite(o.far)) tag(o.far, 'far', 'Far ' + fmtM(o.far), -1, true);
  tag(o.near, 'near', 'Near ' + fmtM(o.near), 1, true);
  tag(o.s, 'focus', '', 1, true); // the point of focus on the lens axis

  // Focus plane: label and grab point at the edge of frame
  const fp = at(o.s, 1);
  const [fx, fy] = P(fp);
  if (mw.clearance(fp.x, fp.z) > 0) {
    label(ctx, 'Focus ' + fmtM(o.s), fx + 8, fy, colors.focus);
    // The edge of the focus line is a second grab point (the axis one can sit under the talent).
    if (isActive('top', 'focus')) grabRing(ctx, fx, fy, colors.focus);
    H.push({ id: 'focus', x: fx, y: fy, alt: true });
  }

  // Subject (top-down person: shoulders + head, facing the camera)
  const sx = V.X(state.subX), sy = V.Y(state.subZ);
  const toCam = Math.atan2(cam.z - state.subZ, cam.x - state.subX);
  const pk = Math.max(V.k, 30) * (state.mode === 'simple' ? 1.2 : 1);
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
  if (isActive('top', 'subject')) grabRing(ctx, sx, sy, colors.focus);

  // Camera
  const [cx, cy] = P(cam);
  drawCamera(ctx, cx, cy, Math.atan2(heading.z, heading.x), isActive('top', 'camera'));
  label(ctx, 'Camera', cx, cy + 26 * ui(), colors.cam, 'center');

  // Layout handles (advanced): custom wall corners, wild walls, ceiling
  const layout = [];
  if (adv && mw.custom) {
    state.wallPts.forEach((p, i) => {
      const x = V.X(p.x), y = V.Y(p.z);
      handle(ctx, x, y, isActive('top', 'pt:' + i));
      layout.push({ id: 'pt:' + i, x, y });
    });
  }
  if (adv && state.wildOn) {
    state.wild.forEach((wl, i) => {
      const x = V.X(wl.x), y = V.Y(wl.z);
      handle(ctx, x, y, isActive('top', `wild:${i}:move`));
      const end = Optics.panelPoints(wl.x, wl.z, wl.rot, wl.w)[1];
      const ex = V.X(end.x), ey = V.Y(end.z);
      handle(ctx, ex, ey, isActive('top', `wild:${i}:rot`), true);
      layout.push({ id: `wild:${i}:move`, x, y }, { id: `wild:${i}:rot`, x: ex, y: ey });
    });
  }
  if (adv && state.ceilOn) {
    const c = state.ceil;
    const x = V.X(c.x), y = V.Y(c.z);
    handle(ctx, x, y, isActive('top', 'ceil:move'));
    const k = Optics.rectCorners(c.x, c.z, c.w, c.d, c.rot)[2];
    handle(ctx, V.X(k.x), V.Y(k.z), isActive('top', 'ceil:size'), true);
    layout.push({ id: 'ceil:move', x, y }, { id: 'ceil:size', x: V.X(k.x), y: V.Y(k.z) });
  }

  // Grab priority: camera, subject, depth of field, then layout handles. When the
  // focus point sits under the talent (focus on the talent), it is grabbed at the
  // end of the focus line instead, so the talent stays easy to move.
  const clear = hd => hd.id !== 'focus' || hd.alt || Math.hypot(hd.x - sx, hd.y - sy) > grabR();
  handles.top = [{ id: 'camera', x: cx, y: cy }, { id: 'subject', x: sx, y: sy }, ...H.filter(clear), ...layout];
}

/* ------------------------------------------------------------------ */
/* Side view — vertical section along the line of sight               */
/* ------------------------------------------------------------------ */

function drawSide(o) {
  const { ctx, w, h } = prepCanvas(sideCanvas);
  if (w < 40 || h < 40) return; // hidden or not laid out yet
  const { tilt } = o.cb;
  const sec = o.section;
  const subDist = Math.hypot(state.subX - state.camX, state.subZ - state.camZ);
  const wallTop = state.wallBottom + state.wallH;
  const ceil = o.sections.ceil;
  const HS = [];

  // Surfaces the line of sight doesn't cross are shown "off to the side": their
  // extent along the view direction, at their real height.
  const hd = o.cb.heading;
  const along = p => (p.x - state.camX) * hd.x + (p.z - state.camZ) * hd.z;
  const crossed = new Set(o.sections.walls.map(x => x.S.id));
  const ghosts = [];
  for (const S of o.surfs) {
    if (S.main || crossed.has(S.id) || (S.kind === 'h' && ceil)) continue;
    // Negative distances are behind the camera; they are kept and drawn there.
    const ss = (S.kind === 'v' ? [S.plan(0), S.plan(1)] : S.corners).map(along);
    ghosts.push({ S, s0: Math.max(Math.min(...ss), -80), s1: Math.min(Math.max(...ss), 80) });
  }

  const reach = [sec ? Math.min(sec.t, 80) : Math.max(subDist * 1.5, 6)];
  for (const { hit } of o.sections.walls) reach.push(Math.min(hit.t, 80));
  if (ceil) reach.push(Math.min(ceil.t1, 80));
  for (const g of ghosts) reach.push(Math.min(g.s1, 80));
  const sMax = Math.max(...reach) + 1.2;
  const tops = [wallTop, state.camY, state.subH, state.aimH];
  for (const { S } of o.sections.walls) tops.push(S.bottom + S.height);
  if (ceil) tops.push(state.ceil.h + 0.3);
  for (const g of ghosts) tops.push(g.S.kind === 'v' ? g.S.bottom + g.S.height : state.ceil.h + 0.3);
  const adv = state.mode === 'advanced';
  const yMax = Math.max(...tops) + 0.8;
  // The view extends behind the camera for anything placed there.
  const behind = [-1.2];
  for (const g of ghosts) behind.push(g.s0 - 1);
  if (ceil) behind.push(ceil.t0 - 1);
  const V = makeView(w, h, Math.min(...behind), sMax, -0.4, yMax, true);
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
  const clipS = sec && sec.onWall ? V.X(sec.t) : w;
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

  // Wall sections (main and wild walls the line of sight crosses)
  const thick = Math.max(0.25, 7 / V.k);
  for (const { S, hit } of o.sections.walls) {
    const x0 = V.X(hit.t), x1 = V.X(hit.t + thick);
    const top = S.bottom + S.height;
    if (!hit.onWall) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = colors.muted;
      ctx.strokeRect(x0, V.Y(top), x1 - x0, S.height * V.k);
      ctx.setLineDash([]);
      label(ctx, 'Line of sight misses the wall', x0 - 6, V.Y(top) - 10, colors.muted, 'right');
      continue;
    }
    const n = S.plan(clamp(hit.u, 0, 1));
    const nv = S.main ? WALL_NV : S.nv;
    const segH = S.height / (nv - 1);
    for (let j = 0; j < nv; j++) {
      const y = S.bottom + (j / (nv - 1)) * S.height;
      const e = evalWallPoint({ p: v3(hit.x, y, hit.z), n: v3(n.nx, 0, n.nz), t: v3(n.tx, 0, n.tz), pitchM: S.pitch / 1000 }, o);
      const y0 = V.Y(Math.min(top, y + segH / 2));
      const y1 = V.Y(Math.max(S.bottom, y - segH / 2));
      ctx.fillStyle = e.inFocus ? hazard(ctx) : e.visible ? colors['wall-lit'] : colors.wall;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0 + 0.5);
      if (e.moire >= 2) {
        ctx.fillStyle = e.moire === 3 ? colors['moire-high'] : colors['moire-mid'];
        ctx.fillRect(x0 - MOIRE_GAP - MOIRE_W, y0, MOIRE_W, y1 - y0 + 0.5);
      }
    }
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, V.Y(top), x1 - x0, S.height * V.k);
    label(ctx, S.main ? 'LED wall' : `Wild ${S.idx + 1}`, x0 - 6, V.Y(top) - 10, colors.muted, 'right');
    if (adv) {
      const id = S.main ? 'wall:side' : `wild:${S.idx}:side`;
      // Near the top of the wall, clear of the talent, the aim point and the focus markers.
      const hx = (x0 + x1) / 2, hy = V.Y(S.bottom + S.height) + 12 * ui();
      handle(ctx, hx, hy, isActive('side', id));
      HS.push({ id, x: hx, y: hy });
    }
  }

  // Off to the side: outlines at their distance along the view and real height.
  const tsG = Math.max(0.12, 5 / V.k);
  let ghostRow = 0;
  for (const g of ghosts) {
    const xa = V.X(g.s0), xb = V.X(g.s1);
    const isWall = g.S.kind === 'v';
    const yTop = isWall ? g.S.bottom + g.S.height : state.ceil.h + tsG;
    const yBot = isWall ? g.S.bottom : state.ceil.h;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = isWall ? colors.wall : colors.ceil;
    ctx.fillRect(xa, V.Y(yTop), Math.max(xb - xa, 3), (yTop - yBot) * V.k);
    ctx.globalAlpha = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = isWall ? colors.muted : colors.ceil;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(xa, V.Y(yTop), Math.max(xb - xa, 3), (yTop - yBot) * V.k);
    ctx.restore();
    // Labels sit along the bottom edge (stacked if several), clear of the ceiling and focus labels.
    const ly = isWall ? V.Y(yBot) - 10 - 15 * ui() * ghostRow++ : V.Y(yTop) - 10;
    const where = g.s1 <= 0 ? 'behind the camera' : 'off to the side';
    label(ctx, `${isWall ? `Wild ${g.S.idx + 1}` : 'LED ceiling'} · ${where}`, xa + 4, ly, colors.muted);
    if (adv) {
      const id = isWall ? `wild:${g.S.idx}:side` : 'ceil:side';
      const hx = V.X((g.s0 + g.s1) / 2), hy = isWall ? V.Y(yTop) + 12 * ui() : V.Y((yTop + yBot) / 2);
      handle(ctx, hx, hy, isActive('side', id));
      HS.push({ id, x: hx, y: hy });
    }
  }
  if (!o.sections.walls.length) label(ctx, 'Line of sight does not reach the wall', w - 12, 16, colors.muted, 'right');

  // Ceiling section
  if (ceil) {
    const yb = state.ceil.h, n = 40;
    const ts = Math.max(0.12, 5 / V.k);
    for (let i = 0; i < n; i++) {
      const t = ceil.t0 + ((i + 0.5) / n) * (ceil.t1 - ceil.t0);
      const hx = state.camX + o.cb.heading.x * t, hz = state.camZ + o.cb.heading.z * t;
      const a = state.ceil.rot * DEG;
      const e = evalWallPoint({ p: v3(hx, yb, hz), n: v3(0, -1, 0), t: v3(Math.cos(a), 0, -Math.sin(a)), t2: v3(Math.sin(a), 0, Math.cos(a)), pitchM: state.ceilPitch / 1000 }, o);
      const xa = V.X(ceil.t0 + (i / n) * (ceil.t1 - ceil.t0)), xb = V.X(ceil.t0 + ((i + 1) / n) * (ceil.t1 - ceil.t0));
      ctx.fillStyle = e.inFocus ? hazard(ctx) : e.visible ? colors['wall-lit'] : colors.wall;
      ctx.fillRect(xa, V.Y(yb + ts), xb - xa + 0.5, ts * V.k);
    }
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 1;
    ctx.strokeRect(V.X(ceil.t0), V.Y(yb + ts), (ceil.t1 - ceil.t0) * V.k, ts * V.k);
    label(ctx, 'LED ceiling', V.X(ceil.t0) + 4, V.Y(yb + ts) - 10, colors.muted);
    if (adv) {
      const hx = V.X((ceil.t0 + ceil.t1) / 2), hy = V.Y(yb);
      handle(ctx, hx, hy, isActive('side', 'ceil:side'));
      HS.push({ id: 'ceil:side', x: hx, y: hy });
    }
  }

  // Axis markers
  const axisPt = d => P(ct * d, state.camY + st * d);
  const tag = (d, kind, text, dy, grab) => {
    const [x, y] = axisPt(d);
    if (x < -20 || x > w + 20 || y < -20 || y > h + 20) return;
    ctx.globalAlpha = sec && sec.onWall && ct * d > sec.t ? 0.45 : 1;
    marker(ctx, x, y, kind, grab && isActive('side', kind));
    label(ctx, text, x, y + dy * ui(), colors[kind], 'center');
    ctx.globalAlpha = 1;
    if (grab) HS.push({ id: kind, x, y });
  };
  tag(o.H, 'hyper', 'Hyperfocal', -14, false);
  if (isFinite(o.far)) tag(o.far, 'far', 'Far', 16, true);
  tag(o.near, 'near', 'Near', 16, true);
  tag(o.s, 'focus', '', 0, true); // the point of focus on the lens axis
  const [fx, fy] = at(o.s, 1);
  label(ctx, 'Focus', fx, fy - 10, colors.focus, 'center');
  HS.push({ id: 'focus', x: fx, y: fy, alt: true }); // edge of the focus line: a second grab point

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
  ctx.strokeStyle = isActive('side', 'aim') ? colors.focus : colors.text;
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
  drawCamera(ctx, cx, cy, -tilt, isActive('side', 'camera'));
  label(ctx, `Tilt ${(tilt * 180 / Math.PI).toFixed(1)}°`, cx + 4, cy - 22, colors.muted);

  // Talent handle at the top of the head: left/right = distance, up/down = height.
  const tx = V.X(subDist), ty = V.Y(sh);
  if (isActive('side', 'subject')) grabRing(ctx, tx, ty, colors.focus);
  // The focus point under the aim point is grabbed at the end of the focus line instead.
  const clear = hd => hd.id !== 'focus' || hd.alt || Math.hypot(hd.x - ax, hd.y - ay) > grabR();
  handles.side = [{ id: 'aim', x: ax, y: ay }, { id: 'camera', x: cx, y: cy }, { id: 'subject', x: tx, y: ty }, ...HS.filter(clear)];
}

/* ------------------------------------------------------------------ */
/* Readouts, advice and status                                         */
/* ------------------------------------------------------------------ */

function stat(k, v, s = '', bad = false) {
  return `<div class="stat${bad ? ' bad' : ''}"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
}

const MOIRE_LABEL = ['Low', 'Grid visible', 'Moderate', 'High'];
const fmtUm = mm => (mm * 1000).toFixed(1) + ' µm';

function guidance(o) {
  const wall = o.wall;
  const D = wall.minDepth;
  const inShot = wall.visible > 0;
  const hazardOn = wall.inFocus > 0;
  const mw = wall.worst;
  const moireOn = wall.moireLevel >= 2;
  const tips = [];
  if (inShot) {
    const { f, c, s, N } = o;
    const maxStop = FSTOPS[FSTOPS.length - 1];
    if (D > s) {
      // Aperture at which the far limit lands exactly on the nearest visible LED.
      const nLimit = Optics.stopForFarLimit(f, c, s, D);
      if (hazardOn) {
        tips.push(nLimit >= FSTOPS[0]
          ? `Open up to wider than <b>${fmtStop(nLimit)}</b> to push the far limit in front of the LED.`
          : `Even wide open (${fmtStop(FSTOPS[0])}) the LED stays sharp at this focus distance — move the subject/camera away from the wall or use a longer lens.`);
      } else if (nLimit <= maxStop) {
        tips.push(`Stopping down past <b>${fmtStop(nLimit)}</b> will bring the LED into focus.`);
      } else {
        tips.push(`The LED stays outside the depth of field at every stop up to ${fmtStop(maxStop)}.`);
      }
      // Furthest focus distance at the current stop before the LED sharpens.
      tips.push(`At ${fmtStop(N)}, keep focus closer than <b>${fmtM(Optics.maxFocusForFarLimit(f, N, c, D))}</b> to keep the LED soft.`);
    } else if (hazardOn) {
      tips.push('Focus is set at or beyond the nearest visible LED — it will be sharp.');
    } else {
      tips.push('Focus is set behind the nearest visible LED; that part sits in front of the near limit, so it is soft.');
    }
    if (hazardOn) {
      tips.push(`<b>${Math.round(wall.fraction * 100)}%</b> of the LED in frame (${listText(wall.hot)}) is inside the depth of field (hazard-striped in the views).`);
    }
    tips.push(`Subject-to-LED gap along the lens axis: <b>${fmtM(D - o.cb.subjectDist)}</b> (nearest visible LED). More gap = softer LED.`);

    // Moiré guidance
    if (moireOn) {
      tips.push(`<b>Moiré ${MOIRE_LABEL[wall.moireLevel].toLowerCase()}:</b> the LED grid images at ${fmtUm(mw.pImgMm)} ` +
        `(${mw.ratio.toFixed(2)} photosites per LED pixel — finer than the ${Optics.BAYER_LIMIT}-photosite colour sampling limit of a Bayer sensor) ` +
        `and only ${fmtUm(mw.blurMm)} of defocus leaves ${Math.round(mw.contrast * 100)}% grid contrast. Marked with a red/orange strip.`);
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
    tips.push('No LED is in frame — pan the camera toward the wall or widen the lens.');
  }
  return tips;
}

function renderReadouts(o) {
  const wall = o.wall;
  const D = wall.minDepth;
  const inShot = wall.visible > 0;
  const hazardOn = wall.inFocus > 0;
  const gap = inShot && isFinite(o.far) ? D - o.far : null;
  const mw = wall.worst;
  const moireOn = wall.moireLevel >= 2;
  const tips = guidance(o);

  if (state.mode === 'advanced') {
    document.getElementById('readouts').innerHTML = [
      stat('Horizontal FOV', fmtDeg(o.hfov), `Vertical ${fmtDeg(o.vfov)}`),
      stat('Focus distance', fmtM(o.s), state.focusAuto ? 'following subject' : 'manual'),
      stat('Nearest sharp', fmtM(o.near)),
      stat('Furthest sharp', fmtM(o.far), '', hazardOn),
      stat('Total depth of field', fmtM(o.far - o.near)),
      stat('Hyperfocal distance', fmtM(o.H), `at ${fmtStop(o.N)}`),
      stat('Nearest LED in frame', inShot ? fmtM(D) : '—', inShot ? `furthest ${fmtM(wall.maxDepth)}` : 'no LED in shot', hazardOn),
      stat('Far limit → LED', gap === null ? (inShot ? 'LED sharp' : '—') : (gap >= 0 ? fmtM(gap) : '−' + fmtM(-gap)),
        gap === null ? '' : gap >= 0 ? 'clearance behind DOF' : 'LED is inside DOF', hazardOn),
      stat('Circle of confusion', o.cocMm.toFixed(4) + ' mm', `${o.sen.w.toFixed(2)} × ${o.sen.h.toFixed(2)} mm sensor`),
      stat('Moiré risk', inShot && mw ? MOIRE_LABEL[wall.moireLevel] : '—',
        inShot && mw ? `${Math.round(wall.moireFraction * 100)}% of visible LED at moderate+` : 'no LED in shot', moireOn),
      stat('LED pitch on sensor', mw ? fmtUm(mw.pImgMm) : '—',
        mw ? `${mw.ratio.toFixed(2)} photosites (${fmtUm(o.photositeMm)} each)` : `photosite ${fmtUm(o.photositeMm)}`, moireOn),
      stat('Defocus blur at LED', mw ? fmtUm(mw.blurMm) : '—',
        mw ? `grid contrast left: ${Math.round(mw.contrast * 100)}%` : '', moireOn),
    ].join('');
    document.getElementById('advice').innerHTML = `<h3>Guidance</h3><ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul>`;
  } else {
    renderGlance(o, { inShot, hazardOn, gap, moireOn, tips });
  }

  // Status banner
  const el = document.getElementById('status');
  const moireTxt = moireOn ? ` · moiré risk ${MOIRE_LABEL[wall.moireLevel].toLowerCase()}` : '';
  const what = wall.hot.length === 1 && wall.hot[0] === 'wall' ? 'LED wall' : `LED ${listText(wall.hot)}`;
  if (!inShot) {
    el.className = 'status neutral';
    el.textContent = 'No LED in frame';
  } else if (hazardOn) {
    el.className = 'status hazard';
    el.innerHTML = `<span>⚠ ${what} in focus — ${Math.round(wall.fraction * 100)}% of the visible LED is inside the depth of field${moireTxt}</span>`;
  } else if (moireOn) {
    el.className = 'status warn';
    el.textContent = `⚠ LED outside the DOF, but moiré risk is ${MOIRE_LABEL[wall.moireLevel].toLowerCase()}`;
  } else {
    el.className = 'status ok';
    el.textContent = gap !== null && gap >= 0
      ? `✓ Wall out of focus — ${fmtM(gap)} beyond the far limit`
      : '✓ Wall out of focus — it sits in front of the near limit';
  }
}

// Simple mode: four big numbers, one plain-language line and the first fix.
function renderGlance(o, g) {
  const big = (k, v, cls = '') => `<div class="g-num ${cls}"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  let line1;
  if (!g.inShot) line1 = 'No LED in frame.';
  else if (g.hazardOn) line1 = `<b>The LED is in focus.</b> ${Math.round(o.wall.fraction * 100)}% of what's in frame is sharp.`;
  else if (g.gap !== null && g.gap >= 0) line1 = `The far limit is <b>${fmtM(g.gap)}</b> in front of the LED.`;
  else line1 = 'The LED sits in front of the near limit, so it is soft.';
  const tip = g.hazardOn || g.moireOn ? g.tips[0] : '';
  document.getElementById('glance').innerHTML =
    `<div class="g-nums">${big('Near', fmtM(o.near), 'near')}${big('Focus', fmtM(o.s), 'focus')}${big('Far', fmtM(o.far), 'far')}${big('Depth of field', fmtM(o.far - o.near))}</div>` +
    `<p class="g-line">${line1}${g.moireOn ? ` Moiré risk: <b>${MOIRE_LABEL[o.wall.moireLevel].toLowerCase()}</b>.` : ''}</p>` +
    (tip ? `<p class="g-fix">${tip}</p>` : '');
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

const rows = []; // { spec, range, num, out, row }

// Log-scale sliders use 0..1000 positions.
const toPos = (spec, v) => spec.log ? Math.round(1000 * Math.log(v / spec.min) / Math.log(spec.max / spec.min)) : v;
const fromPos = (spec, p) => spec.log ? spec.min * Math.pow(spec.max / spec.min, p / 1000) : +p;
const decimals = step => (String(step).split('.')[1] || '').length;
const getVal = spec => spec.get ? spec.get() : state[spec.key];
function setVal(spec, v) {
  if (spec.set) { spec.set(v); update(); } else set(spec.key, v);
}

let uid = 0;
function buildRow(box, spec, dynamic) {
  const id = spec.key && box.id.startsWith('ctl-') ? 'in-' + spec.key : 'r' + (++uid);
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <div class="row-head">
      <label for="${id}">${spec.label}</label>
      <span class="val">${spec.format ? '<output></output>' : `<input type="number" step="${spec.step}" aria-label="${spec.label}"> ${spec.unit}`}</span>
    </div>
    <input id="${id}" type="range">`;
  box.appendChild(row);
  const range = row.querySelector('input[type=range]');
  const num = row.querySelector('input[type=number]');
  const out = row.querySelector('output');
  if (spec.log) { range.min = 0; range.max = 1000; range.step = 1; }
  else { range.min = spec.min; range.max = spec.max; range.step = spec.step; }

  range.addEventListener('input', () => setVal(spec, +fromPos(spec, range.value).toFixed(decimals(spec.step))));
  num?.addEventListener('change', () => {
    if (num.value === '' || !isFinite(+num.value)) return sync();
    setVal(spec, +num.value);
  });
  const r = { spec, range, num, out, row, dynamic };
  rows.push(r);
  return r;
}

function buildControls() {
  for (const [containerId, specs] of Object.entries(SLIDERS)) {
    const box = document.getElementById(containerId);
    for (const spec of specs) buildRow(box, spec, false);
  }

  // Camera bodies: advanced select and the simple-mode copy
  const groups = [...new Set(CAMERAS.map(c => c.group))];
  const options = groups.map(g => `<optgroup label="${g}">` +
    CAMERAS.filter(c => c.group === g).map(c => `<option value="${c.id}">${c.name}</option>`).join('') +
    '</optgroup>').join('');
  for (const id of ['body', 's-body']) {
    const sel = document.getElementById(id);
    sel.innerHTML = options;
    sel.addEventListener('change', () => {
      const cam = CAMERAS.find(c => c.id === sel.value);
      if (cam.id !== 'custom') { state.sensorW = cam.w; state.sensorH = cam.h; state.resH = cam.res; }
      set('body', cam.id);
    });
  }

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
    resH: null, pitch: null, coc: null, ceilPitch: null,
  };
  for (const [key, before] of Object.entries(numberInputs)) {
    const el = document.getElementById(key);
    el.addEventListener('change', () => {
      if (el.value === '' || !isFinite(+el.value) || +el.value <= 0) return sync();
      if (before) before();
      set(key, +el.value);
    });
  }
  for (const key of ['focusAuto', 'cocAuto', 'wildOn', 'ceilOn']) {
    const el = document.getElementById(key);
    el.addEventListener('change', () => set(key, el.checked));
  }
  const follow = document.getElementById('s-follow');
  follow.addEventListener('change', () => set('focusAuto', follow.checked));

  document.getElementById('reset').addEventListener('click', () => {
    const mode = state.mode;
    state = structuredClone(DEFAULTS);
    state.mode = mode;
    rebuildLists();
    update();
  });

  // Mode toggle (Simple / Advanced)
  // Buttons only: <body> carries data-mode too, for the CSS.
  document.querySelectorAll('button[data-mode]').forEach(b => b.addEventListener('click', () => {
    set('mode', b.dataset.mode);
    try { localStorage.setItem('dofovision-mode', state.mode); } catch (e) { /* not remembered */ }
  }));

  // Wall shape toggle
  document.querySelectorAll('button[data-wallmode]').forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.wallmode;
    // Keep the wall where it is: the shape's points include its back/forward position.
    if (m === 'custom' && state.wallMode !== 'custom') state.wallPts = Optics.arcPoints(state.wallW, state.curve, 7).map(p => ({ x: p.x, z: +(p.z + state.wallZ).toFixed(3) }));
    state.wallMode = m;
    rebuildLists();
    update();
  }));
  document.getElementById('pt-add-left').addEventListener('click', () => addWallPoint(0));
  document.getElementById('pt-add-right').addEventListener('click', () => addWallPoint(1));
  document.getElementById('wild-add').addEventListener('click', () => {
    const last = state.wild[state.wild.length - 1];
    const w = NEW_WILD();
    if (last) { w.x = -last.x || 4.5; w.rot = last.rot === 90 ? -90 : 90; }
    state.wild.push(w);
    state.wildOn = true;
    rebuildLists();
    update();
  });

  // Simple mode: lens chips and the aperture stepper
  const chips = document.getElementById('s-focal');
  chips.innerHTML = FOCALS.map(f => `<button type="button" class="chip" data-focal="${f}">${f}</button>`).join('');
  chips.addEventListener('click', e => { const b = e.target.closest('[data-focal]'); if (b) set('focal', +b.dataset.focal); });
  const stops = document.getElementById('s-stops');
  stops.innerHTML = FULL_STOPS.map(n => `<button type="button" class="chip" data-stop="${n}">${n}</button>`).join('');
  stops.addEventListener('click', e => { const b = e.target.closest('[data-stop]'); if (b) set('fstopIdx', FSTOPS.indexOf(+b.dataset.stop)); });
  // −/+ go to the next third stop from wherever the aperture is, even a de-clicked value.
  const stepStop = dir => {
    const N = apertureN();
    const i = dir < 0 ? FSTOPS.findLastIndex(n => n < N - 1e-6) : FSTOPS.findIndex(n => n > N + 1e-6);
    if (i >= 0) set('fstopIdx', i);
  };
  document.getElementById('s-stop-down').addEventListener('click', () => stepStop(-1));
  document.getElementById('s-stop-up').addEventListener('click', () => stepStop(1));

  rebuildLists();
}

function addWallPoint(end) {
  const pts = state.wallPts;
  if (pts.length < 2) return;
  const [a, b] = end ? [pts[pts.length - 2], pts[pts.length - 1]] : [pts[1], pts[0]];
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const step = Math.min(2, len);
  const p = { x: +(b.x + ((b.x - a.x) / len) * step).toFixed(2), z: +(b.z + ((b.z - a.z) / len) * step).toFixed(2) };
  if (end) pts.push(p); else pts.unshift(p);
  rebuildLists();
  update();
}

// Lists whose length can change: custom wall points and wild walls.
function rebuildLists() {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].dynamic) rows.splice(i, 1);

  const ptsBox = document.getElementById('wall-pts');
  ptsBox.innerHTML = '';
  state.wallPts.forEach((p, i) => {
    const r = document.createElement('div');
    r.className = 'pt-row';
    r.innerHTML = `<span class="pt-n">${i + 1}</span>
      <label>X <input type="number" step="0.05" data-i="${i}" data-k="x"></label>
      <label>Z <input type="number" step="0.05" data-i="${i}" data-k="z"></label>
      <button type="button" class="icon" data-del="${i}" aria-label="Remove point ${i + 1}" ${state.wallPts.length <= 2 ? 'disabled' : ''}>✕</button>`;
    ptsBox.appendChild(r);
  });
  ptsBox.onchange = e => {
    const el = e.target;
    if (!el.dataset.k || el.value === '' || !isFinite(+el.value)) return;
    state.wallPts[+el.dataset.i][el.dataset.k] = +el.value;
    update();
  };
  ptsBox.onclick = e => {
    const b = e.target.closest('[data-del]');
    if (!b || state.wallPts.length <= 2) return;
    state.wallPts.splice(+b.dataset.del, 1);
    rebuildLists();
    update();
  };

  const wildBox = document.getElementById('wild-list');
  wildBox.innerHTML = '';
  state.wild.forEach((wl, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="card-head"><b>Wild wall ${i + 1}</b><button type="button" class="link" data-delwild="${i}">Remove</button></div>`;
    wildBox.appendChild(card);
    const W = k => ({ get: () => state.wild[i][k], set: v => { state.wild[i][k] = v; } });
    for (const spec of [
      { label: 'Width', min: 0.5, max: 20, step: 0.1, unit: 'm', ...W('w') },
      { label: 'Height', min: 0.5, max: 12, step: 0.1, unit: 'm', ...W('h') },
      { label: 'Bottom edge above floor', min: 0, max: 5, step: 0.05, unit: 'm', ...W('b') },
      { label: 'Angle', min: -180, max: 180, step: 1, unit: '°', ...W('rot') },
      { label: 'Centre across stage (X)', min: -15, max: 15, step: 0.05, unit: 'm', dyn: 'x', ...W('x') },
      { label: 'Centre from wall (Z)', min: -5, max: 30, step: 0.05, unit: 'm', dyn: 'z', ...W('z') },
    ]) buildRow(card, spec, true);
  });
  wildBox.onclick = e => {
    const b = e.target.closest('[data-delwild]');
    if (!b) return;
    state.wild.splice(+b.dataset.delwild, 1);
    if (!state.wild.length) state.wildOn = false;
    rebuildLists();
    update();
  };
}

function set(key, value) {
  state[key] = value;
  if (key === 'focus') state.focusAuto = false; // moving the focus slider takes manual control
  if (key === 'fstopIdx') state.fstop = 0;     // stop slider, buttons and −/+ use whole third stops
  if (key === 'wildOn' && value && !state.wild.length) { state.wild.push(NEW_WILD()); rebuildLists(); }
  update();
}

// Keep the scene physically sensible.
function normalise() {
  const s = state;
  for (const row of rows) {
    const { key, min, max } = row.spec;
    if (!key || row.spec.dyn) continue;
    s[key] = clamp(s[key], min, max);
  }
  if (s.mode !== 'simple' && s.mode !== 'advanced') s.mode = DEFAULTS.mode;
  s.fstopIdx = Math.round(clamp(s.fstopIdx, 0, FSTOPS.length - 1));
  s.fstop = s.fstop > 0 ? +clamp(s.fstop, FSTOPS[0], FSTOPS[FSTOPS.length - 1]).toFixed(3) : 0;
  s.curve = Math.round(s.curve);

  const cam = CAMERAS.find(c => c.id === s.body);
  if (!cam) s.body = DEFAULTS.body;
  if (cam && cam.id !== 'custom') { s.sensorW = cam.w; s.sensorH = cam.h; }
  s.sensorW = clamp(s.sensorW, 1, 80);
  s.sensorH = clamp(s.sensorH, 1, 60);
  s.resH = Math.round(clamp(s.resH, 256, 20000));
  s.pitch = clamp(s.pitch, 0.3, 20);
  s.ceilPitch = clamp(+s.ceilPitch || DEFAULTS.ceilPitch, 0.3, 20);
  s.coc = clamp(s.coc, 0.002, 0.1);

  // Layout: fresh copies (never shared with DEFAULTS), finite numbers, sane sizes.
  const num = (v, d) => (isFinite(+v) ? +v : d);
  if (s.wallMode !== 'custom') s.wallMode = 'simple';
  s.wallPts = (Array.isArray(s.wallPts) ? s.wallPts : []).map(p => ({ x: clamp(num(p.x, 0), -40, 40), z: clamp(num(p.z, 0), -20, 40) }));
  if (s.wallMode === 'custom' && s.wallPts.length < 2) s.wallPts = Optics.arcPoints(s.wallW, s.curve, 7);
  s.wild = (Array.isArray(s.wild) ? s.wild : []).slice(0, 8).map(w => ({
    x: clamp(num(w.x, 0), -40, 40), z: clamp(num(w.z, 0), -20, 40), rot: wrapDeg(num(w.rot, 0)),
    w: clamp(num(w.w, 4), 0.5, 20), h: clamp(num(w.h, 3), 0.5, 12), b: clamp(num(w.b, 0), 0, 5),
  }));
  const c = s.ceil || {};
  s.ceil = {
    x: clamp(num(c.x, 0), -40, 40), z: clamp(num(c.z, 3), -20, 40), w: clamp(num(c.w, 10), 1, 30),
    d: clamp(num(c.d, 6), 1, 30), h: clamp(num(c.h, 4.5), 1.5, 12), rot: wrapDeg(num(c.rot, 0)),
  };
  s.wildOn = !!s.wildOn && s.wild.length > 0;
  s.ceilOn = !!s.ceilOn;

  // Camera and subject stay on the stage, in front of the LED face.
  const b = stageBounds();
  const mw = mainWall();
  for (const [kx, kz, margin] of [['camX', 'camZ', 0.3], ['subX', 'subZ', 0.2]]) {
    let x = clamp(s[kx], b.xmin, b.xmax), z = clamp(s[kz], b.zmin, b.zmax);
    ({ x, z } = mw.keepInFront(x, z, margin));
    s[kx] = +x.toFixed(2);
    s[kz] = +z.toFixed(2);
  }
}

function sync(o) {
  const b = stageBounds();
  for (const { spec, range, num, out } of rows) {
    if (spec.dyn === 'x') { range.min = b.xmin; range.max = b.xmax; }
    if (spec.dyn === 'z') { range.min = b.zmin; range.max = b.zmax; }
    const v = getVal(spec);
    range.value = toPos(spec, v);
    const pct = (100 * (range.value - range.min)) / ((range.max - range.min) || 1);
    range.style.setProperty('--fill', clamp(pct, 0, 100) + '%');
    if (num && document.activeElement !== num) num.value = (+v).toFixed(decimals(spec.step));
    if (out) out.textContent = spec.format(v);
  }
  for (const r of rows) if (r.spec.key === 'focus') r.row.classList.toggle('following', state.focusAuto);

  document.body.dataset.mode = state.mode;
  document.querySelectorAll('button[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  document.querySelectorAll('button[data-wallmode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.wallmode === state.wallMode)));
  document.body.dataset.wallmode = state.wallMode;

  for (const id of ['body', 's-body']) document.getElementById(id).value = state.body;
  for (const key of ['sensorW', 'sensorH', 'resH', 'pitch', 'ceilPitch']) document.getElementById(key).value = state[key];
  const preset = PITCHES.find(p => Math.abs(p - state.pitch) < 1e-9);
  document.getElementById('pitchSel').value = preset !== undefined ? String(preset) : 'custom';
  const shape = wallShape();
  document.getElementById('curve-info').textContent = shape.flat
    ? 'Flat wall. Positive = concave (wraps around the stage), negative = convex.'
    : `${state.curve > 0 ? 'Concave' : 'Convex'} arc · radius ${Math.abs(shape.R).toFixed(2)} m · chord ${(2 * Math.abs(shape.R) * Math.sin(Math.abs(shape.theta) / 2)).toFixed(2)} m`;
  for (const key of ['focusAuto', 'cocAuto', 'wildOn', 'ceilOn']) document.getElementById(key).checked = state[key];
  document.getElementById('s-follow').checked = state.focusAuto;
  document.body.classList.toggle('wild-on', state.wildOn);
  document.body.classList.toggle('ceil-on', state.ceilOn);
  const cocEl = document.getElementById('coc');
  cocEl.disabled = state.cocAuto;
  if (o && document.activeElement !== cocEl) cocEl.value = o.cocMm.toFixed(4);
  if (o) {
    const diag = Math.hypot(o.sen.w, o.sen.h);
    document.getElementById('sensor-info').textContent =
      `Diagonal ${diag.toFixed(1)} mm · crop ${(43.27 / diag).toFixed(2)}× vs full frame · photosite ${fmtUm(o.photositeMm)}`;
  }

  // Custom wall point boxes
  document.querySelectorAll('#wall-pts input').forEach(el => {
    if (document.activeElement === el) return;
    const p = state.wallPts[+el.dataset.i];
    if (p) el.value = p[el.dataset.k].toFixed(2);
  });

  // Simple mode: chips and the aperture readout
  document.querySelectorAll('#s-focal [data-focal]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.focal === state.focal)));
  document.getElementById('s-focal-val').textContent = state.focal + ' mm';
  const N = apertureN();
  document.querySelectorAll('#s-stops [data-stop]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.stop === N)));
  document.getElementById('s-stop-val').textContent = fmtStop(N);
  document.getElementById('s-stop-down').disabled = N <= FSTOPS[0];
  document.getElementById('s-stop-up').disabled = N >= FSTOPS[FSTOPS.length - 1];
}

/* ------------------------------------------------------------------ */
/* Dragging                                                            */
/* ------------------------------------------------------------------ */

function localPos(cv, e) {
  const r = cv.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function hitTest(which, sx, sy) {
  let best = null;
  for (const hnd of handles[which]) {
    const d = Math.hypot(sx - hnd.x, sy - hnd.y);
    if (d <= grabR() + 4 && (!best || d < best.d - 6)) best = { d, id: hnd.id };
  }
  return best ? best.id : null;
}

// Axial depth for a pointer position in the top view (via the plan projection
// of the lens axis) or the side view (horizontal distance ÷ cos tilt).
function depthAt(which, sx, sy) {
  const cb = lastO.cb, ct = Math.max(Math.cos(cb.tilt), 0.05);
  if (which === 'top') {
    const x = topView.A(sx), z = topView.B(sy);
    return ((x - state.camX) * cb.heading.x + (z - state.camZ) * cb.heading.z) / ct;
  }
  return sideView.A(sx) / ct;
}

function applyDrag(which, target, sx, sy) {
  if (['near', 'far', 'focus'].includes(target)) { dragDepth(target, depthAt(which, sx, sy)); return; }
  if (which === 'side') {
    const y = +sideView.B(sy).toFixed(2);
    if (target === 'aim') { state.aimH = y; return; }
    if (target === 'camera' || target === 'subject') {
      // Left/right moves along the line of sight; up/down is lens height or talent height.
      const { V, s0, y0, hx, hz, start } = drag;
      const ds = V.A(sx) - s0, dy = V.B(sy) - y0;
      const r2 = v => +v.toFixed(2);
      if (target === 'camera') {
        state.camX = r2(start.camX + hx * ds); state.camZ = r2(start.camZ + hz * ds);
        state.camY = r2(start.camY + dy);
      } else {
        state.subX = r2(start.subX + hx * ds); state.subZ = r2(start.subZ + hz * ds);
        state.subH = r2(start.subH + dy);
      }
      return;
    }
    // Layout in the side view: left/right is back/forward along the line of sight.
    // Measured against the view as it was when the drag began, because the view
    // rescales as things move.
    const { V, s0, y0, hx, hz, start } = drag;
    const ds = V.A(sx) - s0, dy = V.B(sy) - y0;
    const r2 = v => +v.toFixed(2);
    if (target === 'wall:side') {
      // The main wall slides along z (straight back or forward) so that where the
      // line of sight meets it moves by ds.
      const dz = ds / (Math.abs(hz) < 0.3 ? 0.3 * Math.sign(hz || -1) : hz);
      if (state.wallMode === 'custom') state.wallPts = start.pts.map(p => ({ x: p.x, z: r2(p.z + dz) }));
      else state.wallZ = r2(start.wallZ + dz);
      state.wallBottom = r2(clamp(start.wallBottom + dy, 0, 3));
      return;
    }
    const [kind, idx] = target.split(':');
    if (kind === 'wild') {
      const wl = state.wild[+idx];
      wl.x = r2(start.x + hx * ds); wl.z = r2(start.z + hz * ds); wl.b = r2(clamp(start.b + dy, 0, 5));
    } else if (kind === 'ceil') {
      const c = state.ceil;
      c.x = r2(start.x + hx * ds); c.z = r2(start.z + hz * ds); c.h = r2(clamp(start.h + dy, 1.5, 12));
    }
    return;
  }
  const x = +topView.A(sx).toFixed(2), z = +topView.B(sy).toFixed(2);
  if (target === 'camera') { state.camX = x; state.camZ = z; return; }
  if (target === 'subject') { state.subX = x; state.subZ = z; return; }
  const [kind, idx, part] = target.split(':');
  if (kind === 'pt') { state.wallPts[+idx] = { x, z }; return; }
  if (kind === 'wild') {
    const wl = state.wild[+idx];
    if (part === 'move') { wl.x = x; wl.z = z; }
    else wl.rot = Math.round(Math.atan2(-(z - wl.z), x - wl.x) / DEG);
    return;
  }
  if (kind === 'ceil') {
    const c = state.ceil;
    if (idx === 'move') { c.x = x; c.z = z; return; }
    const a = c.rot * DEG, dx = x - c.x, dz = z - c.z;
    c.w = +(2 * Math.abs(dx * Math.cos(a) - dz * Math.sin(a))).toFixed(2);
    c.d = +(2 * Math.abs(dx * Math.sin(a) + dz * Math.cos(a))).toFixed(2);
  }
}

const HINTS = {
  camera: 'Moving the camera', subject: 'Moving the talent', aim: 'Moving the aim point',
  near: 'Dragging the near limit: the aperture follows, focus stays put', far: 'Dragging the far limit: the aperture follows, focus stays put',
  focus: 'Dragging the focus distance',
  'wall:side': 'Moving the LED wall: left/right = back/forward, up/down = bottom edge', 'ceil:side': 'Moving the ceiling: left/right = back/forward, up/down = height',
};

function setupDrag(cv, which) {
  // On touch screens the canvas scrolls the page, except when a touch starts on a handle.
  cv.addEventListener('touchstart', e => {
    const t = e.touches[0];
    const r = cv.getBoundingClientRect();
    if (hitTest(which, t.clientX - r.left, t.clientY - r.top)) e.preventDefault();
  }, { passive: false });
  cv.addEventListener('pointerdown', e => {
    const [sx, sy] = localPos(cv, e);
    const target = hitTest(which, sx, sy);
    if (!target) return;
    drag = { which, target };
    if (which === 'side') {
      // Starting point for side-view layout drags (see applyDrag).
      const [kind, idx] = target.split(':');
      drag.V = sideView;
      drag.s0 = sideView.A(sx);
      drag.y0 = sideView.B(sy);
      drag.hx = lastO.cb.heading.x;
      drag.hz = lastO.cb.heading.z;
      drag.start = kind === 'wild' ? { ...state.wild[+idx] }
        : kind === 'ceil' ? { ...state.ceil }
        : kind === 'camera' || kind === 'subject' ? { camX: state.camX, camZ: state.camZ, camY: state.camY, subX: state.subX, subZ: state.subZ, subH: state.subH }
        : { wallZ: state.wallZ, wallBottom: state.wallBottom, pts: state.wallPts.map(p => ({ ...p })) };
    }
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
    update();
  });
  cv.addEventListener('pointermove', e => {
    const [sx, sy] = localPos(cv, e);
    if (drag && drag.which === which) {
      applyDrag(which, drag.target, sx, sy);
      update();
      return;
    }
    const h = hitTest(which, sx, sy);
    if (h !== hover[which]) {
      hover[which] = h;
      cv.style.cursor = h ? 'grab' : 'default';
      update(false);
    }
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    rebuildIfCounts();
    update();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => {
    if (hover[which] && !drag) { hover[which] = null; update(false); }
  });
}

let listCounts = '';
function rebuildIfCounts() {
  const c = `${state.wallPts.length}/${state.wild.length}`;
  if (c !== listCounts) { listCounts = c; rebuildLists(); }
}

/* ------------------------------------------------------------------ */
/* URL state (shareable links)                                         */
/* ------------------------------------------------------------------ */

// Layout values travel in the hash as compact number lists.
const CODECS = {
  wallPts: {
    enc: a => a.map(p => `${+p.x.toFixed(2)},${+p.z.toFixed(2)}`).join(';'),
    dec: s => s ? s.split(';').map(t => { const [x, z] = t.split(',').map(Number); return { x, z }; }) : [],
  },
  wild: {
    enc: a => a.map(w => [w.x, w.z, w.rot, w.w, w.h, w.b].map(v => +(+v).toFixed(2)).join(',')).join(';'),
    dec: s => s ? s.split(';').map(t => { const [x, z, rot, w, h, b] = t.split(',').map(Number); return { x, z, rot, w, h, b }; }) : [],
  },
  ceil: {
    enc: c => [c.x, c.z, c.w, c.d, c.h, c.rot].map(v => +(+v).toFixed(2)).join(','),
    dec: s => { const [x, z, w, d, h, rot] = s.split(',').map(Number); return { x, z, w, d, h, rot }; },
  },
};

function loadHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (!p.has('mode')) {
    try { const m = localStorage.getItem('dofovision-mode'); if (m) state.mode = m; } catch (e) { /* default */ }
  }
  for (const k of Object.keys(DEFAULTS)) {
    if (!p.has(k)) continue;
    const v = p.get(k), d = DEFAULTS[k];
    if (CODECS[k]) { try { state[k] = CODECS[k].dec(v); } catch (e) { /* keep default */ } }
    else if (typeof d === 'number') state[k] = isFinite(+v) && v !== '' ? +v : d;
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
      if (CODECS[k]) {
        // Layout keys only appear once used, so ordinary links stay short.
        if ((k === 'wallPts' && state.wallMode !== 'custom') || (k === 'wild' && !state.wild.length) || (k === 'ceil' && !state.ceilOn)) continue;
        p.set(k, CODECS[k].enc(v));
      } else {
        p.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'number' ? String(+v.toFixed(3)) : v);
      }
    }
    history.replaceState(null, '', '#' + p.toString());
  }, 250);
}

/* ------------------------------------------------------------------ */
/* Main loop                                                           */
/* ------------------------------------------------------------------ */

function update(persist = true) {
  normalise();
  // Show the right layout before drawing, so each canvas has its real size.
  document.body.dataset.mode = state.mode;
  const o = compute();
  lastO = o;
  drawTop(o);
  if (state.mode === 'advanced') drawSide(o);
  renderReadouts(o);
  sync(o);
  const msg = drag ? (HINTS[drag.target] || (drag.target.endsWith(':side') ? 'Moving the wild wall: left/right = back/forward, up/down = bottom edge' : 'Moving')) : '';
  document.querySelectorAll('.drag-hint').forEach(el => { el.textContent = el.dataset.view === drag?.which ? msg : ''; });
  if (persist) saveHash();
}

function init() {
  readColors();
  loadHash();
  buildControls();
  listCounts = `${state.wallPts.length}/${state.wild.length}`;
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
