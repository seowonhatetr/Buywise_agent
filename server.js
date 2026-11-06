const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public')); // Serve static files from public
app.use(express.static('.'));

// Environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT) || 12;
const USED_SEARCH = process.env.USED_SEARCH === '1';
const EVENT_WEBHOOK_URL = process.env.EVENT_WEBHOOK_URL;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Cache initialization
const CACHE_FILE = path.join(__dirname, 'public', 'cache.json');
let searchCache = {};

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      searchCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to load cache file:', err);
    searchCache = {};
  }
}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(searchCache, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save cache file:', err);
  }
}

loadCache();

// Query Normalization
function normalizeQuery(query) {
  return String(query || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

// In-memory search tracking
let searchCount = 0;
let lastResetDate = new Date().toDateString();

function resetDailyCount() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    searchCount = 0;
    lastResetDate = today;
  }
}

// Log events to Google Sheets via Webhook
async function logEvent(type, data) {
  if (!EVENT_WEBHOOK_URL) return;
  try {
    await fetch(EVENT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        t: new Date().toISOString(),
        sid: 'session',
        type,
        data
      })
    });
  } catch (err) {
    console.error('Logging error:', err);
  }
}

// Gemini API for spelling correction
async function correctSpelling(query) {
  if (!GEMINI_API_KEY) return query;

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + GEMINI_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `You are a product search expert. Correct any typos and spacing in this product name for shopping search. Respond ONLY with the corrected name: "${query}"` }] }],
        generationConfig: { temperature: 0.1 }
      })
    });

    const data = await response.json();
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
      return data.candidates[0].content.parts[0].text.trim();
    }
  } catch (error) {
    console.error('Gemini API error:', error);
  }
  return query;
}

// SerpApi integration with safe URL & error handling
async function searchGoogleShopping(query) {
  if (!SERPAPI_KEY) {
    console.warn('SERPAPI_KEY missing. Returning fallback sample data.');
    return getFallbackProducts(query);
  }

  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&tbm=shop&location=India&hl=en&gl=in&api_key=${SERPAPI_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    console.error('SerpApi error payload:', data.error);
    return getFallbackProducts(query);
  }

  return data.shopping_results || [];
}

// Filter exact models with smart matching
function filterExactModels(products, originalQuery) {
  const query = originalQuery.toLowerCase();
  const filtered = [];

  for (const product of products) {
    if (!product || !product.title) continue;
    const title = product.title.toLowerCase();

    // Exclude obvious non-product accessories unless asked
    const accessories = ['case', 'cover', 'screen protector', 'tempered glass', 'skin', 'sticker', 'charger cable', 'adapter'];
    if (accessories.some(acc => title.includes(acc) && !query.includes(acc))) continue;

    // Exclude variants (FE, Plus, Pro, Max, Ultra, Edge, Lite, Mini) if query doesn't specify them
    const variants = ['fe', 'plus', 'pro', 'max', 'ultra', 'edge', 'lite', 'mini'];
    let hasExcludedVariant = false;
    for (const v of variants) {
      if (title.includes(v) && !query.includes(v)) {
        hasExcludedVariant = true;
        break;
      }
    }

    if (hasExcludedVariant) continue;

    // Check minimum price
    const price = parseFloat(product.extracted_price || product.price || 0);
    const minPrice = getMinPrice(product.title);

    if (price > 0 && price < minPrice) continue;

    filtered.push(product);
  }

  // Fallback to original products if filtering removed everything
  return filtered.length > 0 ? filtered : products;
}

function getMinPrice(title) {
  const titleLower = title.toLowerCase();

  if (titleLower.includes('phone') || titleLower.includes('mobile') || titleLower.includes('iphone') || titleLower.includes('galaxy')) {
    return 3000;
  }
  if (titleLower.includes('laptop') || titleLower.includes('macbook') || titleLower.includes('notebook')) {
    return 10000;
  }
  if (titleLower.includes('tv') || titleLower.includes('television')) {
    return 3000;
  }
  if (titleLower.includes('skincare') || titleLower.includes('cleanser')) {
    return 30;
  }

  return 10;
}

// Get immersive product links safely (URL parse fix)
async function getImmersiveLinks(products) {
  const links = {};
  if (!SERPAPI_KEY) return links;

  for (const product of products) {
    if (!product || !product.link) continue;

    try {
      // FIX: Use base URL 'https://www.google.com' so relative links like '/shopping/product/123' don't crash
      const urlObj = new URL(product.link, 'https://www.google.com');
      const productId = urlObj.searchParams.get('product_id') || product.link.split('/').pop().split('?')[0];

      if (!productId || productId.length < 3) continue;

      const immersiveUrl = `https://serpapi.com/search.json?engine=google_product&product_id=${productId}&location=India&hl=en&gl=in&api_key=${SERPAPI_KEY}`;

      const response = await fetch(immersiveUrl);
      const data = await response.json();

      if (data.sellers_results && data.sellers_results.online_sellers && data.sellers_results.online_sellers[0]) {
        links[product.link] = data.sellers_results.online_sellers[0].link;
      }
    } catch (error) {
      console.error('Immersive link resolution notice:', error.message);
    }
  }

  return links;
}

// Fallback sample generator if API key is not present or API fails
function getFallbackProducts(query) {
  const isPhone = query.toLowerCase().includes('s25') || query.toLowerCase().includes('iphone') || query.toLowerCase().includes('phone');
  if (isPhone) {
    return [
      { title: `${query} (256GB, 5G)`, price: 74999, extracted_price: 74999, extracted_currency: '₹', source: 'Amazon India', link: 'https://www.amazon.in', condition: 'new' },
      { title: `${query} (256GB, 5G)`, price: 76990, extracted_price: 76990, extracted_currency: '₹', source: 'Flipkart', link: 'https://www.flipkart.com', condition: 'new' },
      { title: `${query} Refurbished - Excellent Condition`, price: 54999, extracted_price: 54999, extracted_currency: '₹', source: 'Cashify', link: 'https://www.cashify.in', condition: 'refurbished' }
    ];
  }
  return [
    { title: `${query} Original`, price: 1299, extracted_price: 1299, extracted_currency: '₹', source: 'Amazon India', link: 'https://www.amazon.in', condition: 'new' },
    { title: `${query} Special Deal`, price: 1499, extracted_price: 1499, extracted_currency: '₹', source: 'Flipkart', link: 'https://www.flipkart.com', condition: 'new' }
  ];
}

// Main search endpoint
app.post('/api/search', async (req, res) => {
  resetDailyCount();

  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const normalizedKey = normalizeQuery(query);

  // 1. Cache-First check
  if (searchCache[normalizedKey] && (Date.now() - searchCache[normalizedKey].timestamp < CACHE_TTL_MS)) {
    console.log(`[Cache Hit] Serving cached results for: "${query}"`);
    logEvent('search_cache_hit', { query, normalizedKey });
    return res.json({
      ...searchCache[normalizedKey].data,
      cached: true,
      searchCount,
      dailyLimit: DAILY_LIMIT
    });
  }

  // Check Daily Limit before external API calls
  if (searchCount >= DAILY_LIMIT && SERPAPI_KEY) {
    return res.status(429).json({
      error: 'Today\'s search limit reached. Please try again tomorrow.',
      limit: DAILY_LIMIT,
      used: searchCount
    });
  }

  try {
    console.log(`[Cache Miss] Processing search for: "${query}"`);

    const correctedQuery = await correctSpelling(query);
    const rawResults = await searchGoogleShopping(correctedQuery);
    const filteredResults = filterExactModels(rawResults, correctedQuery);

    let newProducts = [];
    let usedProducts = [];

    for (const product of filteredResults) {
      const isUsed = product.title.toLowerCase().includes('refurbished') ||
                      product.title.toLowerCase().includes('renewed') ||
                      product.title.toLowerCase().includes('used') ||
                      (product.condition && product.condition.toLowerCase() !== 'new');

      if (isUsed) {
        usedProducts.push(product);
      } else {
        newProducts.push(product);
      }
    }

    const sortByPrice = (a, b) => (parseFloat(a.extracted_price || a.price || 0) - parseFloat(b.extracted_price || b.price || 0));
    newProducts.sort(sortByPrice);
    usedProducts.sort(sortByPrice);

    // Get direct store links safely
    const candidatesForImmersive = [];
    if (newProducts[0]) candidatesForImmersive.push(newProducts[0]);
    if (usedProducts[0]) candidatesForImmersive.push(usedProducts[0]);

    const immersiveLinks = await getImmersiveLinks(candidatesForImmersive);

    const format = (p) => ({
      title: p.title,
      price: p.extracted_price || p.price || 0,
      currency: p.extracted_currency || '₹',
      link: immersiveLinks[p.link] || p.link || '#',
      via: immersiveLinks[p.link] ? null : 'Google',
      source: p.source || 'Online Store',
      thumbnail: p.thumbnail || ''
    });

    if (SERPAPI_KEY) searchCount++;

    const resultsPayload = {
      query: correctedQuery,
      new: newProducts.map(format),
      used: usedProducts.map(format),
      cached: false,
      searchCount,
      dailyLimit: DAILY_LIMIT
    };

    // Save to Cache
    searchCache[normalizedKey] = {
      timestamp: Date.now(),
      data: resultsPayload
    };
    saveCache();

    logEvent('search_success', { query, corrected: correctedQuery, resultCount: filteredResults.length });
    res.json(resultsPayload);

  } catch (error) {
    console.error('Search handler error:', error);
    res.status(500).json({ error: 'Search service encountered an issue. Please try again.' });
  }
});

// Featured products endpoint
app.get('/api/featured', (req, res) => {
  try {
    const pricesPath = path.join(__dirname, 'public', 'prices.json');
    if (fs.existsSync(pricesPath)) {
      const data = JSON.parse(fs.readFileSync(pricesPath, 'utf8'));
      return res.json(data);
    }
  } catch (err) {}
  res.json([
    { title: 'Samsung Galaxy S24 (256GB)', price: '64,999', currency: '₹', thumbnail: 'https://m.media-amazon.com/images/I/71RVuW369lL._SL1500_.jpg' },
    { title: 'Apple iPhone 15 (128GB)', price: '69,900', currency: '₹', thumbnail: 'https://m.media-amazon.com/images/I/71d7rfSl0wL._SL1500_.jpg' },
    { title: 'Sony WH-1000XM5 ANC', price: '26,990', currency: '₹', thumbnail: 'https://m.media-amazon.com/images/I/61+tScB8wBL._SL1500_.jpg' },
    { title: 'Apple MacBook Air M3', price: '1,04,900', currency: '₹', thumbnail: 'https://m.media-amazon.com/images/I/71jG+e7roXL._SL1500_.jpg' }
  ]);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'buywise-api',
    timestamp: new Date().toISOString(),
    searchCount,
    dailyLimit: DAILY_LIMIT,
    cacheCount: Object.keys(searchCache).length,
    hasSerpApiKey: !!SERPAPI_KEY,
    hasGeminiKey: !!GEMINI_API_KEY
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BuyWise India running on http://localhost:${PORT}`);
});