const express = require('express');
const https = require('https');
const { chromium } = require('c:\\Users\\Admin\\.agents\\skills\\playwright\\node_modules\\playwright');

const app = express();
const PORT = 3000;

const BLOCKED = ['google-analytics', 'firebase', 'hisavana', 'doubleclick', 'googlesyndication', 'adservice', 'analytics', 'firebaselogging', 'firebaseinstallations'];

let browser, streamPage;

async function initBrowser() {
  browser = await chromium.launch({ headless: true });
  streamPage = await browser.newPage();
  await streamPage.route('**/*', route => {
    if (BLOCKED.some(b => route.request().url().includes(b))) return route.abort();
    route.continue();
  });
  console.log('Browser ready');
}

// Plain HTTPS GET
function httpGet(hostname, path, reqHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://moviebox.ph/',
      ...reqHeaders
    };
    https.request({ hostname, path, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject).end();
  });
}

// Parse __NUXT_DATA__ array into resolved objects
function resolveNuxt(arr, idx, visited = new Map()) {
  if (visited.has(idx)) return visited.get(idx);
  const val = arr[idx];
  if (val === null || typeof val !== 'object') { visited.set(idx, val); return val; }
  if (Array.isArray(val)) {
    if (val[0] === 'ShallowReactive' || val[0] === 'Reactive') return resolveNuxt(arr, val[1], visited);
    const result = val.map(i => (typeof i === 'number' ? resolveNuxt(arr, i, visited) : i));
    visited.set(idx, result);
    return result;
  }
  const result = {};
  visited.set(idx, result);
  for (const [k, v] of Object.entries(val)) {
    result[k] = typeof v === 'number' ? resolveNuxt(arr, v, visited) : v;
  }
  return result;
}

// Search via SSR HTML — no Playwright, instant
async function search(keyword) {
  const html = await httpGet('moviebox.ph', `/web/searchResult?keyword=${encodeURIComponent(keyword)}`, { 'Accept': 'text/html' });
  const match = html.match(/id="__NUXT_DATA__">([\s\S]+?)<\/script>/);
  if (!match) throw new Error('Could not find NUXT data');

  const arr = JSON.parse(match[1]);
  const resolved = resolveNuxt(arr, 0);
  // Second key in data holds search results (first key is SEO/TDK metadata)
  const dataKeys = Object.keys(resolved?.data || {});
  const searchKey = dataKeys[1];
  const items = resolved?.data?.[searchKey]?.data?.items;
  if (!items) throw new Error('No search results found');

  return items.map(item => ({
    slug: item.detailPath,
    subjectId: item.subjectId,
    title: item.title,
    type: item.subjectType === 1 ? 'movie' : 'series',
    releaseDate: item.releaseDate,
    genre: item.genre,
    country: item.countryName,
    imdbRating: item.imdbRatingValue,
    cover: item.cover?.url || null,
    thumbnail: item.stills?.[0]?.url || item.cover?.url || null,
    hasResource: item.hasResource,
    detailUrl: `https://moviebox.ph/detail/${item.detailPath}`
  }));
}

// Full detail from h5-api
async function getDetail(slug) {
  const raw = await httpGet('h5-api.aoneroom.com', `/wefeed-h5api-bff/detail?detailPath=${slug}`);
  const json = JSON.parse(raw);
  if (json.code !== 0) throw new Error(json.message);
  const s = json.data.subject;
  const seasons = (json.data.resource?.seasons || []).map(season => ({
    season: season.se,
    totalEpisodes: season.maxEp,
    resolutions: season.resolutions,
    episodes: Array.from({ length: season.maxEp }, (_, i) => ({
      episode: i + 1,
      streamUrl: `/stream?slug=${s.detailPath}&se=${season.se}&ep=${i + 1}`
    }))
  }));

  return {
    subjectId: s.subjectId,
    slug: s.detailPath,
    title: s.title,
    type: s.subjectType === 1 ? 'movie' : 'series',
    description: s.description,
    releaseDate: s.releaseDate,
    genre: s.genre,
    country: s.countryName,
    imdbRating: s.imdbRatingValue,
    imdbRatingCount: s.imdbRatingCount,
    subtitles: s.subtitles ? s.subtitles.split(',') : [],
    dubs: s.dubs || [],
    cover: s.cover?.url || null,
    trailer: s.trailer?.videoAddress?.url || null,
    trailerThumbnail: s.trailer?.cover?.url || null,
    cast: (json.data.stars || []).map(st => ({
      name: st.name,
      character: st.character,
      avatar: st.avatarUrl
    })),
    seasons,
    streamUrl: s.subjectType === 1 ? `/stream?slug=${s.detailPath}` : null
  };
}

// Extract stream URLs using persistent Playwright page
async function extractStreams(slug, se = '', ep = '') {
  const detail = await getDetail(slug);
  const playerUrl = `https://123movienow.cc/spa/videoPlayPage/movies/${detail.slug}?id=${detail.subjectId}&type=/movie/detail&detailSe=${se}&detailEp=${ep}&lang=en`;

  const seen = new Set();
  const streams = [];

  const handler = request => {
    const url = request.url();
    if ((url.includes('.m3u8') || url.includes('.mp4')) && !seen.has(url)) {
      seen.add(url);
      streams.push({ url, headers: request.headers() });
    }
  };

  streamPage.on('request', handler);

  await streamPage.goto(playerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  try {
    const playBtn = streamPage.locator('.vjs-big-play-button').first();
    await playBtn.waitFor({ timeout: 5000 });
    await playBtn.click();
  } catch {}

  // Resolve as soon as first stream URL found, max 20s
  await new Promise(resolve => {
    const interval = setInterval(() => {
      if (streams.length > 0) { clearInterval(interval); clearTimeout(timer); resolve(); }
    }, 300);
    const timer = setTimeout(() => { clearInterval(interval); resolve(); }, 20000);
  });

  streamPage.off('request', handler);

  return {
    title: detail.title,
    type: detail.type,
    season: se || null,
    episode: ep || null,
    playerUrl,
    streams
  };
}

// GET /search?q=zootopia
app.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });
  search(q)
    .then(results => res.json({ results }))
    .catch(err => res.status(500).json({ error: err.message }));
});

// GET /detail?slug=zootopia-SxDV9XZ5kg6
app.get('/detail', (req, res) => {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  getDetail(slug)
    .then(detail => res.json(detail))
    .catch(err => res.status(500).json({ error: err.message }));
});

// GET /stream?slug=zootopia-SxDV9XZ5kg6
// GET /stream?slug=nesting-8urWu5BPho7&se=1&ep=3
app.get('/stream', (req, res) => {
  const { slug, se, ep } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  extractStreams(slug, se || '', ep || '')
    .then(result => res.json(result))
    .catch(err => res.status(500).json({ error: err.message }));
});

initBrowser().then(() => {
  app.listen(PORT, () => console.log(`Stream API running on http://localhost:${PORT}`));
});
