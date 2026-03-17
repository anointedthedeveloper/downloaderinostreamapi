const { chromium } = require('c:\\Users\\Admin\\.agents\\skills\\playwright\\node_modules\\playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const targetUrl = 'https://123movienow.cc/spa/videoPlayPage/movies/zootopia-SxDV9XZ5kg6?id=5256777509147918584&type=/movie/detail&detailSe=&detailEp=&lang=en';

  console.log(`Navigating to: ${targetUrl}`);

  page.on('request', request => {
    const url = request.url();
    if (url.includes('.m3u8') || url.includes('.mp4')) {
      console.log(`STREAM_URL_FOUND: ${url}`);
      console.log(`HEADERS: ${JSON.stringify(request.headers())}`);
    }
  });

  try {
    // Navigate with a common user-agent
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Sometimes play button needs to be clicked
    const playButton = await page.locator('.vjs-big-play-button').first();
    if (await playButton.isVisible()) {
      console.log('Clicking play button...');
      await playButton.click();
    }
    
    // Wait for the stream to load
    await page.waitForTimeout(20000);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  } finally {
    await browser.close();
  }
})();
