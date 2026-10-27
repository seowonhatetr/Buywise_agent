// POST /api/prices { ids: number[] } -> { prices: { id: { offers: [{store, price, link, delivery, checkedAt}], img } }, fetchedAt }
// Source: Google Shopping (India) through SerpApi. Needs SERPAPI_KEY. Cached per server instance.
const CAT = require('./_catalog.js');
const cache = new Map(), TTL = 6 * 3600e3, hits = new Map();
const BAD = { phone: /\b(case|cover|protector|tempered|charger|cable|skin|refurbished|renewed|used|pre-?owned|combo)\b/i,
              beauty: /\b(refurbished|used|combo|sample|tester|pack of [2-9])\b/i };
function limited(ip) { const n = Date.now(), a = (hits.get(ip) || []).filter(t => n - t < 6e5); a.push(n); hits.set(ip, a); return a.length > 30; }
function pick(items, spec) {
  const ok = items.filter(it => {
    const t = String(it.title || '').toLowerCase();
    return typeof it.extracted_price === 'number' && it.extracted_price > 0 && it.source
      && spec.must.every(w => t.includes(w)) && !spec.not.some(w => new RegExp('\\b' + w + '\\b').test(t)) && !BAD[spec.kind].test(t);
  });
  if (!ok.length) return { offers: [], img: '' };
  const ps = ok.map(i => i.extracted_price).sort((a, b) => a - b), med = ps[Math.floor(ps.length / 2)];
  const byStore = new Map();
  ok.filter(i => i.extracted_price >= med * 0.6 && i.extracted_price <= med * 1.8).forEach(i => {   // outlier guard
    const cur = byStore.get(i.source);
    if (!cur || i.extracted_price < cur.extracted_price) byStore.set(i.source, i);
  });
  const offers = [...byStore.values()].sort((a, b) => a.extracted_price - b.extracted_price).slice(0, 4).map(i => {
    const link = String(i.link || i.product_link || '');
    return { store: String(i.source).slice(0, 40), price: Math.round(i.extracted_price), link: link.startsWith('https://') ? link : '',
             delivery: String(i.delivery || '').slice(0, 40), checkedAt: Date.now() };
  });
  const th = ok.find(i => String(i.thumbnail || '').startsWith('https://'));
  return { offers, img: th ? String(th.thumbnail) : '' };
}
async function lookup(id) {
  const c = cache.get(id); if (c && Date.now() - c.t < TTL) return c.v;
  const spec = CAT[id]; if (!spec) return { offers: [], img: '' };
  const u = new URL('https://serpapi.com/search.json');
  Object.entries({ engine: 'google_shopping', q: spec.q, gl: 'in', hl: 'en', google_domain: 'google.co.in', api_key: process.env.SERPAPI_KEY }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error('serpapi ' + r.status);
  const v = pick((await r.json()).shopping_results || [], spec);
  cache.set(id, { t: Date.now(), v }); return v;
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.SERPAPI_KEY) return res.status(503).json({ error: 'Live prices not configured' });
  if (limited(String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x')) return res.status(429).json({ error: 'Too many requests' });
  let b = {}; try { b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) {}
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(i => CAT[i]).slice(0, 8);
  if (!ids.length) return res.status(400).json({ error: 'Invalid ids' });
  const out = {};
  (await Promise.allSettled(ids.map(lookup))).forEach((r, i) => { out[ids[i]] = r.status === 'fulfilled' ? r.value : { offers: [], img: '' }; if (r.status !== 'fulfilled') console.error('price error', ids[i], r.reason && r.reason.message); });
  return res.status(200).json({ prices: out, fetchedAt: Date.now() });
};
module.exports._pick = pick;
