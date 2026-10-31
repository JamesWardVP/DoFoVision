'use strict';

/*
 * Browser smoke test: loads the page in headless Chromium, checks for script errors,
 * horizontal overflow on a phone-width screen, numeric cross-checks against hand-derived
 * geometry, and the main controls. Screenshots are written to screenshots/ (git-ignored).
 *
 * Setup (once):  npm install && npx playwright install chromium
 * Run:           npm run smoke
 */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const pageUrl = hash => 'file://' + path.join(root, 'index.html') + (hash || '');
const shotDir = path.join(root, 'screenshots');
fs.mkdirSync(shotDir, { recursive: true });

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${msg}`);
  if (!ok) failures++;
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const SCENES = [
  ['simple', '', 1400, 'dark'],
  ['simple-phone', '#mode=simple&fstopIdx=22&subZ=1.5&camZ=4', 390, 'light'],
  ['default', '#mode=advanced', 1400, 'dark'],
  ['wall-in-focus', '#mode=advanced&fstopIdx=22&subZ=1.5&camZ=4&pitch=1.2', 1400, 'light'],
  ['concave', '#mode=advanced&curve=150&wallW=14&camZ=5&camX=1&subX=-0.5&subZ=2.5&focal=24&stageDepth=8', 1400, 'dark'],
  ['convex', '#mode=advanced&curve=-70&camX=-3&camZ=5&subX=1&subZ=2.5&fstopIdx=15', 1400, 'dark'],
  ['phone', '#mode=advanced&curve=120&fstopIdx=20&subZ=1.5&camZ=4', 390, 'dark'],
  ['custom-wall', '#mode=advanced&wallMode=custom&wallPts=-6,3;-4,0;4,0;6,3&camZ=6&focal=18', 1400, 'dark'],
  ['wild-and-ceiling', '#mode=advanced&wildOn=1&wild=-4.5,3,90,4,3,0;4.5,3,-90,4,3,0&ceilOn=1&ceil=0,3,10,6,3.2,0&camY=1&aimH=2.2&fstopIdx=20', 1400, 'dark'],
];

// Uses Playwright's own Chromium; if that build isn't installed, set CHROMIUM_PATH to any
// Chromium/Chrome executable instead (e.g. /opt/pw-browsers/chromium in the cloud container).
async function launch() {
  const executablePath = process.env.CHROMIUM_PATH;
  try {
    return await chromium.launch(executablePath ? { executablePath } : {});
  } catch (e) {
    const fallback = '/opt/pw-browsers/chromium';
    if (executablePath || !fs.existsSync(fallback)) throw e;
    return chromium.launch({ executablePath: fallback });
  }
}

(async () => {
  const browser = await launch();

  console.log('Scenes');
  for (const [name, hash, width, scheme] of SCENES) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: scheme });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await page.goto(pageUrl(hash));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const status = (await page.textContent('#status')).trim();
    check(errors.length === 0, `${name}: no script errors ${errors.length ? JSON.stringify(errors) : ''}`);
    check(scrollWidth <= width, `${name}: no horizontal scroll (${scrollWidth}px ≤ ${width}px)`);
    check(status.length > 0, `${name}: status "${status}"`);
    await page.close();
  }

  console.log('Geometry cross-checks');
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(pageUrl('#mode=advanced'));
  const r = await page.evaluate(() => {
    const out = {};
    const run = patch => { Object.assign(state, structuredClone(DEFAULTS), { mode: 'advanced' }, patch); normalise(); return compute(); };

    // Level camera 5 m straight in front of a flat wall: nearest wall depth is exactly 5 m.
    let o = run({ camX: 0, camZ: 5, camY: 2, subX: 0, subZ: 3, aimH: 2 });
    out.straightMin = o.wall.minDepth;
    const n = Optics.wallPlan(o.shape, 0.5);
    const m = moireAt({ p: v3(0, 2, 0), n: v3(n.nx, 0, n.nz), t: v3(n.tx, 0, n.tz) }, o, 5);
    out.pImg = m.pImgMm; out.pImgExpected = state.pitch * (o.v / 5);
    out.blur = m.blurMm; out.blurExpected = 1000 * (o.f * o.f * (5 - o.s)) / (o.N * 5 * (o.s - o.f));
    out.hfov = o.hfov; out.hfovExpected = 2 * Math.atan(state.sensorW / (2 * state.focal));

    // Camera at the centre of a 120° concave wall, level: furthest visible depth = radius.
    o = run({ curve: 120, camX: 0, camY: 2, aimH: 2, subX: 0 });
    state.camZ = o.shape.R; state.subZ = o.shape.R - 2; o = compute();
    out.R = o.shape.R; out.concaveMax = o.wall.maxDepth;

    // In-focus flag agrees with blur ≤ CoC at every sampled visible wall point.
    o = run({ fstopIdx: 22, subZ: 1.5, camZ: 4, curve: 40 });
    let bad = 0, checked = 0;
    for (let i = 0; i <= 40; i++) for (let j = 0; j <= 10; j++) {
      const e = evalWallPoint(wallPoint(o.shape, i / 40, j / 10), o);
      if (!e.visible) continue;
      checked++;
      if (e.inFocus !== (Optics.blurDiameter(o.f, o.N, o.s, e.depth) <= o.c * (1 + 1e-9))) bad++;
    }
    out.checked = checked; out.bad = bad;

    // A two-point custom wall is the same flat wall: straight-on depth is still 5 m.
    o = run({ wallMode: 'custom', wallPts: [{ x: -5, z: 0 }, { x: 5, z: 0 }], camX: 0, camZ: 5, camY: 2, subX: 0, subZ: 3, aimH: 2 });
    out.customMin = o.wall.minDepth;
    // A wild wall 2 m in front of the camera, facing it, square-on: nearest LED at 2 m.
    o = run({ camX: 0, camZ: 8, camY: 2, subX: 0, subZ: 3, aimH: 2, wildOn: true, wild: [{ x: 0, z: 10, rot: 180, w: 4, h: 4, b: 0 }] });
    state.camZ = 8; state.subZ = 12; o = compute();
    out.wildMin = o.results[1].minDepth; out.wildName = o.results[1].S.name;
    // Ceiling 1 m above a camera that looks 45° up: the axis meets it at √2 m.
    o = run({ camX: 0, camZ: 6, camY: 2, subX: 0, subZ: 4, aimH: 4, ceilOn: true, ceil: { x: 0, z: 4, w: 6, d: 6, h: 3, rot: 0 } });
    const ceil = o.results.find(x => x.S.kind === 'h');
    out.ceilVisible = ceil.visible > 0; out.ceilMin = ceil.minDepth;

    // Dragging the far limit to 6 m (near fixed) lands it there, to within a third of a stop.
    o = run({ focusAuto: false, focus: 3, fstopIdx: FSTOPS.indexOf(2.8) });
    lastO = o; const near0 = o.near;
    dragDepth('far', 6); o = compute();
    out.dragNear = [near0, o.near]; out.dragFar = o.far; out.dragStop = FSTOPS[state.fstopIdx];

    state = structuredClone(DEFAULTS); state.mode = 'advanced'; update();
    return out;
  });
  check(near(r.straightMin, 5), `nearest wall depth straight-on = 5 m (got ${r.straightMin})`);
  check(near(r.pImg, r.pImgExpected, 1e-9), `imaged LED pitch = pitch·v/d (${r.pImg.toFixed(5)} mm)`);
  check(near(r.blur, r.blurExpected, 1e-9), `blur at wall = f²|d−s|/(N·d·(s−f)) (${r.blur.toFixed(5)} mm)`);
  check(near(r.hfov, r.hfovExpected, 1e-12), 'horizontal FOV = 2·atan(w / 2f)');
  check(near(r.concaveMax, r.R, 1e-6), `concave wall from its centre: max depth = R (${r.R.toFixed(3)} m)`);
  check(r.checked > 0 && r.bad === 0, `in-focus flag matches blur ≤ CoC at ${r.checked} points`);
  check(near(r.customMin, 5, 1e-9), `two-point custom wall straight-on = 5 m (got ${r.customMin})`);
  check(near(r.wildMin, 2, 1e-6) && r.wildName === 'Wild wall 1', `wild wall facing the camera at 2 m (got ${r.wildMin})`);
  check(r.ceilVisible && r.ceilMin > 0 && r.ceilMin < 2, `LED ceiling is analysed (nearest ${r.ceilMin.toFixed(3)} m)`);
  check(Math.abs(r.dragFar - 6) / 6 < 0.12 && Math.abs(r.dragNear[1] - r.dragNear[0]) / r.dragNear[0] < 0.05,
    `dragging the far limit to 6 m → far ${r.dragFar.toFixed(2)} m, near ${r.dragNear[0].toFixed(2)} → ${r.dragNear[1].toFixed(2)} m at f/${r.dragStop}`);

  console.log('Controls');
  await page.fill('#sensorW', '30');
  await page.press('#sensorW', 'Enter');
  let v = await page.evaluate(() => [state.body, state.sensorW]);
  check(v[0] === 'custom' && v[1] === 30, 'typing a sensor width switches to Custom');
  await page.selectOption('#body', 'apsc');
  v = await page.evaluate(() => [state.sensorW, state.sensorH, document.getElementById('sensorW').value]);
  check(v[0] === 23.5 && v[1] === 15.6 && v[2] === '23.5', 'choosing APS-C fills 23.5 × 15.6 mm');
  await page.selectOption('#pitchSel', '1.2');
  check(await page.evaluate(() => state.pitch) === 1.2, 'pitch preset 1.2 mm');
  await page.fill('#pitch', '3.1');
  await page.press('#pitch', 'Enter');
  v = await page.evaluate(() => [state.pitch, document.getElementById('pitchSel').value]);
  check(v[0] === 3.1 && v[1] === 'custom', 'custom pitch entry shows "Custom…"');
  await page.fill('#in-curve', '90');
  await page.locator('#in-curve').dispatchEvent('input');
  v = await page.evaluate(() => [state.curve, document.getElementById('curve-info').textContent]);
  check(v[0] === 90 && v[1].includes('radius 6.37 m'), `curvature slider → ${v[1]}`);

  // Dragging the camera in the top view moves it.
  const before = await page.evaluate(() => [state.camX, state.camZ]);
  const t = await page.evaluate(() => {
    const r = document.getElementById('top').getBoundingClientRect();
    return [r.x + topView.X(state.camX), r.y + topView.Y(state.camZ)];
  });
  await page.mouse.move(t[0], t[1]);
  await page.mouse.down();
  await page.mouse.move(t[0] + 80, t[1] - 40, { steps: 5 });
  await page.mouse.up();
  const after = await page.evaluate(() => [state.camX, state.camZ]);
  check(after[0] > before[0] && after[1] < before[1], `dragging the camera moves it (${before} → ${after})`);

  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : `\nAll checks passed. Screenshots in screenshots/`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
