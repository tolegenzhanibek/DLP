// Renders PNG icons and the e-mail logo from inline SVG (run: node scripts/build-icons.mjs).
import { createRequire } from "node:module";
// Uses the globally installed Playwright (NODE_PATH="$(npm root -g)").
const { chromium } = createRequire(import.meta.url)("playwright");

const mark = (size, pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-pad} ${-pad} ${32 + pad * 2} ${32 + pad * 2}">
  <rect x="${-pad}" y="${-pad}" width="${32 + pad * 2}" height="${32 + pad * 2}" rx="${pad ? 0 : 9}" fill="#4F46E5"/>
  <path d="M16 6.5 9 9.2v5.6c0 4.6 3 8.3 7 9.7 4-1.4 7-5.1 7-9.7V9.2z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="m12.6 15.6 2.4 2.4 4.6-4.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const logo = `
<div style="display:flex;align-items:center;gap:14px;font-family:Arial,Helvetica,sans-serif;width:240px;height:72px">
  ${mark(56)}
  <span style="font-size:40px;font-weight:800;color:#0f172a;letter-spacing:-1px">Senim</span>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(html, w, h, out, transparent = false) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  await page.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
}
await shot(mark(192), 192, 192, "public/icons/icon-192.png", true);
await shot(mark(512), 512, 512, "public/icons/icon-512.png", true);
await shot(mark(512, 6), 512, 512, "public/icons/icon-maskable-512.png");
await shot(logo, 240, 72, "public/logo.png", true);
await browser.close();
console.log("icons written");
