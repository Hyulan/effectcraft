// Krysta: fonts on demand in a real EffectCraft web build (krysta/patch/runtime-fonts.patch).
// node font-test.mjs <base url of the unpacked build, ending in />
// Every check compares decoded pixels of frames whose expected relation is unambiguous.
import { chromium } from "playwright";
import fs from "node:fs";

const base = process.argv[2];
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [];
const t0 = Date.now();

async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(`${base}?empty&nosw`, { waitUntil: "load" });
  await page.waitForFunction(() => window.effectcraftLoad?.readyMs, null, { timeout: 180000 });
  await page.evaluate(() => {
    // Helpers inside the page: decoded-pixel difference of two PNGs (base64 or bytes), a comp with one text layer.
    window.k = {
      async pixels(png) {
        const bytes = typeof png === "string" ? Uint8Array.from(atob(png), (c) => c.charCodeAt(0)) : png;
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const g = canvas.getContext("2d");
        g.drawImage(bitmap, 0, 0);
        return g.getImageData(0, 0, bitmap.width, bitmap.height).data;
      },
      async diff(a, b) {
        const [x, y] = [await k.pixels(a), await k.pixels(b)];
        if (x.length !== y.length) return 255;
        let max = 0;
        for (let i = 0; i < x.length; i++) max = Math.max(max, Math.abs(x[i] - y[i]));
        return max;
      },
      async comp(name, font) {
        const ec = window.effectcraft;
        await ec.execute("comp.new", { name, width: 480, height: 160, duration: 1 });
        await ec.execute("layer.newSolid", { color: "#ffffff" });
        const made = await ec.execute("layer.newText", { text: "长期主义 永国", font, size: 64, fill: "#000000", position: [240, 100] });
        return made?.layer;
      },
      frame: async (comp) => (await window.effectcraft.renderFrame({ comp, time: 0.5 })).png,
      manifest: null,
      async font(family) {
        k.manifest ??= await (await fetch(location.pathname + "fonts/fonts.json")).json();
        const row = k.manifest.fonts.find((f) => f.family === family && !f.embedded);
        return window.effectcraft.addFont(location.pathname + "fonts/" + row.file);
      },
    };
  });
  return page;
}

// Page 1: the font arrives after the project drew text with it.
const p1 = await open();
const r1 = await p1.evaluate(async () => {
  const ec = window.effectcraft, out = {};
  out.familiesBefore = ((await ec.execute("text.fonts", {}))?.families ?? []).map((f) => f.family);
  const a = await k.comp("A", "LXGW WenKai");
  const compA = (await ec.execute("project.summary", {})).activeComp;
  const fallbackA = await k.frame(compA);
  const t = performance.now();
  out.added = await k.font("LXGW WenKai");
  out.addMs = Math.round(performance.now() - t);
  out.familiesAfter = ((await ec.execute("text.fonts", {}))?.families ?? []).map((f) => f.family);
  // A layer created now, with the font there (same size, text and position as A).
  await k.comp("B", "LXGW WenKai");
  const compB = (await ec.execute("project.summary", {})).activeComp;
  const lxgw = await k.frame(compB);
  const textB = ((await ec.execute("comp.info", { comp: compB }))?.layers ?? []).find((l) => /text/i.test(l.type))?.id;
  await ec.execute("layer.setText", { layer: textB, font: "Noto Sans SC" });
  const noto = await k.frame(compB);
  await ec.execute("layer.setText", { layer: textB, font: "LXGW WenKai" });
  const lxgwAgain = await k.frame(compB);
  out.lxgwVsFallback = await k.diff(lxgw, fallbackA);
  out.lxgwVsNoto = await k.diff(lxgw, noto);
  out.lxgwStable = await k.diff(lxgw, lxgwAgain);
  // Comp A was drawn before the font came: with the layout cache cleared by addFont it now draws like comp B.
  out.oldCompVsLxgw = await k.diff(await k.frame(compA), lxgw);
  out.diskBefore = await ec.execute("cache.diskStats", {}).catch((e) => String(e));
  // Render workers: a frame worker and a Render Queue job (job worker) must draw the loaded face too.
  try { out.workerCheck = await ec.workerFrameCheck({ time: 0.5 }); } catch (e) { out.workerCheck = String(e); }
  const job = await ec.execute("renderQueue.add", { comp: compB, format: "png", output: "/out/b.png", start: 0.5, end: 0.53 });
  await ec.execute("renderQueue.render", { wait: false });
  for (let i = 0; i < 300; i++) {
    const item = ((await ec.execute("renderQueue.list", {}))?.items ?? []).find((x) => x.id === job.id);
    if (/done|fail|stop|error/i.test(String(item?.status))) { out.jobStatus = item.status; break; }
    await new Promise((r) => setTimeout(r, 200));
  }
  const file = (await ec.files()).find((f) => f.path.startsWith("/out/b"));
  out.jobVsPage = file ? await k.diff(await ec.readFile(file.path), lxgw) : "no file";
  out.addedAgain = await k.font("LXGW WenKai");
  out.notAFont = await ec.addFont(new Uint8Array([1, 2, 3, 4]));
  const t2 = performance.now();
  for (const f of k.manifest.fonts.filter((f) => !f.embedded && f.family !== "LXGW WenKai")) await ec.addFont(location.pathname + "fonts/" + f.file);
  out.allMs = Math.round(performance.now() - t2);
  out.familiesAll = ((await ec.execute("text.fonts", {}))?.families ?? []).map((f) => f.family);
  out.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  // The project (comp A only matters) for page 2.
  const saved = await ec.saveToBrowser("/t/p.ecproj");
  out.project = new TextDecoder().decode(await ec.readFile(saved.path));
  out.compA = compA;
  out.images = { fallbackA, lxgw, noto };
  return out;
});
for (const [name, png] of Object.entries(r1.images)) fs.writeFileSync(`shot-${name}.png`, Buffer.from(png, "base64"));
const { project, compA, images } = r1;
delete r1.project; delete r1.images;

// Page 2: the editor's order on a fresh page (font first, then the project): drawn with the font at once.
const p2 = await open();
const r2 = await p2.evaluate(async ({ project, compA, lxgw }) => {
  const ec = window.effectcraft;
  await k.font("LXGW WenKai");
  await ec.addFile(new Blob([project], { type: "application/json" }), "p.ecproj");
  for (let i = 0; i < 50; i++) {
    if (String((await ec.execute("project.summary", {}))?.path ?? "").endsWith("p.ecproj")) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const reopened = await k.frame(compA);
  // An independent reference on this page: a new comp made after the font was added.
  await k.comp("R", "LXGW WenKai");
  const reference = await k.frame((await ec.execute("project.summary", {})).activeComp);
  return { reopenedVsLxgw: await k.diff(reopened, lxgw), reopenedVsReference: await k.diff(reopened, reference),
           referenceVsPage1: await k.diff(reference, lxgw), disk: await ec.execute("cache.diskStats", {}).catch((e) => String(e)) };
}, { project, compA, lxgw: images.lxgw });

const report = { ...r1, ...r2, ms: Date.now() - t0, errors };
console.log("KRYSTA_FONT_TEST " + JSON.stringify(report));
await browser.close();
const ok = !report.familiesBefore.includes("LXGW WenKai") && report.familiesAfter.includes("LXGW WenKai")
  && report.lxgwVsFallback > 64 && report.lxgwVsNoto > 64 && report.lxgwStable === 0 && report.oldCompVsLxgw === 0
  && report.workerCheck?.maxDiff === 0 && report.jobVsPage <= 2 && report.reopenedVsReference === 0 && report.referenceVsPage1 === 0 && !errors.length;
process.exit(ok ? 0 : 1);
