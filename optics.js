'use strict';

/*
 * Pure optics / geometry maths for DoFoVision (LED wall focus planner).
 * No DOM access, so it can be unit-tested in Node (see tests/).
 *
 * Units: distances in metres unless a name says otherwise (…Mm = millimetres).
 */
const Optics = (() => {
  /* ---------------- Depth of field (thin lens) ---------------- */

  // f: focal length (m), N: f-number, c: circle of confusion (m), s: focus distance (m).
  function dof(f, N, c, s) {
    const H = (f * f) / (N * c) + f;
    const near = (s * (H - f)) / (H + s - 2 * f);
    const far = s < H ? (s * (H - f)) / (H - s) : Infinity;
    return { H, near, far };
  }

  // Diameter (m) of the defocus blur disc on the sensor for an object at depth d
  // when the lens is focused at s. Exact thin-lens result:  b = f²·|d − s| / (N·d·(s − f)).
  function blurDiameter(f, N, s, d) {
    return (f * f * Math.abs(d - s)) / (N * d * (s - f));
  }

  // Lens-to-sensor distance when focused at s.
  const imageDistance = (f, s) => (f * s) / (s - f);

  // f-number at which the far limit lands exactly on distance D (D > s).
  function stopForFarLimit(f, c, s, D) {
    const H = (s * (D - f)) / (D - s);
    return (f * f) / (c * (H - f));
  }

  // Furthest focus distance whose far limit stays in front of D.
  function maxFocusForFarLimit(f, N, c, D) {
    const H = (f * f) / (N * c) + f;
    return (D * H) / (H - f + D);
  }

  /*
   * Focus distance and f-number that put the near and far limits exactly at
   * `near` and `far` (far may be Infinity). Used when the depth of field is
   * dragged. With h = H − f the limits are near = s·h / (h + s − f) and
   * far = s·h / (h − s + f), so
   *   1/near + 1/far = 2/s            →  s = 2·near·far / (near + far)
   *   1/near − 1/far = 2(s − f)/(s·h)  →  h = 2(s − f) / (s·(1/near − 1/far))
   * and N = f² / (c·h).
   */
  function focusForLimits(f, c, near, far) {
    const inv = 1 / near + (isFinite(far) ? 1 / far : 0);
    const s = 2 / inv;
    const h = (2 * (s - f)) / (s * (1 / near - (isFinite(far) ? 1 / far : 0)));
    return { s, N: (f * f) / (c * h) };
  }

  /* ---------------- Defocus MTF (for moiré) ---------------- */

  // Bessel function of the first kind, order 1 (Numerical Recipes rational approximation).
  function besselJ1(x) {
    const ax = Math.abs(x);
    if (ax < 8) {
      const y = x * x;
      const a1 = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1
        + y * (-2972611.439 + y * (15704.48260 + y * -30.16036606)))));
      const a2 = 144725228442.0 + y * (2300535178.0 + y * (18583304.74
        + y * (99447.43394 + y * (376.9991397 + y))));
      return a1 / a2;
    }
    const z = 8 / ax, y = z * z, xx = ax - 2.356194491;
    const p = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
    const q = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
    const ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
    return x < 0 ? -ans : ans;
  }

  // Contrast left in a periodic pattern of period p after blurring by a uniform
  // disc of diameter b (the MTF of a defocus disc): |2·J1(x)/x|, x = π·b/p.
  function defocusContrast(b, p) {
    const x = (Math.PI * b) / p;
    if (x < 1e-6) return 1;
    return Math.abs((2 * besselJ1(x)) / x);
  }

  /*
   * Moiré risk for one axis of the LED grid.
   *   pImg      – LED pitch as imaged on the sensor (mm)
   *   photosite – sensor photosite pitch (mm)
   *   blur      – defocus blur disc on the sensor (mm)
   * Levels: 0 grid blurred away, 1 grid resolved but well sampled (LED pixels may be visible),
   *         2 moderate moiré risk, 3 high moiré risk.
   * A Bayer sensor samples each colour every 2 photosites, so patterns finer than
   * 4 photosites per cycle can alias into colour moiré; finer than 2 aliases in luma too.
   */
  const CONTRAST_GONE = 0.1;
  const CONTRAST_STRONG = 0.3;
  const BAYER_LIMIT = 4;
  function moireLevel(pImg, photosite, blur) {
    const contrast = defocusContrast(blur, pImg);
    const ratio = pImg / photosite;
    let level;
    if (contrast < CONTRAST_GONE) level = 0;
    else if (ratio >= BAYER_LIMIT) level = 1;
    else level = contrast >= CONTRAST_STRONG ? 3 : 2;
    return { level, contrast, ratio };
  }
  // Blur (as a multiple of the imaged pitch) that keeps grid contrast below CONTRAST_GONE
  // everywhere beyond it: |2J1(x)/x| < 0.1 for all x > ~6.5, i.e. b > ~2.1·pImg.
  const SAFE_BLUR_RATIO = 2.1;

  /* ---------------- LED wall geometry (plan view) ---------------- */
  /*
   * The wall is an arc of length W (panels bend, they don't stretch) spanning a total
   * angle `curveDeg`. Positive = concave (wraps around the stage), negative = convex,
   * 0 = flat. The centre of the wall face sits at (x = 0, z = 0) and faces +z.
   */
  function wallShape(W, curveDeg) {
    const theta = (curveDeg * Math.PI) / 180;
    const flat = Math.abs(theta) < 1e-4;
    return { W, theta, flat, R: flat ? Infinity : W / theta };
  }

  // Point on the wall face at u ∈ [0, 1] (left → right), with the unit normal pointing
  // toward the stage (nx, nz) and the unit tangent (tx, tz).
  function wallPlan(shape, u) {
    if (shape.flat) return { x: (u - 0.5) * shape.W, z: 0, nx: 0, nz: 1, tx: 1, tz: 0 };
    const phi = (u - 0.5) * shape.theta;
    const s = Math.sin(phi), c = Math.cos(phi);
    return { x: shape.R * s, z: shape.R * (1 - c), nx: -s, nz: c, tx: c, tz: s };
  }

  // u parameter for a point already on the wall's (extended) surface.
  function wallU(shape, x, z) {
    if (shape.flat) return x / shape.W + 0.5;
    const phi = Math.atan2(x / shape.R, (shape.R - z) / shape.R);
    return phi / shape.theta + 0.5;
  }

  /*
   * Horizontal ray (origin ox,oz; unit direction dx,dz) against the wall.
   * Returns the nearest front-facing hit on the wall itself, or else the nearest hit on
   * the wall's extended surface (onWall = false), or null.
   */
  function rayWall(shape, ox, oz, dx, dz) {
    const ts = [];
    if (shape.flat) {
      if (Math.abs(dz) > 1e-12) ts.push(-oz / dz);
    } else {
      const px = ox, pz = oz - shape.R; // relative to the circle centre (0, R)
      const b = px * dx + pz * dz;
      const cc = px * px + pz * pz - shape.R * shape.R;
      const disc = b * b - cc;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        ts.push(-b - sq, -b + sq);
      }
    }
    let ghost = null;
    for (const t of ts.filter(t => t > 1e-9).sort((a, b) => a - b)) {
      const x = ox + t * dx, z = oz + t * dz;
      const u = wallU(shape, x, z);
      const onArc = u >= 0 && u <= 1;
      const n = wallPlan(shape, clamp01(u));
      const facing = n.nx * -dx + n.nz * -dz > 0;
      const hit = { t, x, z, u, onWall: onArc && facing };
      if (hit.onWall) return hit;
      if (!ghost && facing) ghost = hit;
    }
    return ghost;
  }

  // Signed clearance of a plan point in front of the wall's extended surface (m).
  // Positive = on the stage side.
  function frontClearance(shape, x, z) {
    if (shape.flat) return z;
    const d = Math.hypot(x, z - shape.R);
    return shape.R > 0 ? shape.R - d : d + shape.R; // concave: inside circle; convex: outside
  }

  // Move a plan point so it is at least `margin` in front of the wall surface.
  function keepInFront(shape, x, z, margin) {
    if (frontClearance(shape, x, z) >= margin) return { x, z };
    if (shape.flat) return { x, z: margin };
    const cx = 0, cz = shape.R;
    let dx = x - cx, dz = z - cz;
    let d = Math.hypot(dx, dz);
    if (d < 1e-9) { dx = 0; dz = -Math.sign(shape.R); d = 1; }
    const target = shape.R > 0 ? Math.max(0, shape.R - margin) : -shape.R + margin;
    return { x: cx + (dx / d) * target, z: cz + (dz / d) * target };
  }

  const clamp01 = u => Math.min(1, Math.max(0, u));

  /* ---------------- Polyline walls (custom shapes, wild walls) ---------------- */
  /*
   * A custom wall is a chain of flat panels through plan points [{x, z}, ...],
   * listed left → right as seen from the stage. Each segment's LED face points
   * to the left of its direction of travel: tangent (tx, tz), normal (−tz, tx),
   * which matches wallPlan for flat and curved walls.
   */
  function polyBuild(pts) {
    const segs = [];
    let L = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-9) continue;
      const tx = (b.x - a.x) / len, tz = (b.z - a.z) / len;
      segs.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z, len, tx, tz, nx: -tz, nz: tx, s0: L });
      L += len;
    }
    return { pts, segs, L };
  }

  // Point at u ∈ [0, 1] along the chain's length, with normal and tangent.
  function polyAt(poly, u) {
    const segs = poly.segs;
    if (!segs.length) return { x: 0, z: 0, nx: 0, nz: 1, tx: 1, tz: 0 };
    const s = clamp01(u) * poly.L;
    let seg = segs[segs.length - 1];
    for (const g of segs) if (s <= g.s0 + g.len) { seg = g; break; }
    const k = (s - seg.s0) / seg.len;
    return { x: seg.x0 + k * (seg.x1 - seg.x0), z: seg.z0 + k * (seg.z1 - seg.z0), nx: seg.nx, nz: seg.nz, tx: seg.tx, tz: seg.tz };
  }

  // Nearest front-facing hit of a horizontal ray on the chain: {t, x, z, u, onWall} or null.
  function rayPoly(poly, ox, oz, dx, dz) {
    let best = null;
    for (const g of poly.segs) {
      const ex = g.x1 - g.x0, ez = g.z1 - g.z0;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-12) continue;
      const wx = g.x0 - ox, wz = g.z0 - oz;
      const t = (wx * ez - wz * ex) / den;
      const k = (wx * dz - wz * dx) / den;
      if (t <= 1e-9 || k < -1e-9 || k > 1 + 1e-9) continue;
      if (g.nx * -dx + g.nz * -dz <= 0) continue; // seeing the back of the panel
      if (!best || t < best.t) best = { t, x: ox + t * dx, z: oz + t * dz, u: (g.s0 + clamp01(k) * g.len) / poly.L, onWall: true };
    }
    return best;
  }

  // Signed clearance of a plan point in front of the chain (positive = LED side).
  // Points whose nearest spot is an end of the chain are treated as clear.
  function polyClearance(poly, x, z) {
    let best = null;
    for (const g of poly.segs) {
      const k = ((x - g.x0) * g.tx + (z - g.z0) * g.tz) / g.len;
      const kc = clamp01(k);
      const px = g.x0 + kc * (g.x1 - g.x0), pz = g.z0 + kc * (g.z1 - g.z0);
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, g, inside: k >= 0 && k <= 1, side: (x - px) * g.nx + (z - pz) * g.nz };
    }
    if (!best || !best.inside) return Infinity;
    return best.side;
  }

  // Move a plan point so it is at least `margin` in front of the chain.
  function polyKeepInFront(poly, x, z, margin) {
    const c = polyClearance(poly, x, z);
    if (c >= margin) return { x, z };
    let best = null;
    for (const g of poly.segs) {
      const k = clamp01(((x - g.x0) * g.tx + (z - g.z0) * g.tz) / g.len);
      const px = g.x0 + k * (g.x1 - g.x0), pz = g.z0 + k * (g.z1 - g.z0);
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, px, pz, g };
    }
    return { x: best.px + best.g.nx * margin, z: best.pz + best.g.nz * margin };
  }

  // Plan points sampling a flat or curved wall, for turning it into a custom shape.
  function arcPoints(W, curveDeg, n) {
    const shape = wallShape(W, curveDeg);
    const count = shape.flat ? 2 : Math.max(2, n);
    const out = [];
    for (let i = 0; i < count; i++) {
      const p = wallPlan(shape, i / (count - 1));
      out.push({ x: +p.x.toFixed(3), z: +p.z.toFixed(3) });
    }
    return out;
  }

  // A flat panel of width w centred on (x, z), turned `rotDeg` from facing +z.
  function panelPoints(x, z, rotDeg, w) {
    const a = (rotDeg * Math.PI) / 180;
    const tx = Math.cos(a), tz = -Math.sin(a);
    return [{ x: x - (tx * w) / 2, z: z - (tz * w) / 2 }, { x: x + (tx * w) / 2, z: z + (tz * w) / 2 }];
  }

  // Corners of a rectangle (w along its own x, d along its own z) centred on (x, z),
  // turned rotDeg, in order around the edge.
  function rectCorners(x, z, w, d, rotDeg) {
    const a = (rotDeg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => {
      const lx = (i * w) / 2, lz = (j * d) / 2;
      return { x: x + lx * ca + lz * sa, z: z - lx * sa + lz * ca };
    });
  }

  // Range of t where the ray (ox,oz)+t(dx,dz), t > 0, runs inside a convex polygon.
  function rayConvexInterval(corners, ox, oz, dx, dz) {
    let t0 = 0, t1 = Infinity;
    const n = corners.length;
    // Orientation so that "inside" is on a consistent side of every edge.
    let area = 0;
    for (let i = 0; i < n; i++) { const a = corners[i], b = corners[(i + 1) % n]; area += a.x * b.z - b.x * a.z; }
    const sgn = area > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const a = corners[i], b = corners[(i + 1) % n];
      // Inward normal of edge a→b
      const nx = -(b.z - a.z) * sgn, nz = (b.x - a.x) * sgn;
      const num = (ox - a.x) * nx + (oz - a.z) * nz; // ≥ 0 inside
      const den = dx * nx + dz * nz;
      if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
      const t = -num / den;
      if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
    return isFinite(t1) && t1 > t0 ? [t0, t1] : null;
  }

  return {
    dof, blurDiameter, imageDistance, stopForFarLimit, maxFocusForFarLimit, focusForLimits,
    besselJ1, defocusContrast, moireLevel, SAFE_BLUR_RATIO, BAYER_LIMIT,
    wallShape, wallPlan, wallU, rayWall, frontClearance, keepInFront,
    polyBuild, polyAt, rayPoly, polyClearance, polyKeepInFront, arcPoints, panelPoints,
    rectCorners, rayConvexInterval,
  };
})();

if (typeof module !== 'undefined') module.exports = Optics;
