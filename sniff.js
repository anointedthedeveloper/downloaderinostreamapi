const { chromium } = require('c:\\Users\\Admin\\.agents\\skills\\playwright\\node_modules\\playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('request', request => {
    const url = request.url();
    if (url.includes('api') || url.includes('search') || url.includes('detail') || url.includes('movie')) {
      console.log(`REQ: ${request.method()} ${url}`);
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('api') || url.includes('search') || url.includes('detail')) {
      try {
        const text = await response.text();
        if (text.startsWith('{') || text.startsWith('[')) {
          console.log(`\nRES: ${url}\n${text.slice(0, 500)}\n---`);
        }
      } catch {}
    }
  });

  console.log('=== SEARCH PAGE ===');
  await page.goto('https://moviebox.ph/web/searchResult?keyword=zootopia', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  console.log('\n=== DETAIL PAGE ===');
  await page.goto('https://moviebox.ph/detail/zootopia-SxDV9XZ5kg6?id=5256777509147918584&scene=&page_from=search_detail&type=/movie/detail', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  await browser.close();
})();
