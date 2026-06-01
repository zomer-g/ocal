/* eslint-disable */
// Mobile header reference shots @ 390x844 (iPhone 14 viewport).
// Captures both closed and open hamburger states.
// Usage: node scripts/snap-mobile-header.cjs
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:5173/';
const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'redesign');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();

    // Mock the public stats endpoint so the hero renders fully; abort other
    // backend calls so React doesn't sit forever waiting on a non-running
    // server. SPA shell (/) still gets served by Vite.
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
    await page.waitForFunction(() => !!document.querySelector('h1'), { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 400));

    // Header collapsed — full-page so reviewer sees the hero context too
    const closedOut = path.join(OUT_DIR, 'ocal-mobile-header.png');
    await page.screenshot({ path: closedOut, fullPage: false });
    console.log('Saved:', closedOut);

    // Open the hamburger and capture the panel
    await page.click('button[aria-label="תפריט ניווט"]');
    await page.waitForFunction(
      () => document.querySelector('button[aria-label="תפריט ניווט"]')?.getAttribute('aria-expanded') === 'true',
      { timeout: 5000 },
    );
    await new Promise((r) => setTimeout(r, 300));
    const openOut = path.join(OUT_DIR, 'ocal-mobile-header-open.png');
    await page.screenshot({ path: openOut, fullPage: false });
    console.log('Saved:', openOut);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
