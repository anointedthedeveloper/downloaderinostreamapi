const { chromium } = require('c:\\Users\\Admin\\.agents\\skills\\playwright\\node_modules\\playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Capture ALL h5-api calls
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('h5-api.aoneroom.com')) {
      try {
        const text = await response.text();
        console.log(`\nAPI: ${url}\n${text.slice(0, 800)}\n---`);
      } catch {}
    }
  });

  await page.goto('https://moviebox.ph/web/searchResult?keyword=zootopia', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Wait for any lazy-loaded content
  await page.waitForTimeout(8000);

  // Try scrolling to trigger lazy load
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3000);

  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a')].map(a => a.href).filter(h => h.includes('/detail/'))
  );
  console.log('\nLINKS:', JSON.stringify(links, null, 2));

  await browser.close();
})();
