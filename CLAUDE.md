# CLAUDE.md

Guidance for Claude Code (and humans) working on this repository.

## What this is

**DoFoVision** (an LED wall focus planner, formerly FOVDOFCalc): a single-page, dependency-free web tool for virtual production. It shows a camera's field of view and depth of field against an LED volume wall, in a top view and a side view. It warns, with hazard stripes, when any visible part of the wall falls inside the depth of field, and estimates moiré from the LED pixel pitch.

It has two modes (toggle at the top; `state.mode`):
- **Simple** (default): phone-first. Status banner, top view with big handles, four big numbers (near, focus, far, DOF), one plain-language line plus the first fix, lens chips, an aperture stepper, focus and placement sliders, camera picker.
- **Advanced**: everything below.

Users can:
- set the main wall as flat/curved (width, curvature) or a **custom shape** (a chain of flat panels through points), plus height, bottom edge and pixel pitch
- add **wild walls** (freestanding flat panels: position, angle, size) and an **LED ceiling** (rectangle: position, size, angle, height, own pitch)
- pick a camera or sensor format, or enter a custom sensor size and resolution
- drag the camera and the subject (a person), custom-wall corners, wild walls (move / turn) and the ceiling (move / resize) in the top view; in the side view, drag the camera, the talent, walls and the ceiling back / forward along the line of sight and up / down. Surfaces the line of sight misses are drawn dashed "off to the side" (or "behind the camera"); the view extends behind the camera to fit them. The flat/curved wall's back/forward offset is `wallZ`; a custom wall's points move instead.
- drag the **near or far limit**: the focus stays, the aperture is solved to put the limit there (`Optics.stopForNearLimit` / `stopForFarLimit`, rounded to a third stop); drag the **focus point** (axis marker or the end of the focus line) to move the focus. Both views.
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

If Playwright's own browser can't be installed, run with `CHROMIUM_PATH=/path/to/chrome npm run smoke` (on Windows, Edge works: `CHROMIUM_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"`).

**Before committing, run `npm run check`.** If you change maths, add or extend a test in `tests/optics.test.js` with an independently derived expected value. Don't copy the number from the code.

## Files

| File | Role |
|---|---|
| `index.html` | Page shell: control panels, two `<canvas>` views, readouts, legend. Loads `optics.js`, then `app.js`. |
| `optics.js` | **Pure maths, no DOM.** DOF, blur disc, inverse helpers (incl. `focusForLimits`), Bessel J1 and defocus MTF, moiré levels, curved-wall geometry, polyline walls (`polyBuild`, `polyAt`, `rayPoly`, `polyKeepInFront`), panels and rectangles, ray/wall and ray/rectangle intersection, keep-in-front constraints. Works in the browser (global `Optics`) and in Node (`module.exports`). |
| `app.js` | State, scene analysis, canvas drawing, readouts and guidance, controls, dragging, URL-hash persistence. |
| `style.css` | Layout and theme. Colours are CSS custom properties on `:root`, with dark-mode overrides. The canvases read them via `readColors()`. |
| `tests/optics.test.js` | `node:test` unit tests for `optics.js`. |
| `scripts/serve.js` | Static server for local development. |
| `scripts/smoke.js` | Playwright smoke test: scenes, phone-width overflow, geometry cross-checks, controls, dragging. |

## Architecture (app.js)

Everything flows through `update()`:

```
normalise()      clamp state; force preset sensor dims; keep camera/subject in front of the wall
compute()        → o: camera basis, DOF (Optics.dof), FOV, surfaces(), analyseSurface() per surface,
                   o.wall = mergeResults() (all surfaces), o.main (main wall), sightSections(o)
drawTop(o)       plan view: horizontal slice through the lens axis, projected onto the floor; registers grab handles
drawSide(o)      vertical slice along the camera heading (advanced only)
renderReadouts(o) advanced: stat tiles + guidance; simple: renderGlance(); both: status banner
sync(o)          push state back into the inputs
saveHash()       debounced; writes every DEFAULTS key into location.hash
```

- **Coordinates (metres):** x runs across the stage, y is height, z points away from the wall towards the camera. The centre of the wall face is at (0, ·, 0), facing +z.
- **Surfaces:** `surfaces()` lists every LED surface: the main wall (`mainWall()`: an arc of length `wallW` spanning `curve` degrees, or a custom polyline through `wallPts`), each wild wall (a two-point polyline), and the ceiling (a horizontal rectangle, LED face down). `surfPoint(S, u, v)` gives position, normal, grid axes and pitch. LED faces point to the left of a polyline's direction of travel, so list points left → right as seen from the stage.
- **Analysis:** `analyseSurface` samples each surface on an `nu × nv` grid. `evalWallPoint` culls back-facing points, tests the frustum, tests the DOF (axial depth between near and far), and runs `moireAt`. Surfaces don't occlude each other.
- **Dragging:** draw functions push grab points into `handles.top` / `handles.side` in priority order; `hitTest` picks the nearest, `applyDrag` moves it. Touches that start on a handle stop the page scrolling; elsewhere the canvas scrolls normally.
- **Focus geometry:** depth is measured along the optical axis, because the focus plane is perpendicular to it. "In focus" means blur ≤ CoC, which is exactly the near/far test.
- **Moiré:** the LED pitch is projected onto the sensor along the wall tangent and vertical. That is compared with the photosite size (`sensorW / resH`), and the remaining grid contrast is the defocus-disc MTF `|2J1(x)/x|`. Levels: 0 low, 1 grid visible, 2 moderate, 3 high. See the comment in `optics.js`.

## Conventions and gotchas

- **No build step and no runtime dependencies.** Plain ES2020 in classic `<script>` tags. Keep it working when opened from `file://`. Playwright is a dev-only dependency.
- Put new maths in `optics.js` with tests, not inline in `app.js`.
- **`DEFAULTS` keys are the URL-hash keys.** Renaming or removing one breaks shared links. Add new keys instead, and keep `normalise()` tolerant of missing or odd values. Array/object keys (`wallPts`, `wild`, `ceil`) go through `CODECS`. `normalise()` always replaces them with fresh copies: never mutate `DEFAULTS`.
- Sliders bound to something other than a top-level state key use `get` / `set` in their spec (ceiling, wild walls). Lists that change length are rebuilt by `rebuildLists()`.
- Sliders are generated from `SLIDERS`. Use `log: true` for log-scale sliders, `format` for an output-only row, and `dyn: 'x' | 'z'` when the range follows `stageBounds()`.
- To add a camera, add an entry to `CAMERAS` (`group`, `w`, `h` in mm, `res` as horizontal photosites in that recording mode). `normalise()` overwrites `sensorW`/`sensorH` from the preset unless `body === 'custom'`.
- Pitch presets live in `PITCHES`.
- When `focusAuto` is on, `compute()` overwrites `state.focus` with the subject distance. Moving the focus slider turns it off.
- New colours need a token on `:root`, plus both dark-mode blocks in `style.css`, plus the name added in `readColors()`.
- Layout must still work at 390 px width with no horizontal scroll. The smoke test checks this.
- The moiré disc MTF has side lobes, so a slightly *more* blurred area can show a weak warning again. That is intended. Lens MTF and OLPF are not modelled, so the estimate is conservative.

## Ideas not done yet

- Exact top-view drawing of the 3D frustum footprint when the camera is strongly tilted (currently a slice through the lens axis).
- Subject occluding the wall, one LED surface hiding another, focus breathing.
- Per-camera recording-mode picker (sensor area and resolution change with mode).
