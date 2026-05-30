/* eslint-disable */
// One-off screenshot script for docs/screenshots/redesign/ocal-api.png.
// Usage: node scripts/snap-api-page.cjs
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:5173/api';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'redesign', 'ocal-api.png');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();

    // Fail backend API calls quickly so React doesn't spin forever — but DO
    // serve `/api` (the SPA route) which Vite returns as index.html.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      const isBackendCall = /\/api\/public\//.test(u) || /\/api\/admin\//.test(u);
      if (isBackendCall) return req.abort();
      req.continue();
    });

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Wait for MCP block to render
    await page.waitForSelector('#mcp-heading', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 500));

    await page.screenshot({ path: OUT, fullPage: true });
    console.log('Saved:', OUT);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
