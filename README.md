# LED Wall Focus Planner

A simple, dependency-free web tool that shows how **field of view** and **depth of field** interact with an **LED volume wall**, and warns you when the wall itself falls into focus. When the wall is in focus, its pixel grid and seams show up and moiré becomes likely.

## Using it

Open `index.html` in a browser. There is no build step and no dependencies. It also works as-is on GitHub Pages: set **Settings → Pages → Deploy from branch** to the repo root.

- **Top view** shows the camera, the subject (a person), the horizontal FOV, the DOF band, the focus plane and the near, far and hyperfocal points. Drag the camera or the subject to move them.
- **Side view** is a vertical slice along the camera's line of sight. Drag the camera to change the lens height, or drag the aim point to change where on the subject the camera points.
- **LED wall:** width, height, bottom-edge height and **curvature**. Curvature is the total arc angle: positive is concave (the wall wraps around the stage), negative is convex and 0 is flat. The width stays the arc length, the same way curved LED panels bend rather than stretch.
- **LED pixel pitch:** presets (1.2, 1.4, 1.5, 1.9, 2.3, 2.6, 2.8 mm) or any custom value.
- **Camera / sensor format:** generic formats (Full Frame, Large Format 65, Medium Format, VistaVision, APS-H, Super 35 3/4-perf, APS-C, Micro Four Thirds, 1-inch, Super 16, 2/3-inch) and cinema camera presets. The sensor width and height boxes are always editable, and typing a size switches to "Custom". Horizontal resolution sets the photosite size used by the moiré check. You can also set the camera position and lens height.
- **Lens and focus:** focal length, aperture (third stops f/1–f/22) and focus distance. Focus can follow the subject, or you can set it by hand. The circle of confusion is calculated automatically (sensor diagonal ÷ 1500), or you can enter your own.
- **Hazard stripes** appear on every part of the wall that is both in frame and inside the depth of field. The header banner also turns into a hazard warning.
- **Moiré check:** the wall shows a red or orange strip, and the readouts show the risk level, the LED pitch as imaged on the sensor, and the defocus blur at the wall.
- **Guidance** tells you which aperture would bring the wall into focus, or which aperture would throw it out of focus. It also tells you the furthest you can focus before the wall sharpens.
- The whole scene is saved in the URL, so you can share a set-up by copying the link.

## How it works

- Thin-lens DOF: `H = f²/(N·c) + f`, `near = s(H−f)/(H+s−2f)`, `far = s(H−f)/(H−s)` (∞ when `s ≥ H`).
- Defocus blur at depth `d`: `b = f²·|d − s| / (N·d·(s − f))`. It equals the CoC exactly at the near and far limits, so "in focus" means blur ≤ CoC.
- Moiré: the LED pitch is projected onto the sensor along both grid axes, including foreshortening on angled or curved panels. The remaining grid contrast is the MTF of a uniform defocus disc, `|2·J1(x)/x|` with `x = π·b / imaged pitch`. Risk is high when a pattern finer than 4 photosites per LED pixel (the Bayer colour sampling limit) keeps at least 30% contrast, and moderate at 10–30%. The disc MTF has side lobes, so a slightly *more* blurred area can show weak, contrast-reversed grid again. Lens sharpness and optical low-pass filters are not modelled, so the estimate is conservative.
- The wall face is sampled on a grid. For each sample point, the tool checks whether it is inside the camera frustum. It then compares the point's depth along the lens axis with the near and far limits. The focus plane is perpendicular to the lens axis, so a panned camera sees one side of the wall closer than the other.

## Local development

Requires Node 18 or newer. Nothing else is needed to run the page or the unit tests.

```bash
git clone https://github.com/JamesWardVP/FOVDOFCalc.git
cd FOVDOFCalc
git checkout claude/led-wall-dof-tool-jk45lr   # if this branch is not the default yet
npm start                                       # http://localhost:8000
npm test                                        # maths unit tests (optics.js)
```

Optional browser smoke test (page errors, phone layout, geometry cross-checks, controls). It also saves screenshots to `screenshots/`:

```bash
npm install
npx playwright install chromium
npm run smoke        # or: npm run check  (unit tests + smoke test)
```

See `CLAUDE.md` for the code layout and conventions.
