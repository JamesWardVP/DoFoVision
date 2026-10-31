# CLAUDE.md

Guidance for Claude Code (and humans) working on this repository.

## What this is

**LED Wall Focus Planner**: a single-page, dependency-free web tool for virtual production. It shows a camera's field of view and depth of field against an LED volume wall, in a top view and a side view. It warns, with hazard stripes, when any visible part of the wall falls inside the depth of field, and estimates moiré from the LED pixel pitch.

Users can:
- set wall width, height, bottom edge, curvature and pixel pitch
- pick a camera or sensor format, or enter a custom sensor size and resolution
- drag the camera and the subject (a person)
- set focal length, aperture, focus distance and circle of confusion

## Commands

```bash
npm start          # http://localhost:8000 (zero-dependency server, scripts/serve.js)
npm test           # unit tests for the maths (node --test, no install needed)
npm run smoke      # headless-browser checks + screenshots in screenshots/ (needs setup below)
npm run check      # both
```

The page also runs straight from disk: just open `index.html`.

First-time setup for the smoke test:

```bash
npm install
npx playwright install chromium
```

If Playwright's own browser can't be installed, run with `CHROMIUM_PATH=/path/to/chrome npm run smoke`.

**Before committing, run `npm run check`.** If you change maths, add or extend a test in `tests/optics.test.js` with an independently derived expected value. Don't copy the number from the code.

## Files

| File | Role |
|---|---|
| `index.html` | Page shell: control panels, two `<canvas>` views, readouts, legend. Loads `optics.js`, then `app.js`. |
| `optics.js` | **Pure maths, no DOM.** DOF, blur disc, inverse helpers, Bessel J1 and defocus MTF, moiré levels, curved-wall geometry, ray/wall intersection, keep-in-front constraint. Works in the browser (global `Optics`) and in Node (`module.exports`). |
| `app.js` | State, scene analysis, canvas drawing, readouts and guidance, controls, dragging, URL-hash persistence. |
| `style.css` | Layout and theme. Colours are CSS custom properties on `:root`, with dark-mode overrides. The canvases read them via `readColors()`. |
| `tests/optics.test.js` | `node:test` unit tests for `optics.js`. |
| `scripts/serve.js` | Static server for local development. |
| `scripts/smoke.js` | Playwright smoke test: scenes, phone-width overflow, geometry cross-checks, controls, dragging. |

## Architecture (app.js)

Everything flows through `update()`:

```
normalise()      clamp state; force preset sensor dims; keep camera/subject in front of the wall
compute()        → o: camera basis, DOF (Optics.dof), FOV, wall shape, analyseWall(o), sightSection(o)
drawTop(o)       plan view: horizontal slice through the lens axis, projected onto the floor
drawSide(o)      vertical slice along the camera heading (the camera is at s = 0)
renderReadouts(o) stat tiles, guidance list, status banner
sync(o)          push state back into the inputs
saveHash()       debounced; writes every DEFAULTS key into location.hash
```

- **Coordinates (metres):** x runs across the stage, y is height, z points away from the wall towards the camera. The centre of the wall face is at (0, ·, 0), facing +z.
- **Wall:** an arc of constant length `wallW` spanning `curve` degrees. Positive is concave, negative is convex, 0 is flat (`Optics.wallShape` / `wallPlan`). `wallPoint(shape, u, v)` returns position, normal and tangent.
- **Analysis:** `analyseWall` samples the wall face on a grid of `WALL_NU × WALL_NV` points. `evalWallPoint` culls back-facing points, tests the frustum, tests the DOF (axial depth between near and far), and runs `moireAt`.
- **Focus geometry:** depth is measured along the optical axis, because the focus plane is perpendicular to it. "In focus" means blur ≤ CoC, which is exactly the near/far test.
- **Moiré:** the LED pitch is projected onto the sensor along the wall tangent and vertical. That is compared with the photosite size (`sensorW / resH`), and the remaining grid contrast is the defocus-disc MTF `|2J1(x)/x|`. Levels: 0 low, 1 grid visible, 2 moderate, 3 high. See the comment in `optics.js`.

## Conventions and gotchas

- **No build step and no runtime dependencies.** Plain ES2020 in classic `<script>` tags. Keep it working when opened from `file://`. Playwright is a dev-only dependency.
- Put new maths in `optics.js` with tests, not inline in `app.js`.
- **`DEFAULTS` keys are the URL-hash keys.** Renaming or removing one breaks shared links. Add new keys instead, and keep `normalise()` tolerant of missing or odd values.
- Sliders are generated from `SLIDERS`. Use `log: true` for log-scale sliders, `format` for an output-only row, and `dyn: 'x' | 'z'` when the range follows `stageBounds()`.
- To add a camera, add an entry to `CAMERAS` (`group`, `w`, `h` in mm, `res` as horizontal photosites in that recording mode). `normalise()` overwrites `sensorW`/`sensorH` from the preset unless `body === 'custom'`.
- Pitch presets live in `PITCHES`.
- When `focusAuto` is on, `compute()` overwrites `state.focus` with the subject distance. Moving the focus slider turns it off.
- New colours need a token on `:root`, plus both dark-mode blocks in `style.css`, plus the name added in `readColors()`.
- Layout must still work at 390 px width with no horizontal scroll. The smoke test checks this.
- The moiré disc MTF has side lobes, so a slightly *more* blurred area can show a weak warning again. That is intended. Lens MTF and OLPF are not modelled, so the estimate is conservative.

## Ideas not done yet

- Exact top-view drawing of the 3D frustum footprint when the camera is strongly tilted (currently a slice through the lens axis).
- Subject occluding the wall, multiple walls or a ceiling, focus breathing.
- Per-camera recording-mode picker (sensor area and resolution change with mode).
