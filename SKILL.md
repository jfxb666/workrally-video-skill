---
name: generating-video-workrally-canvas
description: Use when generating a video on WorkRally (workrally.qq.com) infinite canvas via ego-browser - image-to-video with a character reference image, Rally-Video free model on the 参考主体 tab, timed shot-script prompts, exact duration slider drag, node polling and mp4 frame verification. 也用于 WorkRally / 无限画布 / Rally-Video / 图生视频 / 视频生成 / 时长滑杆 / 免费额度.
---

# Generating Video on WorkRally Canvas (ego-browser)

Core principles: **locate everything by `data-id`/`aria-label` measured fresh each round (never stale refs); the duration control is a continuous rail-slider; prefer the one-shot scripts below over step-by-step rounds — each ego-browser process start costs 10-20s.**

## Fast path (tested): two scripts, two processes

1. `scripts/submit-video.mjs` — upload → create/wire generator → 参考主体 tab → prompt → duration drag → submit. Prints `OUTPUT_NODE_ID`.
2. `scripts/wait-done.mjs` — in-page poll (3s) → play → grab mp4 URL → open in new page → duration + frame screenshots.

Run each with the ASCII one-liner: `ego-browser nodejs -e "await import('file:///<abs-path>/script.mjs')"`. Chinese text stays inside the UTF-8 .mjs. Edit CONFIG blocks first. Total agent-side time ≈ 1-2 min; server generation 4-8 min (unavoidable).

## Manual workflow (fallback / when scripts break)

1. **Open**: `taskSpace(name)` → `goto(canvasUrl)` → `waitForSelector(".react-flow__node")`.
2. **Upload**: `[aria-label="添加节点"]` (a div[role=button]; CSS-aria beats role locator) → arm `waitForFileChooser()` → `text=本地上传` → `setFiles(absPath)`.
3. **Generator node**: upload may NOT auto-create one. If `.react-flow__node-videoGenerator` absent: 添加节点 → **hover** `视频` (submenu opens on hover, not click) → click `单图`. New node `data-id` starts `vid-gen-`. **Wire it**: `mouse.down/move(steps:25)/up` from image node `[aria-label="图片输出"]` handle to generator `[aria-label="输入"]` handle; verify `.react-flow__edge` count increased.
4. **Pan into view (critical)**: the editing panel renders BELOW the node, and react-flow UNMOUNTS off-viewport nodes entirely (querySelector → null). Wheel-pan over an empty `.react-flow__pane` (Δ×0.56 ≈ px) until node center y≈320; avoid drag-panning (it can fling nodes out of mount). `reload()` resets the viewport.
5. **Open panel**: click measured node center (lower 20% to dodge overlaps). Prompt box = `[role="textbox"][aria-label="提示词"]`; `insertText` shot-script verbatim (newline-joined segments accepted).
6. **Model**: Rally-Video is on the **参考主体 tab** (default there), NOT in 单图's list (which defaults to paid Vidu-Q4-Preview). Cost shows `生成 0 (N)` = free quota.
7. **Duration**: open `[aria-label="生成参数"]` chip. Ticks are unreliable (duplicated labels). Use the rail: `x = railL + (railR-railL)*(sec-5)/10` from `.t-slider__rail`, drag `.t-slider__button` at rail y. Snaps to whole seconds. Verify group `时长{N}s`.
8. **Submit**: Escape does NOT close the dialog — click the 生成参数 chip again to collapse. Generate button text has spaces (`生成 0 (36)`): match `/^生成.{0,8}\d/`. A new `kind=video` node appears — snapshot node ids before/after to capture its `data-id`.
9. **Poll**: at low zoom node innerText is EMPTY (progress in CSS var `--low-zoom-progress`) and text only renders when node ≥ ~280px. Zoom IN first: ctrl+wheel **negative deltaY = zoom in** (opposite of intuition). Done state: `生成视频_xxx .mp4 1920×1080` (spaces, not pipes). ~5-7 min for 12s/1K.
10. **Verify**: click node → playback starts → read `video.duration` (≈ requested +0.25s). For frames: in-node seeking does NOT repaint (stuck on poster); take `v.currentSrc`, open it in `task.newPage()`, seek + screenshot there. URL contains `_MAIN_WATERMARK_` → output carries a platform watermark.
11. **Finish**: `task.finish({ keep: ["p1"] })` to leave the canvas for the user.

## Quick reference

| Need | Selector / trick |
|---|---|
| Add-node menu | `[aria-label="添加节点"]` (div[role=button]) |
| 视频 submenu | hover, then click `单图` |
| Wire edge | drag `[aria-label="图片输出"]` → `[aria-label="输入"]`, verify edge count |
| Free model | 参考主体 tab (default Rally-Video); 单图 tab defaults to PAID Vidu |
| Prompt box | `[role="textbox"][aria-label="提示词"]` + `insertText` |
| Duration rail | `.t-slider__rail` linear x; thumb `.t-slider__button`; whole-second snap |
| Close params | re-click `[aria-label="生成参数"]` chip (Escape fails) |
| Generate btn | `/^生成.{0,8}\d/` (text has spaces) |
| Node status | needs zoom-in; `--low-zoom-progress` at low zoom |
| Frame grab | `currentSrc` → new page → seek → screenshot |

## Common mistakes

| Mistake | Fix |
|---|---|
| Assuming upload auto-creates the generator | Check `.react-flow__node-videoGenerator`; create+wire manually if absent |
| Looking for Rally-Video in 单图 model list | It's only on 参考主体 tab |
| Operating on a node whose panel is off-screen / node unmounted | Pan node bottom to y≈400 first; reload resets viewport |
| Computing slider x from 5s/10s/15s tick labels | Ticks duplicate; use `.t-slider__rail` endpoints |
| Escape to dismiss params dialog | Toggle the chip again |
| Exact regex `^生成\d*\(` | Real text `生成 0 (36)` — allow spaces |
| Polling innerText right after submit at low zoom | Zoom in (ctrl+wheel negative deltaY) or read `--low-zoom-progress` |
| Seeking the in-node `<video>` for frame checks | Opens mp4 `currentSrc` in a fresh page instead |
| Fixed `waitForTimeout(5000)` everywhere | `waitForSelector`/`waitForFunction` — and batch steps into ONE script |
| Drag-pan the canvas to move a node | Wheel-pan: drag overshoot unmounts the node |
| Clicking 参考主体 tab once and trusting it | Re-check model group text; retry tab click up to 3× |
| run_in_background for long ego scripts | Foreground pwsh (auto-promotes to job); background quoting breaks |
| `await page.waitForFunction(...).jsonValue()` | This ego build's handle has no jsonValue — waitForFunction then page.evaluate the state |
| Reusing snapshot `@refs` after canvas changes | Re-measure rects via evaluate every round |

## Environment notes

- pwsh tool here rejects `timeoutMs`/`run_in_background` args (type errors) — default 120s foreground; longer sleeps auto-promote to a background job, collect via `job_output` (use `run_code` + `tools.job_output` with proper types).
- ego-browser may print `[ego-browser:notice]` about an update — surface to the user, upgrade only with approval.
