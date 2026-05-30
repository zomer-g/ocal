/* eslint-disable */
// One-off screenshot script for docs/screenshots/redesign/ocal-home.png.
// Usage: node scripts/snap-home-page.cjs
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:5173/';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'redesign', 'ocal-home.png');

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
    // serve the SPA shell which Vite returns as index.html. /stats gets a
    // mock so the hero stats grid renders for the screenshot.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      if (/\/api\/public\/stats(\?|$)/.test(u)) {
        return req.respond({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({
            total_events: 325339,
            total_sources: 612,
            total_organizations: 5,
          }),
        });
      }
      const isBackendCall = /\/api\/public\//.test(u) || /\/api\/admin\//.test(u);
      if (isBackendCall) return req.abort();
      req.continue();
    });

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for the hero H1 to render so we know React mounted.
    await page.waitForFunction(
      () => !!document.querySelector('h1') && document.querySelector('h1').innerText.trim().length > 0,
      { timeout: 30000 },
    );
    // Give layout one more tick to settle (fonts, etc.)
    await new Promise((r) => setTimeout(r, 500));

    // Hero-only screenshot (the request was for the hero alignment).
    await page.screenshot({ path: OUT, fullPage: false });
    console.log('Saved:', OUT);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
