// Shared by the live search API and the scheduled refresh script: calls Google Shopping (India) via SerpApi and cleans the result.
const BAD = /\b(case|cover|protector|tempered|screen guard|charger|cable|skin|refurbished|renewed|used|pre-?owned|open box|spare|replacement|combo|sticker|dummy)\b/i;
const norm = q => String(q || '').toLowerCase().replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const compact = s => String(s || '').toLowerCase().replace(/[^a-z0-9+]/g, '');
async function fetchShopping(q) {
  const u = new URL('https://serpapi.com/search.json');
  Object.entries({ engine: 'google_shopping', q, gl: 'in', hl: 'en', google_domain: 'google.co.in', api_key: process.env.SERPAPI_KEY }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('serpapi ' + r.status);
  return (await r.json()).shopping_results || [];
}
function build(items, q) {
  const wantsAcc = /case|cover|charger|cable|protector/i.test(q), toks = norm(q).split(' ').filter(Boolean);
  let ok = items.filter(i => typeof i.extracted_price === 'number' && i.extracted_price > 0 && i.source && (wantsAcc || !BAD.test(String(i.title || ''))));
  const strict = ok.filter(i => { const t = compact(i.title); return toks.every(k => t.includes(compact(k))); });
  const relaxed = !strict.length && ok.length > 0;
  if (strict.length) ok = strict;
  if (ok.length > 2) {   // drop prices far below the median (usually accessories or wrong items)
    const ps = ok.map(i => i.extracted_price).sort((a, b) => a - b), med = ps[Math.floor(ps.length / 2)];
    ok = ok.filter(i => i.extracted_price >= med * 0.45);
  }
  const by = new Map();
  ok.forEach(i => { const c = by.get(i.source); if (!c || i.extracted_price < c.extracted_price) by.set(i.source, i); });
  const picked = [...by.values()].sort((a, b) => a.extracted_price - b.extracted_price).slice(0, 6);
  const link = i => { const l = String(i.link || i.product_link || ''); return l.startsWith('https://') ? l : ''; };
  const th = (picked.find(i => String(i.thumbnail || '').startsWith('https://')) || {}).thumbnail || '';
  return { relaxed, img: th, checkedAt: Date.now(), offers: picked.map(i => ({ store: String(i.source).slice(0, 40), price: Math.round(i.extracted_price),
    title: String(i.title || '').slice(0, 120), link: link(i), delivery: String(i.delivery || '').slice(0, 40), rating: typeof i.rating === 'number' ? i.rating : null })) };
}
module.exports = { norm, fetchShopping, build };
