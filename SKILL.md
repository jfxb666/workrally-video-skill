---
name: generating-video-workrally-canvas
description: Use when generating a video on WorkRally (workrally.qq.com) infinite canvas via ego-browser - image-to-video with a character reference image, Rally-Video free model, timed shot-script prompts (0-5s/5-10s/...), duration slider set to an exact seconds value, polling node progress, and verifying the rendered mp4 duration. 也用于 WorkRally / 无限画布 / Rally-Video / 图生视频 / 参考视频 / 视频生成 / 时长滑杆 / 免费额度.
---

# Generating Video on WorkRally Canvas (ego-browser)

Core principle: **WorkRally canvas is a react-flow app — locate nodes by `data-id` and controls by `aria-label` via `page.evaluate`, never by stale snapshot refs; the duration control is a continuous drag-slider, not discrete options.**

## Prerequisites

- ego-browser skill loaded; run `ego-browser skill` for the current guide.
- Reference image exists as a local file (ask the user for a path if the image only appears pasted in chat — chat attachments may not be on disk; check `~/Desktop`, `~/Downloads`, `~/Pictures` first).
- User is logged in to workrally.qq.com in Ego Lite (account button top-right shows the login name; if not logged in, `task.handOff()` and let the user sign in).

## Round-script discipline (PowerShell)

Each round: write a NEW `round-NN.mjs` under `C:/Users/<name>/ego/<goal>-<date>/`, run with the ASCII one-liner:

```powershell
ego-browser nodejs -e "await import('file:///C:/Users/<name>/ego/<dir>/round-NN.mjs')"
```

Chinese prompt text lives INSIDE the .mjs (UTF-8 file written by your file tool), never in `-e`. Reuse one taskSpace by name across rounds.

## Workflow

1. **Open canvas**: `taskSpace(name)` → `page.goto(canvasUrl)` → `waitForTimeout(5000)`. Canvas URL: `https://workrally.qq.com/toolbox/canvas/<id>`.
2. **Upload reference image**: click `loc=role:button[name='添加节点']` → menu item `text=本地上传` → arm `page.waitForFileChooser()` BEFORE the click → `chooser.setFiles(absoluteImagePath)`. The platform auto-creates an image node AND a video-generator node pre-wired to it (generator `data-id` starts with `vid-gen-`).
3. **Select the generator**: it overlaps other nodes; do NOT hardcode coordinates. Measure it each round:
   ```js
   const c = await page.evaluate(() => {
     const n = document.querySelector('.react-flow__node-videoGenerator');
     const r = n.getBoundingClientRect();
     return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
   });
   await page.mouse.click(c.x, c.y);   // opens the editing panel
   ```
4. **Fill prompt**: click the prompt box `[role="textbox"][aria-label="提示词"]` (its own rect), then `page.keyboard.insertText(prompt)`. Verify with `el.innerText`.
   - Shot-script prompts (`0-5 秒：… 5-10 秒：…`) are accepted verbatim; join segments with `\n`.
   - **Submitting consumes the prompt** — after a generation starts, the box resets to empty. Refill it for every new submission.
5. **Set duration (continuous slider)**: open params with the element whose `aria-label="生成参数"` (it is a `role=button` div, often NOT a `<button>` — search both). In the dialog, group `aria-label="时长"` has tick labels `5s/10s/15s` at known x positions and the same texts at the ends. Compute target x linearly: `x = x5 + (x15 - x5) * (sec - 5) / 10`, then drag the thumb from its current position to that x at the track's y (tick-row y minus ~20px). Verify by reading the group text (`时长12s…`).
6. **Submit**: press `Escape` to close the dialog, then find the generate button by text `/^生成\d*\(/` (shows credit cost, e.g. `生成0(36)`; Rally-Video free quota shows 0). Click its center. A NEW output video node appears (`kind=video`, text `排队中/生成中`).
7. **Poll**: every ~60-120s re-run a small script listing all `.react-flow__node` innerText. Done = node text becomes `<name> | .mp4 | 1920×1080`. 12s/1K typically finishes in 4-8 min. `Start-Sleep` in pwsh for waiting (background job if >2min).
8. **Verify duration**: click the finished node's center (starts playback), then read metadata:
   ```js
   [...document.querySelectorAll("video")].map(v => ({ d: v.duration, w: v.videoWidth }))
   ```
   Expect duration ≈ requested seconds (e.g. 12.256s for a 12s request). Do NOT bulk-`load()` lazy videos in one evaluate — it times out; read after natural playback.
9. **Finish**: keep the canvas page for the user (`task.finish({ keep: ["p1"] })`) or leave it open; report node name, resolution, measured duration.

## Quick reference

| Need | Selector / trick |
|---|---|
| Add-node menu | `loc=role:button[name='添加节点']` then `text=本地上传` |
| File upload | arm `waitForFileChooser()` before click |
| Generator node | `.react-flow__node-videoGenerator`, measure rect each round |
| Prompt box | `[role="textbox"][aria-label="提示词"]` |
| Params dialog | `aria-label="生成参数"` (role=button div, not `<button>`) |
| Duration slider | group `aria-label="时长"`, linear drag between 5s/15s ticks |
| Generate button | text matches `/^生成\d*\(/` |
| Node status | `.react-flow__node` innerText (`生成中 %` / `.mp4` / `生成失败`) |

## Common mistakes

| Mistake | Fix |
|---|---|
| Clicking node by fixed screenshot coordinates after layout shifts | Measure `getBoundingClientRect()` fresh every round |
| `page.click` on generator blocked by `<img>` intercepting pointer | Use `mouse.click` at measured center (lower half) |
| Treating duration as discrete 5/10/15 options | It is a continuous slider — drag to the exact seconds |
| Reusing snapshot `@refs` after any canvas change | Re-snapshot or switch to `data-id`/`aria-label` evaluate |
| Submitting twice unknowingly (cost `(15)`→`(36)` is quota, not failure) | After clicking generate, confirm a NEW video node appeared |
| Bulk `v.load()` on all videos in one `page.evaluate` | Times out (15s); verify via playback of one node |
| Prompt box selector `[contenteditable="true"]` matches 2 elements | Use `aria-label="提示词"` textbox |
| Old failed node shows `生成失败 现在使用的人比较多` | Platform congestion; your new submission is a separate node — poll yours by `data-id` |
