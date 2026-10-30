// wait-done.mjs — block until the tracked node finishes, then verify duration & frames.
// In-page polling (no process restarts). Set space + NODE_ID from submit-video.mjs output.
const CONFIG = {
  space: "workrally-video",
  nodeId: "<OUTPUT_NODE_ID>",
  timeoutMs: 12 * 60 * 1000,
};
const task = await taskSpace(CONFIG.space);
const page = task.page("p1");

// 1) wait for completion — status text needs the node rendered at decent zoom;
//    at low zoom innerText is empty (progress lives in --low-zoom-progress).
//    Zoom IN over the node first: ctrl+wheel with NEGATIVE deltaY zooms in on this canvas.
await page.evaluate((id) => {
  const n = document.querySelector(`[data-id="${id}"]`);
  if (n) n.scrollIntoView({ block: "center" });
}, CONFIG.nodeId);
const c = await page.evaluate((id) => {
  const r = document.querySelector(`[data-id="${id}"]`).getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, CONFIG.nodeId);
await page.mouse.move(c.x, c.y);
await page.mouse.wheel(0, -400, { label: "zoom in over node" }); // negative = zoom IN (counterintuitive)
await page.waitForFunction((id) => {
  const n = document.querySelector(`[data-id="${id}"]`);
  if (!n) return { status: "node-gone" };
  const t = (n.innerText || "").replace(/\s+/g, " ");
  if (/\.mp4/.test(t)) return { status: "done", text: t.slice(0, 120) };
  if (/生成失败/.test(t)) return { status: "failed", text: t.slice(0, 120) };
  return false;
}, CONFIG.nodeId, { timeout: CONFIG.timeoutMs, polling: 3000 }).then(async (h) => {
  const s = await h.jsonValue();
  console.log(JSON.stringify(s));
  if (s.status !== "done") return;
  // 2) get the real mp4 URL from the video element (node's currentSrc after playback starts)
  await page.mouse.click(c.x, c.y, { label: "play finished video" });
  await page.waitForTimeout(2500);
  const src = await page.evaluate((id) => {
    const v = document.querySelector(`[data-id="${id}"] video`);
    return v ? (v.currentSrc || v.src) : null;
  }, CONFIG.nodeId);
  console.log("mp4 src:", src ? src.slice(0, 120) : null, "(URL contains _MAIN_WATERMARK_ => output carries a platform watermark)");
  // 3) in-node seeking does NOT repaint (poster frame); open the mp4 in a fresh page to grab frames
  if (src) {
    const vp = await task.newPage();
    await vp.goto(src);
    await vp.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 1; }, undefined, { timeout: 20000 });
    const meta = await vp.evaluate(() => { const v = document.querySelector("video"); return { d: v.duration, w: v.videoWidth, h: v.videoHeight }; });
    console.log("duration check:", JSON.stringify(meta)); // expect d ≈ requested seconds
    for (const t of [2, 6, 10.5]) {
      await vp.evaluate((sec) => { const v = document.querySelector("video"); v.currentTime = sec; }, t);
      await vp.waitForTimeout(1200);
      const p = await vp.screenshot({ path: `C:/Users/<name>/ego/frames/frame-${t}s.png` }); // absolute dir, must exist
      console.log("frame:", p);
    }
    await vp.close();
  }
});
