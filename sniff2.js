const { chromium } = require('c:\\Users\\Admin\\.agents\\skills\\playwright\\node_modules\\playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('request', request => {
    const url = request.url();
    if (url.includes('h5-api.aoneroom.com')) {
      console.log(`REQ: ${request.method()} ${url}`);
      const body = request.postData();
      if (body) console.log(`BODY: ${body}`);
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('h5-api.aoneroom.com') && (url.includes('search') || url.includes('subject'))) {
      try {
        const text = await response.text();
        console.log(`\nRES: ${url}\n${text.slice(0, 1000)}\n---`);
      } catch {}
    }
  });

  await page.goto('https://moviebox.ph/web/searchResult?keyword=zootopia', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  await browser.close();
})();
