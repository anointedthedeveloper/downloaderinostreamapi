const { chromium } = require('c:\\Users\\Admin\\.agents\\skills\\playwright\\node_modules\\playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://moviebox.ph/web/searchResult?keyword=zootopia', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Extract all movie links with id and slug
  const results = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('a[href*="/detail/"]').forEach(a => {
      const href = a.href;
      const match = href.match(/\/detail\/([^?]+)\?.*id=(\d+)/);
      if (match) {
        const slug = match[1];
        const id = match[2];
        const title = a.querySelector('img')?.alt || a.innerText?.trim() || slug;
        items.push({ title, slug, id, href });
      }
    });
    return items;
  });

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
