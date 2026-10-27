// Refreshes public/prices.json from Google Shopping (SerpApi). Run by GitHub Actions every 4 days, or by hand:
//   SERPAPI_KEY=... node scripts/refresh-prices.js
const fs = require('fs'), path = require('path');
const CAT = require('../api/_catalog.js'), pick = require('../api/prices.js')._pick;
const file = path.join(__dirname, '..', 'public', 'prices.json');
(async () => {
  if (!process.env.SERPAPI_KEY) { console.error('SERPAPI_KEY missing'); process.exit(1); }
  let old = { items: {} }; try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  const items = {}; let ok = 0;
  for (const id of Object.keys(CAT)) {
    try {
      const u = new URL('https://serpapi.com/search.json');
      Object.entries({ engine: 'google_shopping', q: CAT[id].q, gl: 'in', hl: 'en', google_domain: 'google.co.in', api_key: process.env.SERPAPI_KEY }).forEach(([k, v]) => u.searchParams.set(k, v));
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = pick((await r.json()).shopping_results || [], CAT[id]);
      if (v.offers.length) { items[id] = v; ok++; } else { items[id] = (old.items || {})[id] || { offers: [], img: '' }; console.log('no match for', id, CAT[id].q); }
    } catch (e) { console.error('failed', id, e.message); items[id] = (old.items || {})[id] || { offers: [], img: '' }; }  // keep the previous snapshot for this product
    await new Promise(r => setTimeout(r, 1000));
  }
  fs.writeFileSync(file, JSON.stringify({ checkedAt: new Date().toISOString(), items }, null, 1));
  console.log('updated', ok, 'of', Object.keys(CAT).length);
})();
