// Refreshes public/prices.json (instant results for the example searches). Run by GitHub Actions weekly, or by hand:
//   SERPAPI_KEY=... node scripts/refresh-prices.js
const fs = require('fs'), path = require('path');
const { norm, fetchShopping, build, resolveDirect, strip } = require('../api/_search.js');
const file = path.join(__dirname, '..', 'public', 'prices.json'), featured = require('./featured.json');
(async () => {
  if (!process.env.SERPAPI_KEY) { console.error('SERPAPI_KEY missing'); process.exit(1); }
  let old = { items: {} }; try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  const items = {}; let ok = 0;
  for (const q of featured) {
    const k = norm(q);
    try { const v = build(await fetchShopping(q), q); v.offers = strip((await resolveDirect(v.offers)).list); v.used = strip(v.used); /* used listings keep their Google links: saves 1 credit per example */ if (v.offers.length) { items[k] = { q, ...v }; ok++; } else { console.log('no match for', q); if (old.items && old.items[k]) items[k] = old.items[k]; } }
    catch (e) { console.error('failed', q, e.message); if (old.items && old.items[k]) items[k] = old.items[k]; }
    await new Promise(r => setTimeout(r, 1000));
  }
  fs.writeFileSync(file, JSON.stringify({ checkedAt: new Date().toISOString(), items }, null, 1));
  console.log('updated', ok, 'of', featured.length);
})();
