# Intro video

The sources of `asserts/video/obi-intro.mp4`. The video is a web page: every animation is a paused Web Animation, and a frame is the page at a given time. Nothing in it is a screenshot. The VS Code window, the OBI views and the build summary are drawn in HTML, so they stay sharp at any size and their content can be changed in the code.

## Render

```sh
node scripts/video/render.mjs                 # asserts/video/obi-intro.mp4, 1920x1080, 30 fps
node scripts/video/render.mjs --scale 2       # 3840x2160
node scripts/video/render.mjs --stills 12,40.5 --out /tmp/stills   # single frames as PNG
node scripts/video/render.mjs --small-copy 10 # asserts/video/obi-intro-small.mp4, less than 10 MB, from the rendered video
```

* Needs Chrome or Chromium (`CHROME_PATH` overrides the search), `ffmpeg`, and `npm ci` (the icons are the codicons of `node_modules`). No further npm packages.
* Options: `--out`, `--fps`, `--scale`, `--crf` (quality, default 17; lower is better and larger), `--workers`, `--from` / `--to` (seconds).
* A full render takes a few minutes.

## Show it in the main README

GitHub only plays a video that was uploaded to GitHub. A video file of the repository is not played.

1. `node scripts/video/render.mjs --small-copy 10` writes `asserts/video/obi-intro-small.mp4`. GitHub takes videos up to 10 MB on a free plan and up to 100 MB on a paid one.
2. Drag that file into a comment box on GitHub (an issue or a pull request of this repository), **send the comment**, and copy the URL from it: `https://github.com/user-attachments/assets/…`. An upload that no saved comment refers to answers 404 for everybody else.
3. Check the URL without a login, e.g. in a private browser window, or with `curl -sIL <url> | grep -i -E "^HTTP|^content-type"` (expected: `200` and `video/mp4`).
4. Put the URL on a line of its own in `README.md`. GitHub shows a player there, the Marketplace a link.

After a new render, repeat the steps and replace the URL.

## Preview

Open `scripts/video/index.html` in Chrome. Space plays and pauses, the arrow keys step one frame (with Shift: one second), `?t=40` in the URL starts at second 40.

## Files

| File | Content |
|---|---|
| `scenes/*.js` | One file per scene, in the order of the `<script>` tags in `index.html`. Each sets its length (`dur`) and builds its elements and animations. |
| `ui.js` | Shared parts: headline, cursor, callouts, the VS Code window with the OBI views and pages, and the sample project (`SOURCES`, `PROJECT`). |
| `engine.js` | The timeline: `to` (animate), `text`, `cls`, `when`, `each`, and `seek(seconds)`. |
| `main.js` | Puts the scenes one after the other; the preview controls. |
| `video.css`, `vscode.css` | Stage and scenes; the VS Code window (theme Dark Modern). |
| `render.mjs` | Headless Chrome takes one screenshot per frame, `ffmpeg` encodes them. |
| `fonts/` | Inter and JetBrains Mono (SIL Open Font License, see the license files). |

## Change something

* **Texts and timing** of a scene: its file in `scenes/`. Times are seconds from the start of the scene (`t0`).
* **The UI changed** (a new button, another label): `ui.js` (`controller_pane`, `summary_page`, …) and `vscode.css`. The templates in `asserts/templates` are the reference.
* **Other sample data** (sources, host, deployment): `SOURCES` and `PROJECT` in `ui.js`.
* **New scene:** add `scenes/NN-name.js` with `window.SCENES.push({ id, dur, chapter, build(tl, scene, t0) { … } })` and its `<script>` tag in `index.html`.

Rules that keep the frames reproducible:

* No CSS transitions or CSS animations, no timers. Everything that moves goes through the timeline.
* Positions of callouts and of the cursor are read with `UI.rect` while the scene is built, in the layout they are shown in.
