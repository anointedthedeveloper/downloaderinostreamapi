const express = require('express');
const https = require('https');
const { chromium } = require('c:\\Users\\Admin\\.agents\\skills\\playwright\\node_modules\\playwright');

const app = express();
const PORT = 3000;

const API_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://moviebox.ph/',
  'Origin': 'https://moviebox.ph'
};

// Block these to speed up page loads
const BLOCKED = ['google-analytics', 'firebase', 'hisavana', 'doubleclick', 'googlesyndication', 'adservice', 'analytics'];

let browser, searchPage, streamPage;

async function initBrowser() {
  browser = await chromium.launch({ headless: true });

  // Search page
  searchPage = await browser.newPage();
  await searchPage.route('**/*', route => {
    const url = route.request().url();
    if (BLOCKED.some(b => url.includes(b))) return route.abort();
    route.continue();
  });

  // Stream page
  streamPage = await browser.newPage();
  await streamPage.route('**/*', route => {
    const url = route.request().url();
    if (BLOCKED.some(b => url.includes(b))) return route.abort();
    route.continue();
  });

  console.log('Browser ready');
}

function httpGet(hostname, path) {
  return new Promise((resolve, reject) => {
    https.request({ hostname, path, headers: API_HEADERS }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject).end();
  });
}

async function search(keyword) {
  await searchPage.goto(`https://moviebox.ph/web/searchResult?keyword=${encodeURIComponent(keyword)}`, {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await searchPage.waitForTimeout(3000);
  return searchPage.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href*="/detail/"]')].map(a => {
      const m = a.href.match(/\/detail\/([^?#]+)/);
      return m ? m[1] : null;
    }).filter(Boolean))]
  );
}

async function getDetail(detailPath) {
  const raw = await httpGet('h5-api.aoneroom.com', `/wefeed-h5api-bff/detail?detailPath=${detailPath}`);
  const json = JSON.parse(raw);
  if (json.code !== 0) throw new Error(json.message);
  const s = json.data.subject;
  return {
    subjectId: s.subjectId,
    title: s.title,
    type: s.subjectType === 1 ? 'movie' : 'series',
    description: s.description,
    releaseDate: s.releaseDate,
    genre: s.genre,
    cover: s.cover?.url,
    imdbRating: s.imdbRatingValue,
    detailPath: s.detailPath,
    seasons: json.data.resource?.seasons || []
  };
}

async function extractStreams(subjectId, detailPath, se = '', ep = '') {
  const playerUrl = `https://123movienow.cc/spa/videoPlayPage/movies/${detailPath}?id=${subjectId}&type=/movie/detail&detailSe=${se}&detailEp=${ep}&lang=en`;

  const seen = new Set();
  const streams = [];

  // Listen for stream requests
  const handler = request => {
    const url = request.url();
    if ((url.includes('.m3u8') || url.includes('.mp4')) && !seen.has(url)) {
      seen.add(url);
      streams.push({ url, headers: request.headers() });
    }
  };
  streamPage.on('request', handler);

  await streamPage.goto(playerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Click play if visible
  try {
    const playBtn = streamPage.locator('.vjs-big-play-button').first();
    await playBtn.waitFor({ timeout: 5000 });
    await playBtn.click();
  } catch {}

  // Wait until we get at least one stream URL or timeout after 20s
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (streams.length > 0) { clearInterval(check); clearTimeout(timeout); resolve(); }
    }, 500);
    const timeout = setTimeout(() => { clearInterval(check); resolve(); }, 20000);
  });

  streamPage.off('request', handler);
  return { playerUrl, streams };
}

// Routes
app.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });
  search(q)
    .then(slugs => res.json({ results: slugs.map(slug => ({ slug, detailUrl: `https://moviebox.ph/detail/${slug}` })) }))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.get('/detail', (req, res) => {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug is required' })
  getDetail(slug)
    .then(detail => res.json(detail))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.get('/stream', (req, res) => {
  const { slug, se, ep } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  getDetail(slug)
    .then(detail => extractStreams(detail.subjectId, detail.detailPath, se || '', ep || ''))
    .then(result => res.json(result))
    .catch(err => res.status(500).json({ error: err.message }));
});

// Start
initBrowser().then(() => {
  app.listen(PORT, () => console.log(`Stream API running on http://localhost:${PORT}`));
});
