const ACC = /\b(case|cover|protector|tempered|screen guard|charger|cable|spare|replacement|combo|sticker|dummy|decals?|wraps?|holder|stand|mount|strap|lanyard|adapter|tripod|bumper|pouch|sleeve|housing|back panel|sim tray)\b/i;
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
const amz = n => /^amazon/i.test(String(n || '')) ? 1 : 0;   // on equal prices Amazon is listed first
const median = a => { const p = a.map(x => x.extracted_price).sort((x, y) => x - y); return p[Math.floor(p.length / 2)] || 0; };
function cheapestPerStore(list, ratio, floor, max) {
  if (list.length > 2) { const m = median(list); list = list.filter(i => i.extracted_price >= Math.max(m * ratio, floor || 0)); }   // drop prices far below the median
  const by = new Map();
  list.forEach(i => { const c = by.get(i.source); if (!c || i.extracted_price < c.extracted_price) by.set(i.source, i); });
  const link = i => { const l = String(i.link || i.product_link || ''); return l.startsWith('https://') ? l : ''; };
  return [...by.values()].sort((a, b) => a.extracted_price - b.extracted_price || amz(b.source) - amz(a.source)).slice(0, max).map(i => ({ store: String(i.source).slice(0, 40), price: Math.round(i.extracted_price),
    title: String(i.title || '').slice(0, 120), link: link(i), direct: isDirect(link(i)), token: String(i.immersive_product_page_token || ''), delivery: String(i.delivery || '').slice(0, 40), cond: cond(i) }));
}
// Category (from the AI, or guessed from the words) sets a minimum plausible price, so accessories such as skins, cases or
// stickers that slip through cannot be shown as the "lowest price" of a phone.
const SKINCARE_WORDS = /\b(cleanser|serum|moisturi[sz]er|sunscreen|lotion|cream|face|facial|spf|gel|toner|wash|acne|sensitive|oily|dry|\d+\s?(ml|gm|g))\b/i;
const isAcc = t => ACC.test(t) || (/\bskins?\b/i.test(t) && !SKINCARE_WORDS.test(t));
const FLOOR = { phone: 4000, laptop: 12000, tv: 4000, skincare: 30 };
const SPEC = /\b\d+\s?(gb|tb)\b|\b[45]g\b|smartphone/i;
function guessCategory(q) {
  if (/\b(serum|sunscreen|moisturi[sz]er|cleanser|face ?wash|toner|lotion|cream|spf|niacinamide|skincare)\b/i.test(q)) return 'skincare';
  if (/\b(laptop|macbook|thinkpad|notebook|ideapad|vivobook|zenbook|inspiron|pavilion)\b/i.test(q)) return 'laptop';
  if (/\b(tv|television|qled)\b/i.test(q)) return 'tv';
  if (/\b(iphone|galaxy|oneplus|pixel|redmi|poco|realme|vivo|oppo|iqoo|nothing phone|motorola|moto|xiaomi|samsung|nokia|infinix|tecno|lava|smartphone|mobile)\b|\b5g\b/i.test(q)) return 'phone';
  return 'other';
}
// Result: { offers: new listings (cheapest per store), used: used/refurbished listings, img, relaxed, checkedAt }
function build(items, q, category) {
  const cat = category || guessCategory(q), floor = FLOOR[cat] || 0, big = ['phone', 'laptop', 'tv'].includes(cat);
  const wantsAcc = /case|cover|charger|cable|protector/i.test(q), toks = norm(q).split(' ').filter(Boolean);
  let ok = items.filter(i => typeof i.extracted_price === 'number' && i.extracted_price >= Math.max(1, floor) && i.source && (wantsAcc || !isAcc(String(i.title || ''))));
  if (cat === 'phone' && ok.some(i => SPEC.test(String(i.title)))) ok = ok.filter(i => SPEC.test(String(i.title)));   // real phones name storage or 5G
  const strict = ok.filter(i => { const t = compact(i.title); return toks.every(k => t.includes(compact(k))); });
  const relaxed = !strict.length && ok.length > 0;
  if (strict.length) ok = strict;
  let isNew = ok.filter(i => cond(i) === 'New'); const old = ok.filter(i => cond(i) !== 'New');
  if (big && isNew.length > 1) { const mx = Math.max(...isNew.map(i => i.extracted_price)); isNew = isNew.filter(i => i.extracted_price >= mx * 0.4); }   // far cheaper than the rest = suspicious
  const offers = cheapestPerStore(isNew, 0.5, 0, 6), usedFloor = Math.max(floor, offers.length ? median(isNew) * 0.2 : 0);
  const used = cheapestPerStore(old, 0.3, usedFloor, 5);
  const th = (ok.find(i => String(i.thumbnail || '').startsWith('https://')) || {}).thumbnail || '';
  return { relaxed, img: th, checkedAt: Date.now(), offers, used };
}
// Direct seller links + fuller store list: Google's list links usually go through Google, and the list shows one listing per store.
// The "immersive product" page of the cheapest listing has the stores' own product URLs and prices for that exact product
// (1 extra SerpApi credit). Those stores replace or extend the list; stores not found there keep their Google link.
async function fetchProduct(token) {
  const u = new URL('https://serpapi.com/search.json');
  Object.entries({ engine: 'google_immersive_product', page_token: token, api_key: process.env.SERPAPI_KEY }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('immersive ' + r.status);
  return (await r.json()).product_results || {};
}
const skey = n => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(com|in)$/, '');
async function resolveDirect(list, max = 8) {
  const first = list.find(o => o.token);
  if (!first) return { list, credits: 0 };
  try {
    const pr = await fetchProduct(first.token), merged = new Map();
    list.forEach(o => merged.set(skey(o.store), o));
    (pr.stores || []).forEach(s => {
      const price = Number(s.extracted_price) || parseFloat(String(s.price || '').replace(/[^0-9.]/g, ''));
      if (!isDirect(s.link) || !s.name) return;
      const key = skey(s.name), cur = merged.get(key);
      if (!(price > 0) || price < first.price * 0.5 || price > first.price * 2.5) { if (cur) merged.set(key, { ...cur, link: s.link, direct: true }); return; }   // missing or implausible price: keep ours   // no price given: keep ours, use their link
      merged.set(key, { store: String(s.name).slice(0, 40), price: Math.round(price), title: (cur && cur.title) || String(pr.title || first.title).slice(0, 120),
        link: s.link, direct: true, token: '', delivery: String(s.shipping || (cur && cur.delivery) || '').slice(0, 40), cond: first.cond });
    });
    return { credits: 1, list: [...merged.values()].sort((a, b) => a.price - b.price || amz(b.store) - amz(a.store)).slice(0, max) };
  } catch (e) { console.error('direct links failed:', e.message); return { list, credits: 1 }; }
}
const strip = list => list.map(({ token, ...o }) => o);
module.exports = { norm, fetchShopping, build, resolveDirect, strip, isDirect, guessCategory };
