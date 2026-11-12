// Raster exports of our code-native vector mark; run after changing circle-mark.svg.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const svg = await fs.readFile(
  new URL("../../assets/brand/circle-mark.svg", import.meta.url),
  "utf8",
);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1,
  });
  for (const [name, background, inset] of [
    ["circle-mark", "transparent", 0],
    ["app-icon", "#0B0B0B", 230],
  ]) {
    await page.setContent(
      `<style>*{box-sizing:border-box}body{margin:0;background:${background};width:1024px;height:1024px;padding:${inset}px}svg{width:100%;height:100%}</style>${svg}`,
    );
    await page.screenshot({
      path: `assets/brand/${name}.png`,
      omitBackground: true,
    });
  }
  await page.setViewportSize({ width: 64, height: 64 });
  await page.setContent(
    `<style>body{box-sizing:border-box;margin:0;background:#0b0b0b;width:64px;height:64px;padding:12px}svg{width:100%;height:100%}</style>${svg}`,
  );
  const png = await page.screenshot();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 64;
  header[7] = 64;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  await fs.writeFile(
    "apps/web/src/app/favicon.ico",
    Buffer.concat([header, png]),
  );
} finally {
  await browser.close();
}
