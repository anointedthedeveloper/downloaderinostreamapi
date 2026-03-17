const { chromium } = require('c:\\Users\\Admin\\.agents\\skills\\playwright\\node_modules\\playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('h5-api.aoneroom.com') && !url.includes('app/get') && !url.includes('tab/') && !url.includes('ad/') && !url.includes('everyone')) {
      try {
        const text = await response.text();
        console.log(`\nAPI: ${url}\n${text.slice(0, 1500)}\n---`);
      } catch {}
    }
  });

  await page.goto('https://moviebox.ph/detail/zootopia-SxDV9XZ5kg6', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  // Get the canonical URL with id param
  const currentUrl = page.url();
  console.log('\nFINAL URL:', currentUrl);

  await browser.close();
})();
