const express = require('express');
const https = require('https');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 7860;

const BLOCKED = [
  'google-analytics', 'firebase', 'hisavana', 'doubleclick',
  'googlesyndication', 'adservice', 'analytics', 'firebaselogging', 'firebaseinstallations'
];

let browser;
const streamPages = [];
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '3');
const queue = [];

async function initBrowser() {
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await browser.newPage();
    await page.route('**/*', route => {
      if (BLOCKED.some(b => route.request().url().includes(b))) return route.abort();
      route.continue();
    });
    streamPages.push({ page, busy: false });
  }
  console.log(`Browser ready with ${MAX_PAGES} stream pages`);
}

function getFreePage() {
  return new Promise(resolve => {
    const slot = streamPages.find(p => !p.busy);
    if (slot) { slot.busy = true; return resolve(slot); }
    queue.push(resolve);
  });
}

function releasePage(slot) {
  slot.busy = false;
  if (queue.length > 0) { const next = queue.shift(); slot.busy = true; next(slot); }
}

function httpGet(hostname, path) {
  return new Promise((resolve, reject) => {
    https.request({
      hostname, path,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://moviebox.ph/'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject).end();
  });
}

function resolveNuxt(arr, idx, visited = new Map()) {
  if (visited.has(idx)) return visited.get(idx);
  const val = arr[idx];
  if (val === null || typeof val !== 'object') { visited.set(idx, val); return val; }
  if (Array.isArray(val)) {
    if (val[0] === 'ShallowReactive' || val[0] === 'Reactive') return resolveNuxt(arr, val[1], visited);
    const r = val.map(i => typeof i === 'number' ? resolveNuxt(arr, i, visited) : i);
    visited.set(idx, r); return r;
  }
  const r = {}; visited.set(idx, r);
  for (const [k, v] of Object.entries(val)) r[k] = typeof v === 'number' ? resolveNuxt(arr, v, visited) : v;
  return r;
}

async function search(keyword) {
  const html = await httpGet('moviebox.ph', `/web/searchResult?keyword=${encodeURIComponent(keyword)}`);
  const match = html.match(/id="__NUXT_DATA__">([\s\S]+?)<\/script>/);
  if (!match) throw new Error('Could not parse search page');
  const arr = JSON.parse(match[1]);
  const resolved = resolveNuxt(arr, 0);
  const dataKeys = Object.keys(resolved?.data || {});
  const items = resolved?.data?.[dataKeys[1]]?.data?.items;
  if (!items) throw new Error('No results found');
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

async function getDetail(slug) {
  const raw = await httpGet('h5-api.aoneroom.com', `/wefeed-h5api-bff/detail?detailPath=${slug}`);
  const json = JSON.parse(raw);
  if (json.code !== 0) throw new Error(json.message);
  const s = json.data.subject;
  const isMovie = s.subjectType === 1;

  const seasons = (json.data.resource?.seasons || []).map(season => ({
    season: season.se,
    totalEpisodes: season.maxEp,
    resolutions: season.resolutions,
    episodes: Array.from({ length: season.maxEp }, (_, i) => ({
      episode: i + 1,
      streamUrl: `/stream?slug=${s.detailPath}&se=${season.se}&ep=${i + 1}`
    }))
  }));

  const availableDubs = (s.dubs || []).filter(d => d.type === 0).map(d => ({
    lang: d.lanCode, name: d.lanName, slug: d.detailPath, subjectId: d.subjectId,
    streamUrl: isMovie ? `/stream?slug=${d.detailPath}` : null
  }));
  const availableSubs = (s.dubs || []).filter(d => d.type === 1).map(d => ({
    lang: d.lanCode, name: d.lanName, slug: d.detailPath, subjectId: d.subjectId
  }));

  return {
    subjectId: s.subjectId,
    slug: s.detailPath,
    title: s.title,
    type: isMovie ? 'movie' : 'series',
    description: s.description,
    releaseDate: s.releaseDate,
    duration: s.duration || null,
    genre: s.genre,
    country: s.countryName,
    imdbRating: s.imdbRatingValue,
    imdbRatingCount: s.imdbRatingCount,
    subtitles: s.subtitles ? s.subtitles.split(',').map(s => s.trim()) : [],
    availableDubs,
    availableSubs,
    cover: s.cover?.url || null,
    trailer: s.trailer?.videoAddress?.url || null,
    trailerThumbnail: s.trailer?.cover?.url || null,
    cast: (json.data.stars || []).map(st => ({ name: st.name, character: st.character, avatar: st.avatarUrl })),
    seasons: isMovie ? [] : seasons,
    streamUrl: isMovie ? `/stream?slug=${s.detailPath}` : null
  };
}

function httpGetHttp(hostname, path) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    http.request({
      hostname, path,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://123movienow.cc/'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject).end();
  });
}

async function extractStreams(slug, se, ep, lang, quality) {
  const detail = await getDetail(slug);

  let finalSe = se;
  let finalEp = ep;
  if (detail.type === 'movie') { finalSe = se || '0'; finalEp = ep || '1'; }

  let streamSlug = detail.slug;
  let streamId = detail.subjectId;
  if (lang && lang !== 'en') {
    const dub = [...(detail.availableDubs || []), ...(detail.availableSubs || [])]
      .find(d => d.lang === lang || d.name.toLowerCase().includes(lang.toLowerCase()));
    if (dub) { streamSlug = dub.slug; streamId = dub.subjectId; }
  }

  // Direct API call — no Playwright needed for quality selection
  const playPath = `/wefeed-h5api-bff/subject/play?subjectId=${streamId}&se=${finalSe}&ep=${finalEp}&detailPath=${streamSlug}`;
  const raw = await httpGetHttp('123movienow.cc', playPath);
  const json = JSON.parse(raw);

  if (json.code !== 0) throw new Error(json.message || 'Failed to get streams');

  const allStreams = (json.data.streams || []).map(s => ({
    url: s.url,
    quality: s.resolutions ? `${s.resolutions}p` : 'unknown',
    resolution: parseInt(s.resolutions) || 0,
    format: s.format,
    size: parseInt(s.size) || 0,
    duration: s.duration
  }));

  // Filter by quality if requested
  let streams = allStreams;
  if (quality) {
    const q = parseInt(quality);
    const match = allStreams.find(s => s.resolution === q);
    if (match) streams = [match];
  }

  // Also fetch captions if available
  let captions = [];
  if (allStreams.length > 0 && json.data.streams?.[0]?.id) {
    try {
      const capRaw = await httpGet('h5-api.aoneroom.com',
        `/wefeed-h5api-bff/subject/caption?format=MP4&id=${json.data.streams[0].id}&subjectId=${streamId}&detailPath=${streamSlug}`);
      const capJson = JSON.parse(capRaw);
      if (capJson.code === 0) {
        captions = (capJson.data.captions || []).map(c => ({ lang: c.lan, name: c.lanName, url: c.url }));
      }
    } catch {}
  }

  const playerUrl = `https://123movienow.cc/spa/videoPlayPage/movies/${streamSlug}?id=${streamId}&type=/movie/detail&detailSe=${finalSe}&detailEp=${finalEp}&lang=en`;

  return {
    title: detail.title,
    type: detail.type,
    season: finalSe !== '0' ? finalSe : null,
    episode: finalEp !== '1' || detail.type === 'series' ? finalEp : null,
    availableQualities: allStreams.map(s => s.quality),
    streams,
    captions,
    playerUrl
  };
}

// Routes
app.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });
  search(q).then(results => res.json({ results })).catch(err => res.status(500).json({ error: err.message }));
});

app.get('/detail', (req, res) => {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  getDetail(slug).then(d => res.json(d)).catch(err => res.status(500).json({ error: err.message }));
});

app.get('/stream', (req, res) => {
  const { slug, se, ep, lang, quality } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  extractStreams(slug, se, ep, lang, quality).then(r => res.json(r)).catch(err => res.status(500).json({ error: err.message }));
});

app.get('/', (req, res) => res.json({
  endpoints: {
    search: '/search?q=<keyword>',
    detail: '/detail?slug=<slug>',
    stream: '/stream?slug=<slug>&se=<season>&ep=<episode>&lang=<langCode>&quality=<360|480|720|1080>'
  }
}));

app.listen(PORT, () => console.log(`Stream API running on http://localhost:${PORT}`));
