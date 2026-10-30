// submit-video.mjs — one-shot WorkRally canvas video submission (skill v2, test-verified selectors).
// Edit CONFIG, then: ego-browser nodejs -e "await import('file:///<dir>/submit-video.mjs')"
// Prints the new output node's data-id at the end; feed it to wait-done.mjs.
const CONFIG = {
  space: "workrally-video",
  canvasUrl: "https://workrally.qq.com/toolbox/canvas/<id>",
  imagePath: "C:/absolute/path/reference.jpeg", // forward slashes
  prompt: ["0-5 秒：…", "5-10 秒：…"].join("\n"),
  durationSec: 12, // integer 5..15 (slider snaps to whole seconds)
  reuseExisting: false, // true: skip upload if an image node + generator already exist on the canvas
};

const task = await taskSpace(CONFIG.space);
const page = task.page("p1");
await page.goto(CONFIG.canvasUrl, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".react-flow__node", { timeout: 20000 });

// --- 1) upload reference image (arm chooser BEFORE click) ---
const gensBefore = await page.evaluate(() => JSON.stringify([...document.querySelectorAll(".react-flow__node-videoGenerator")].map((n) => n.getAttribute("data-id"))));
const hasGen0 = await page.evaluate(() => !!document.querySelector(".react-flow__node-videoGenerator"));
if (!(CONFIG.reuseExisting && hasGen0)) {
  await page.click('[aria-label="添加节点"]', { label: "add node" }); // div[role=button]; CSS aria beats role locator
  const chooserPromise = page.waitForFileChooser({ timeout: 10000 });
  await page.click("text=本地上传", { label: "local upload" });
  await (await chooserPromise).setFiles(CONFIG.imagePath);
  await page.waitForTimeout(4000);
}

// --- 2) generator node: prefer the one newly created by this upload; else create 视频→单图 ---
let genId = await page.evaluate((prev) => {
  const before = new Set(JSON.parse(prev));
  const fresh = [...document.querySelectorAll(".react-flow__node-videoGenerator")].find((n) => !before.has(n.getAttribute("data-id")));
  return fresh ? fresh.getAttribute("data-id") : null;
}, gensBefore);
if (!genId) {
  await page.click('[aria-label="添加节点"]', { label: "add node" });
  await page.waitForTimeout(800);
  const vid = await page.evaluate(() => {
    const e = [...document.querySelectorAll("[aria-label='视频']")].find((x) => x.getBoundingClientRect().width > 0);
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(vid.x, vid.y, { label: "hover 视频" }); // submenu opens on hover
  await page.waitForTimeout(900);
  const sub = await page.evaluate(() => {
    const es = [...document.querySelectorAll("li,div,span,button")]
      .filter((x) => (x.innerText || "").trim() === "单图" && x.getBoundingClientRect().width > 0);
    const r = es[es.length - 1].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(sub.x, sub.y, { label: "click 单图" });
  await page.waitForTimeout(3000);
  genId = await page.evaluate((prev) => {
    const before = new Set(JSON.parse(prev));
    const fresh = [...document.querySelectorAll(".react-flow__node-videoGenerator")].find((n) => !before.has(n.getAttribute("data-id")));
    return (fresh || document.querySelector(".react-flow__node-videoGenerator"))?.getAttribute("data-id");
  }, gensBefore);
  // wire image output -> generator input by dragging handles
  const pts = await page.evaluate((gid) => {
    const img = [...document.querySelectorAll(".react-flow__node-image")].pop();
    const gen = document.querySelector(`[data-id="${gid}"]`);
    const o = img.querySelector('[aria-label="图片输出"]') || img.querySelector(".react-flow__handle-right");
    const i = gen.querySelector('[aria-label="输入"]') || gen.querySelector(".react-flow__handle-left");
    const rc = (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    return { out: rc(o), inp: rc(i), edges: document.querySelectorAll(".react-flow__edge").length };
  }, genId);
  await page.mouse.move(pts.out.x, pts.out.y);
  await page.mouse.down();
  await page.mouse.move(pts.inp.x, pts.inp.y, { steps: 25 });
  await page.mouse.move(pts.inp.x + 1, pts.inp.y + 1, { steps: 3 }); // nudge so react-flow registers the drop
  await page.mouse.up();
  await page.waitForFunction((before) => document.querySelectorAll(".react-flow__edge").length > before, pts.edges, { timeout: 5000 });
  console.log("generator created + wired:", genId);
}

// --- 3) pan generator node into mid-viewport (panel renders BELOW node; off-screen nodes unmount) ---
const panIntoView = async () => page.evaluate((gid) => {
  const n = document.querySelector(`[data-id="${gid}"]`);
  if (!n) return "unmounted";
  const r = n.getBoundingClientRect();
  return { cx: r.x + r.width / 2, bottom: r.y + r.height, need: r.y + r.height > 480 ? Math.round((r.y + r.height) / 2 - 300) : 0 };
}, genId);
let g = await panIntoView();
if (g !== "unmounted" && g.need > 0) {
  const pane = await page.evaluate(() => {
    const el = document.elementFromPoint(300, 300);
    return el && el.closest(".react-flow__pane") && !el.closest(".react-flow__node") ? { x: 300, y: 300 } : null;
  });
  if (pane) {
    await page.mouse.move(pane.x, pane.y); await page.mouse.down();
    await page.mouse.move(pane.x, pane.y - g.need, { steps: 10 }); await page.mouse.up();
    await page.waitForTimeout(600);
  }
}

// --- 4) open generator panel ---
const c = await page.evaluate((gid) => {
  const r = document.querySelector(`[data-id="${gid}"]`).getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height * 0.8 };
}, genId);
await page.mouse.click(c.x, c.y, { label: "select generator" });
await page.waitForSelector('[role="textbox"][aria-label="提示词"]', { timeout: 10000 });

// --- 5) model: Rally-Video lives in the 参考主体 tab (单图 tab defaults to paid Vidu) ---
const tab = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button,[role='button']")].find((x) => (x.innerText || "").trim() === "参考主体");
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, active: b.className.includes("active") };
});
if (!tab.active) { await page.mouse.click(tab.x, tab.y, { label: "参考主体 tab" }); await page.waitForTimeout(1200); }
const modelOk = await page.evaluate(() => /Rally-Video/.test(document.body.innerText));
if (!modelOk) {
  const chip = await page.evaluate(() => {
    const g = [...document.querySelectorAll('[role="group"][aria-label="模型"]')][0];
    const r = g.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 };
  });
  await page.mouse.click(chip.x, chip.y, { label: "open model dropdown" });
  await page.waitForTimeout(800);
  const opt = await page.evaluate(() => {
    const e = [...document.querySelectorAll("div,li,span")].find((x) => /Rally-Video/.test(x.innerText || "") && x.getBoundingClientRect().width > 60 && x.getBoundingClientRect().width < 400);
    const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(opt.x, opt.y, { label: "pick Rally-Video" });
  await page.waitForTimeout(800);
}

// --- 6) fill prompt ---
const pb = await page.evaluate(() => {
  const r = document.querySelector('[role="textbox"][aria-label="提示词"]').getBoundingClientRect();
  return { x: r.x + 30, y: r.y + 20 };
});
await page.mouse.click(pb.x, pb.y, { label: "focus prompt" });
await page.keyboard.insertText(CONFIG.prompt);

// --- 7) duration slider: linear on .t-slider__rail (tick labels are unreliable) ---
const par = await page.evaluate(() => {
  const b = document.querySelector('[aria-label="生成参数"]');
  const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(par.x, par.y, { label: "open params" });
await page.waitForFunction(() => [...document.querySelectorAll('[role="group"]')].some((g) => g.getAttribute("aria-label") === "时长"), undefined, { timeout: 8000 });
const rail = await page.evaluate(() => {
  const grp = [...document.querySelectorAll('[role="group"]')].find((g) => g.getAttribute("aria-label") === "时长");
  const rl = grp.querySelector(".t-slider__rail").getBoundingClientRect();
  const th = grp.querySelector(".t-slider__button").getBoundingClientRect();
  return { l: rl.x, r: rl.x + rl.width, y: rl.y + rl.height / 2, thumbX: th.x + th.width / 2 };
});
const targetX = rail.l + (rail.r - rail.l) * (CONFIG.durationSec - 5) / 10;
await page.mouse.move(rail.thumbX, rail.y); await page.mouse.down();
await page.mouse.move(targetX, rail.y, { steps: 8 }); await page.mouse.up();
const durRead = await page.evaluate(() => {
  const grp = [...document.querySelectorAll('[role="group"]')].find((g) => g.getAttribute("aria-label") === "时长");
  return grp.innerText.replace(/\s+/g, " ").slice(0, 12);
});
console.log("duration:", durRead); // expect "时长12s…"

// --- 8) close dialog by TOGGLING the chip (Escape does NOT work), then submit ---
await page.mouse.click(par.x, par.y, { label: "collapse params" });
await page.waitForTimeout(500);
const before = await page.evaluate(() => JSON.stringify([...document.querySelectorAll(".react-flow__node-video")].map((n) => n.getAttribute("data-id"))));
const gb = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button,div[role='button']")].find((x) => /^生成.{0,8}\d/.test((x.innerText || "").replace(/\s+/g, "")));
  const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: b.innerText.replace(/\s+/g, "") };
});
console.log("generate:", gb.t);
await page.mouse.click(gb.x, gb.y, { label: "submit" });
await page.waitForTimeout(5000);
const newId = await page.evaluate((prev) => {
  const ids = new Set(JSON.parse(prev));
  const n = [...document.querySelectorAll(".react-flow__node-video")].find((x) => !ids.has(x.getAttribute("data-id")));
  return n ? n.getAttribute("data-id") : "none";
}, before);
console.log("OUTPUT_NODE_ID:", newId);
