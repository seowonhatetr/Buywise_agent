// Refreshes public/prices.json (instant results for the example searches). Run by GitHub Actions weekly, or by hand:
//   SERPAPI_KEY=... node scripts/refresh-prices.js
// Cost: 2 credits per query (search + direct seller links for new listings). Used listings keep their Google links to save credits.
const fs = require('fs'), path = require('path');
const { norm, fetchShopping, build, resolveDirect, strip } = require('../api/_search.js');
const file = path.join(__dirname, '..', 'public', 'prices.json'), featured = require('./featured.json');
(async () => {
  if (!process.env.SERPAPI_KEY) { console.error('SERPAPI_KEY missing'); process.exit(1); }
  let old = { items: {} }; try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  const items = {}; let ok = 0;
  const keep = (k, q) => { if (old.items && old.items[k]) items[k] = old.items[k]; };
  for (const q of featured) {
    const k = norm(q);
    try {
      const v = build(await fetchShopping(q), q);
      if (v.offers.length) {
        v.offers = strip((await resolveDirect(v.offers)).list); v.used = strip(v.used); v.linked = true;
        items[k] = { q, ...v }; ok++;
      } else { console.log('no match for', q); keep(k, q); }
    } catch (e) { console.error('failed', q, e.message); keep(k, q); }
    await new Promise(r => setTimeout(r, 1000));
  }
  fs.writeFileSync(file, JSON.stringify({ checkedAt: new Date().toISOString(), items }, null, 1));
  console.log('updated', ok, 'of', featured.length);
})();
