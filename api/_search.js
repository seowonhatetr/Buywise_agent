const ACC = /\b(case|cover|protector|tempered|screen guard|charger|cable|spare|replacement|combo|sticker|dummy|phone skin|mobile skin|vinyl skin)\b/i;
const REFURB = /\b(refurbished|renewed|certified|open box|reconditioned)\b/i, USED = /\b(used|pre-?owned|second ?hand|like new)\b/i;
const norm = q => String(q || '').toLowerCase().replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const compact = s => String(s || '').toLowerCase().replace(/[^a-z0-9+]/g, '');
function cond(i) {
  const sh = String(i.second_hand_condition || '').toLowerCase(), t = String(i.title || '');
  if (sh) return /refurb|renew/.test(sh) ? 'Refurbished' : 'Used';
  if (REFURB.test(t)) return 'Refurbished'; if (USED.test(t)) return 'Used'; return 'New';
}
async function fetchShopping(q) {
  const u = new URL('https://serpapi.com/search.json');
  Object.entries({ engine: 'google_shopping', q, gl: 'in', hl: 'en', google_domain: 'google.co.in', api_key: process.env.SERPAPI_KEY }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('serpapi ' + r.status);
  return (await r.json()).shopping_results || [];
}
const GOOGLE = /(^|\.)(google\.[a-z.]+|googleadservices\.com|gstatic\.com|googleusercontent\.com|googlesyndication\.com|doubleclick\.net)$/;
const isDirect = l => { try { return new URL(l).protocol === 'https:' && !GOOGLE.test(new URL(l).hostname); } catch (e) { return false; } };
const median = a => { const p = a.map(x => x.extracted_price).sort((x, y) => x - y); return p[Math.floor(p.length / 2)] || 0; };
function cheapestPerStore(list, ratio, floor, max) {
  if (list.length > 2) { const m = median(list); list = list.filter(i => i.extracted_price >= Math.max(m * ratio, floor || 0)); }   // drop prices far below the median
  const by = new Map();
  list.forEach(i => { const c = by.get(i.source); if (!c || i.extracted_price < c.extracted_price) by.set(i.source, i); });
  const link = i => { const l = String(i.link || i.product_link || ''); return l.startsWith('https://') ? l : ''; };
  return [...by.values()].sort((a, b) => a.extracted_price - b.extracted_price).slice(0, max).map(i => ({ store: String(i.source).slice(0, 40), price: Math.round(i.extracted_price),
    title: String(i.title || '').slice(0, 120), link: link(i), direct: isDirect(link(i)), token: String(i.immersive_product_page_token || ''), delivery: String(i.delivery || '').slice(0, 40), cond: cond(i) }));
}
// Result: { offers: new listings (cheapest per store), used: used/refurbished listings, img, relaxed, checkedAt }
function build(items, q) {
  const wantsAcc = /case|cover|charger|cable|protector/i.test(q), toks = norm(q).split(' ').filter(Boolean);
  let ok = items.filter(i => typeof i.extracted_price === 'number' && i.extracted_price > 0 && i.source && (wantsAcc || !ACC.test(String(i.title || ''))));
  const strict = ok.filter(i => { const t = compact(i.title); return toks.every(k => t.includes(compact(k))); });
  const relaxed = !strict.length && ok.length > 0;
  if (strict.length) ok = strict;
  const isNew = ok.filter(i => cond(i) === 'New'), old = ok.filter(i => cond(i) !== 'New');
  const offers = cheapestPerStore(isNew, 0.45, 0, 6), floor = offers.length ? median(isNew) * 0.2 : 0;
  const used = cheapestPerStore(old, 0.3, floor, 5);
  const th = (ok.find(i => String(i.thumbnail || '').startsWith('https://')) || {}).thumbnail || '';
  return { relaxed, img: th, checkedAt: Date.now(), offers, used };
}
// Direct seller links: Google's list links usually go through Google. The "immersive product" page of the cheapest listing
// has the stores' own product URLs (costs 1 extra SerpApi credit). Store names are matched; unmatched stores keep their Google link.
async function fetchStores(token) {
  const u = new URL('https://serpapi.com/search.json');
  Object.entries({ engine: 'google_immersive_product', page_token: token, api_key: process.env.SERPAPI_KEY }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('immersive ' + r.status);
  return ((await r.json()).product_results || {}).stores || [];
}
const skey = n => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(com|in)$/, '');
async function resolveDirect(list) {
  const t = (list.find(o => o.token) || {}).token;
  if (!t) return { list, credits: 0 };
  try {
    const m = new Map();
    (await fetchStores(t)).forEach(s => { if (isDirect(s.link) && !m.has(skey(s.name))) m.set(skey(s.name), s.link); });
    return { credits: 1, list: list.map(o => { const l = m.get(skey(o.store)); return l ? { ...o, link: l, direct: true } : o; }) };
  } catch (e) { console.error('direct links failed:', e.message); return { list, credits: 1 }; }
}
const strip = list => list.map(({ token, ...o }) => o);
module.exports = { norm, fetchShopping, build, resolveDirect, strip, isDirect };
