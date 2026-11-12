// Export native PNGs from the same code-native paths rendered as SVG on the web.
// Run after building @circle/design-tokens: node infrastructure/scripts/export-feed-icons.mjs
import { chromium } from '@playwright/test';
import { feedIconPaths } from '../../packages/design-tokens/dist/feed-icons.js';
import fs from 'node:fs/promises';
await fs.mkdir('assets/feed-icons', { recursive: true });
const browser = await chromium.launch();
try {
 const page = await browser.newPage({viewport:{width:96,height:96},deviceScaleFactor:1});
 for (const [name,path] of Object.entries(feedIconPaths)) {
  for (const filled of [false,...(['home','heart','bookmark'].includes(name)?[true]:[])]) {
   await page.setContent(`<style>body{margin:0;background:transparent}svg{display:block}</style><svg width="96" height="96" viewBox="0 0 24 24" fill="${filled?'#fff':'none'}" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`);
   await page.screenshot({path:`assets/feed-icons/${name}${filled?'-filled':''}.png`,omitBackground:true});
  }
 }
} finally { await browser.close(); }
