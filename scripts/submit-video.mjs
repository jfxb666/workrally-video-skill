// smoke-submit.mjs — fast-path smoke test (v2 script, reuseExisting path)
const CONFIG = {
  space: "workrally-skilltest",
  canvasUrl: "https://workrally.qq.com/toolbox/canvas/5mwo4rz2skietqc2h2ryv6p",
  imagePath: "C:/Users/Administrator/Desktop/tp/生成女人全身三视图.jpeg",
  prompt: "5秒：年轻女人泡在日式温泉池里，肩膀露出水面，微笑着对镜头说话，水面冒着热气，旁边石头上趴着水豚。",
  durationSec: 5,
  reuseExisting: true,
};

const t0 = Date.now();
const task = await taskSpace(CONFIG.space);
const page = task.page("p1");
await page.goto(CONFIG.canvasUrl, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".react-flow__node", { timeout: 20000 });

// --- 1) upload (skipped when reuseExisting and a generator exists) ---
const gensBefore = await page.evaluate(() => JSON.stringify([...document.querySelectorAll(".react-flow__node-videoGenerator")].map((n) => n.getAttribute("data-id"))));
const hasGen0 = await page.evaluate(() => !!document.querySelector(".react-flow__node-videoGenerator"));
if (!(CONFIG.reuseExisting && hasGen0)) {
  await page.click('[aria-label="添加节点"]', { label: "add node" });
  const chooserPromise = page.waitForFileChooser({ timeout: 10000 });
  await page.click("text=本地上传", { label: "local upload" });
  await (await chooserPromise).setFiles(CONFIG.imagePath);
  await page.waitForTimeout(4000);
} else { console.log("reuseExisting: skipping upload"); }

// --- 2) generator: fresh one if upload created it; else create 视频→单图 and wire ---
let genId = await page.evaluate((prev) => {
  const before = new Set(JSON.parse(prev));
  const all = [...document.querySelectorAll(".react-flow__node-videoGenerator")];
  const fresh = all.find((n) => !before.has(n.getAttribute("data-id")));
  if (fresh) return fresh.getAttribute("data-id");
  return null;
}, gensBefore);
if (!genId && CONFIG.reuseExisting) {
  genId = await page.evaluate(() => {
    const all = [...document.querySelectorAll(".react-flow__node-videoGenerator")];
    return all[all.length - 1]?.getAttribute("data-id") || null;
  });
  console.log("reusing existing generator:", genId);
}
if (!genId) {
  await page.click('[aria-label="添加节点"]', { label: "add node" });
  await page.waitForTimeout(800);
  const vid = await page.evaluate(() => {
    const e = [...document.querySelectorAll("[aria-label='视频']")].find((x) => x.getBoundingClientRect().width > 0);
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(vid.x, vid.y, { label: "hover 视频" });
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
  await page.mouse.move(pts.inp.x + 1, pts.inp.y + 1, { steps: 3 });
  await page.mouse.up();
  await page.waitForFunction((before) => document.querySelectorAll(".react-flow__edge").length > before, pts.edges, { timeout: 5000 });
  console.log("generator created + wired:", genId);
}

// --- 3) viewport manager: wheel-pan (verified: deltaY +600 pans content up ~334px; node w>=420 for panel render) ---
const findPane = () => page.evaluate(() => {
  for (const [x, y] of [[950, 150], [300, 250], [1200, 250], [700, 620], [200, 500]]) {
    const el = document.elementFromPoint(x, y);
    if (el && el.closest(".react-flow__pane") && !el.closest(".react-flow__node")) return { x, y };
  }
  return null;
});
const nodeRect = () => page.evaluate((gid) => {
  const n = document.querySelector(`[data-id="${gid}"]`);
  if (!n) return null;
  const r = n.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height };
}, genId);
const wheelPan = async (targetCy) => {
  for (let i = 0; i < 8; i++) {
    const nr = await nodeRect();
    if (!nr) { console.log("node unmounted -> reload"); await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector(".react-flow__node", { timeout: 20000 }); continue; }
    const err = nr.cy - targetCy;
    if (Math.abs(err) < 30) return nr;
    const pane = await findPane();
    if (!pane) { console.log("no pane"); return nr; }
    await page.mouse.move(pane.x, pane.y);
    await page.mouse.wheel(0, Math.max(-900, Math.min(900, Math.round(err / 0.56))));
    await page.waitForTimeout(700);
  }
  return await nodeRect();
};
// zoom in over node until w>=420 (ctrl+wheel negative = zoom IN)
for (let i = 0; i < 6; i++) {
  const nr = await nodeRect();
  if (!nr) { await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector(".react-flow__node", { timeout: 20000 }); continue; }
  if (nr.w >= 420) break;
  const pane = await findPane();
  await page.mouse.move(nr.cx, nr.cy);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -240);
  await page.mouse.wheel(0, -240);
  await page.keyboard.up("Control");
  await page.waitForTimeout(800);
}
// node center at y≈320 so the below-node panel fits on screen
console.log("final node rect:", JSON.stringify(await wheelPan(320)));

// --- 4) open panel ---
const spots = await page.evaluate((gid) => {
  const r = document.querySelector(`[data-id="${gid}"]`).getBoundingClientRect();
  return [
    { x: r.x + r.width / 2, y: r.y + r.height * 0.8 },
    { x: r.x + r.width / 2, y: r.y + 20 },
    { x: r.x + r.width / 2, y: r.y + r.height / 2 },
  ];
}, genId);
let opened = false;
for (const sp of spots) {
  await page.mouse.click(sp.x, sp.y, { label: "select generator" });
  await page.waitForTimeout(1200);
  const has = await page.evaluate(() => !!document.querySelector('[role="textbox"][aria-label="提示词"]'));
  if (has) { opened = true; break; }
}
if (!opened) {
  await page.screenshot({ path: "C:/Users/Administrator/ego/workrally-skilltest-20261030/fail-panel.png" });
  throw new Error("panel never opened; see fail-panel.png");
}
console.log("panel opened");

// --- 5) switch to 参考主体 tab (Rally-Video default there); verify by model group ---
for (let i = 0; i < 3; i++) {
  const rally = await page.evaluate(() => {
    const grp = [...document.querySelectorAll('[aria-label="模型"],[role="group"]')].find((g) => /模型/.test(g.getAttribute("aria-label") || "") || /Rally-Video|Vidu-Q4/.test(g.innerText || ""));
    return /Rally-Video/.test(grp ? grp.innerText : document.body.innerText);
  });
  if (rally) break;
  const tab = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button,[role='button']")].find((x) => (x.innerText || "").trim() === "参考主体");
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!tab) { console.log("tab not found"); break; }
  await page.mouse.click(tab.x, tab.y, { label: "参考主体 tab" });
  await page.waitForTimeout(1500);
}
const modelOk = await page.evaluate(() => /Rally-Video/.test(document.body.innerText));
console.log("model Rally-Video visible:", modelOk);
if (!modelOk) {
  await page.screenshot({ path: "C:/Users/Administrator/ego/workrally-skilltest-20261030/fail-model.png" });
  throw new Error("Rally-Video not visible — see fail-model.png");
}

// --- 6) prompt ---
const pb = await page.evaluate(() => {
  const r = document.querySelector('[role="textbox"][aria-label="提示词"]').getBoundingClientRect();
  return { x: r.x + 30, y: r.y + 20 };
});
await page.mouse.click(pb.x, pb.y, { label: "focus prompt" });
await page.keyboard.insertText(CONFIG.prompt);

// --- 7) duration via rail ---
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
console.log("duration:", await page.evaluate(() => {
  const grp = [...document.querySelectorAll('[role="group"]')].find((g) => g.getAttribute("aria-label") === "时长");
  return grp.innerText.replace(/\s+/g, " ").slice(0, 12);
}));

// --- 8) collapse chip, submit, capture new node ---
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
console.log("ELAPSED_MS:", Date.now() - t0);
