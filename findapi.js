const https = require('https');

const BASE = 'h5-api.aoneroom.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://moviebox.ph/',
  'Origin': 'https://moviebox.ph'
};

function get(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: BASE, path, headers: HEADERS }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const endpoints = [
    '/wefeed-h5api-bff/subject/search?keyword=zootopia&page=1&perPage=10',
    '/wefeed-h5api-bff/subject/search-v2?keyword=zootopia&page=1&perPage=10',
    '/wefeed-h5api-bff/search/search?keyword=zootopia&page=1&perPage=10',
    '/wefeed-h5api-bff/subject/list?keyword=zootopia&page=1&perPage=10',
    '/wefeed-h5api-bff/subject/detail?subjectId=5256777509147918584',
    '/wefeed-h5api-bff/subject/info?subjectId=5256777509147918584',
    '/wefeed-h5api-bff/subject/get?subjectId=5256777509147918584',
  ];

  for (const ep of endpoints) {
    const res = await get(ep);
    console.log(`\n[${res.status}] ${ep}`);
    console.log(res.body.slice(0, 300));
  }
})();
