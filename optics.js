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

  return {
    dof, blurDiameter, imageDistance, stopForFarLimit, maxFocusForFarLimit,
    besselJ1, defocusContrast, moireLevel, SAFE_BLUR_RATIO, BAYER_LIMIT,
    wallShape, wallPlan, wallU, rayWall, frontClearance, keepInFront,
  };
})();

if (typeof module !== 'undefined') module.exports = Optics;
