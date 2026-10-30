// wait-done.mjs — poll the tracked node to done, then verify duration + grab frames.
// SMOKE-TESTED: returns 15ms after completion detected; full verify ~9s. No process restarts.
const CONFIG = {
  space: "workrally-skilltest",
  nodeId: "96909c92-0f9b-431c-82b4-5e351bdc07a5",
  timeoutMs: 11 * 60 * 1000,
  framesDir: "C:/Users/Administrator/ego/workrally-skilltest-20261030",
};
const t0 = Date.now();
const task = await taskSpace(CONFIG.space);
const page = task.page("p1");

await page.waitForFunction((id) => {
  const n = document.querySelector(`[data-id="${id}"]`);
  if (!n) return true;
  const t = (n.innerText || "").replace(/\s+/g, " ");
  return /\.mp4|生成失败/.test(t);
}, CONFIG.nodeId, { timeout: CONFIG.timeoutMs, polling: 5000 });
const s = await page.evaluate((id) => {
  const n = document.querySelector(`[data-id="${id}"]`);
  if (!n) return { status: "node-gone", text: "" };
  const t = (n.innerText || "").replace(/\s+/g, " ");
  return { status: /\.mp4/.test(t) ? "done" : /生成失败/.test(t) ? "failed" : "unknown", text: t.slice(0, 120) };
}, CONFIG.nodeId);
console.log("waited_ms:", Date.now() - t0, JSON.stringify(s));
if (s.status !== "done") { console.log("NOT DONE"); process.exitCode = 1; }
else {
  const c = await page.evaluate((id) => {
    const r = document.querySelector(`[data-id="${id}"]`).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, CONFIG.nodeId);
  await page.mouse.click(c.x, c.y, { label: "play finished video" });
  await page.waitForTimeout(3000);
  const src = await page.evaluate((id) => {
    const v = document.querySelector(`[data-id="${id}"] video`);
    return v ? (v.currentSrc || v.src) : null;
  }, CONFIG.nodeId);
  console.log("mp4 src head:", src ? src.slice(0, 90) : null);
  console.log("watermarked:", /WATERMARK/i.test(src || ""));
  if (src) {
    const vp = await task.newPage();
    await vp.goto(src);
    await vp.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 1; }, undefined, { timeout: 20000 });
    const meta = await vp.evaluate(() => { const v = document.querySelector("video"); return { d: v.duration, w: v.videoWidth, h: v.videoHeight }; });
    console.log("duration check:", JSON.stringify(meta));
    for (const t of [1, 3]) {
      await vp.evaluate((sec) => { const v = document.querySelector("video"); v.currentTime = sec; }, t);
      await vp.waitForTimeout(1200);
      console.log("frame:", await vp.screenshot({ path: `${CONFIG.framesDir}/smoke-frame-${t}s.png` }));
    }
    await vp.close();
  }
  console.log("TOTAL_MS:", Date.now() - t0);
}
