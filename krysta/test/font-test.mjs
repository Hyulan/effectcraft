// Krysta: fonts on demand in a real EffectCraft web build (krysta/patch/runtime-fonts.patch).
// node font-test.mjs <base url of the unpacked build, ending in />
import { chromium } from "playwright";

const base = process.argv[2];
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--enable-features=Vulkan"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
const t0 = Date.now();
await page.goto(`${base}?empty&nosw`, { waitUntil: "load" });
await page.waitForFunction(() => window.effectcraftLoad?.readyMs, null, { timeout: 180000 });
const report = await page.evaluate(async (base) => {
  const ec = window.effectcraft;
  const out = { load: window.effectcraftLoad };
  const fams = async () => ((await ec.execute("text.fonts", {}))?.families ?? []).map((f) => f.family);
  const manifest = await (await fetch(base + "fonts/fonts.json")).json();
  out.manifest = manifest.fonts.map((f) => `${f.family}/${f.style}:${f.embedded ? "embed" : "ondemand"}`);
  out.familiesBefore = await fams();
  const text = "长期主义 永国";
  await ec.execute("comp.new", { name: "T", width: 480, height: 160, duration: 1 });
  await ec.execute("layer.newSolid", { color: "#ffffff" });
  const made = await ec.execute("layer.newText", { text, font: "LXGW WenKai", size: 64, fill: "#000000", position: [240, 100] });
  const frame = async () => (await ec.renderFrame({ time: 0.5 })).png;
  const fallback = await frame();
  const lx = manifest.fonts.find((f) => f.family === "LXGW WenKai" && f.style === "Regular");
  const t = performance.now();
  out.added = await ec.addFont(base + "fonts/" + lx.file);
  out.addMs = Math.round(performance.now() - t);
  out.familiesAfter = await fams();
  const loaded = await frame();
  out.pageChanged = loaded !== fallback;
  // Same text in the embedded default face: the loaded face must differ from it too.
  await ec.execute("layer.setText", { layer: made?.layer, font: "Noto Sans SC" });
  const noto = await frame();
  out.differsFromDefault = loaded !== noto;
  await ec.execute("layer.setText", { layer: made?.layer, font: "LXGW WenKai" });
  // A frame worker must have the font too (rendered there vs on the page's CPU).
  try { out.workerCheck = await ec.workerFrameCheck({ time: 0.5 }); } catch (e) { out.workerCheck = String(e); }
  // A job worker: Render Queue PNG of the same frame.
  try {
    const added = await ec.execute("renderQueue.add", { format: "png", output: "/out/f.png", start: 0.5, end: 0.54 });
    await ec.execute("renderQueue.render", { wait: false });
    for (let i = 0; i < 300; i++) {
      const item = ((await ec.execute("renderQueue.list", {}))?.items ?? []).find((x) => x.id === added.id);
      if (/done|fail|stop|error/i.test(String(item?.status))) { out.jobStatus = item.status; break; }
      await new Promise((r) => setTimeout(r, 200));
    }
    out.jobFiles = (await ec.files()).filter((f) => f.path.startsWith("/out")).map((f) => `${f.path}:${f.size}`);
  } catch (e) { out.jobError = String(e); }
  // Adding the same font twice must not break anything; bytes that are no font add nothing.
  out.addedAgain = await ec.addFont(base + "fonts/" + lx.file);
  out.notAFont = await ec.addFont(new Uint8Array([1, 2, 3, 4]));
  // Load every ondemand font: total time.
  const t2 = performance.now();
  for (const f of manifest.fonts.filter((f) => !f.embedded && f.file !== lx.file)) await ec.addFont(base + "fonts/" + f.file);
  out.allMs = Math.round(performance.now() - t2);
  out.familiesAll = await fams();
  out.memory = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  out.images = { fallback, loaded, noto };
  return out;
}, base);
const fs = await import("node:fs");
for (const [k, v] of Object.entries(report.images)) fs.writeFileSync(`shot-${k}.png`, Buffer.from(v, "base64"));
delete report.images;
report.ms = Date.now() - t0;
report.errors = errors;
console.log("KRYSTA_FONT_TEST " + JSON.stringify(report));
await browser.close();
const ok = report.pageChanged && report.differsFromDefault && report.familiesAfter.includes("LXGW WenKai") && !report.familiesBefore.includes("LXGW WenKai");
process.exit(ok ? 0 : 1);
