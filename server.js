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

// In-memory search tracking
let searchCount = 0;
let lastResetDate = new Date().toDateString();

// Reset daily search count
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
        sid: 'local-session', // In a real app, use a session ID
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
    if (data.candidates && data.candidates[0]) {
      return data.candidates[0].content.parts[0].text.trim();
    }
  } catch (error) {
    console.error('Gemini API error:', error);
  }
  return query;
}

// SerpApi integration
async function searchGoogleShopping(query) {
  if (!SERPAPI_KEY) throw new Error('SerpApi key is required');

  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&tbm=shop&location=India&hl=en&gl=in&api_key=${SERPAPI_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  return data.shopping_results || [];
}

// Filter exact models
function filterExactModels(products, originalQuery) {
  const query = originalQuery.toLowerCase();
  const filtered = [];

  for (const product of products) {
    const title = product.title.toLowerCase();

    // Exclude accessories
    const accessories = ['case', 'cover', 'screen protector', 'tempered glass', 'skin', 'sticker', 'charger', 'cable', 'adapter'];
    if (accessories.some(acc => title.includes(acc) && !query.includes(acc))) continue;

    // Exclude variants (FE, Plus, Pro, Max, Ultra, Edge, Lite, Mini, e/r/s suffixes)
    // Only if they weren't in the original query
    const variants = ['fe', 'plus', 'pro', 'max', 'ultra', 'edge', 'lite', 'mini', 's25+', 's24+', 's23+'];
    let hasExcludedVariant = false;
    for (const v of variants) {
      if (title.includes(v) && !query.includes(v)) {
        hasExcludedVariant = true;
        break;
      }
    }

    // Check for specific letter suffixes like 16e, 13R
    const suffixMatch = title.match(/\b\d+(e|r|s|t)\b/i);
    if (suffixMatch && !query.includes(suffixMatch[0].toLowerCase())) {
        hasExcludedVariant = true;
    }

    if (hasExcludedVariant) continue;

    // Check for suspiciously low prices
    const price = parseFloat(product.extracted_price || product.price);
    const minPrice = getMinPrice(product.title);

    if (price < minPrice) continue;

    filtered.push(product);
  }

  return filtered;
}

// Get minimum price based on product type
function getMinPrice(title) {
  const titleLower = title.toLowerCase();

  if (titleLower.includes('phone') || titleLower.includes('mobile') || titleLower.includes('iphone') || titleLower.includes('galaxy s')) {
    return 4000; // ₹4000 minimum for phones
  }

  if (titleLower.includes('laptop') || titleLower.includes('macbook') || titleLower.includes('notebook')) {
    return 12000; // ₹12000 minimum for laptops
  }

  if (titleLower.includes('tv') || titleLower.includes('television')) {
    return 4000; // ₹4000 minimum for TVs
  }

  if (titleLower.includes('skincare') || titleLower.includes('face') || titleLower.includes('cleanser')) {
    return 30; // ₹30 minimum for skincare
  }

  return 10; // Default low minimum
}

// Get immersive product links
async function getImmersiveLinks(products) {
  const links = {};

  // README: Only find direct link for the cheapest new product and cheapest used product
  for (const product of products) {
    if (!product.link) continue;

    try {
      // SerpApi uses 'product_id' or extraction from link
      const urlObj = new URL(product.link);
      const productId = urlObj.searchParams.get('product_id') || product.link.split('/').pop().split('?')[0];

      const immersiveUrl = `https://serpapi.com/search.json?engine=google_product&product_id=${productId}&location=India&hl=en&gl=in&api_key=${SERPAPI_KEY}`;

      const response = await fetch(immersiveUrl);
      const data = await response.json();

      if (data.sellers_results && data.sellers_results.online_sellers && data.sellers_results.online_sellers[0]) {
        links[product.link] = data.sellers_results.online_sellers[0].link;
      }
    } catch (error) {
      console.error('Error getting immersive link:', error);
    }
  }

  return links;
}

// Main search endpoint
app.post('/api/search', async (req, res) => {
  resetDailyCount();

  if (searchCount >= DAILY_LIMIT) {
    return res.status(429).json({
      error: 'Today\'s search limit reached. Please try again tomorrow.',
      limit: DAILY_LIMIT,
      used: searchCount
    });
  }

  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    // Correct spelling
    const correctedQuery = await correctSpelling(query);

    // Search Google Shopping
    const rawResults = await searchGoogleShopping(correctedQuery);

    // Filter exact models
    const filteredResults = filterExactModels(rawResults, correctedQuery);

    // Separate new and used/refurbished
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

    // Sort by price
    const sortByPrice = (a, b) => (parseFloat(a.extracted_price || a.price) - parseFloat(b.extracted_price || b.price));
    newProducts.sort(sortByPrice);
    usedProducts.sort(sortByPrice);

    // Filter out items that are too cheap (less than 40% of max price for new products)
    if (newProducts.length > 0) {
        const maxPrice = Math.max(...newProducts.map(p => parseFloat(p.extracted_price || p.price)));
        newProducts = newProducts.filter(p => parseFloat(p.extracted_price || p.price) >= maxPrice * 0.4);
    }

    // Get immersive links for cheapest products (1 new, 1 used as per README)
    const candidatesForImmersive = [];
    if (newProducts[0]) candidatesForImmersive.push(newProducts[0]);
    if (usedProducts[0]) candidatesForImmersive.push(usedProducts[0]);

    const immersiveLinks = await getImmersiveLinks(candidatesForImmersive);

    // Format results
    const format = (p) => ({
      title: p.title,
      price: p.extracted_price || p.price,
      currency: p.extracted_currency || '₹',
      link: immersiveLinks[p.link] || p.link,
      via: immersiveLinks[p.link] ? null : 'Google',
      source: p.source || 'Shop',
      thumbnail: p.thumbnail
    });

    const results = {
      query: correctedQuery,
      new: newProducts.map(format),
      used: usedProducts.map(format),
      searchCount: ++searchCount,
      dailyLimit: DAILY_LIMIT
    };

    logEvent('search', { query, corrected: correctedQuery, resultCount: filteredResults.length });
    res.json(results);

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed. Please try again.' });
  }
});

// Featured products endpoint
app.get('/api/featured', (req, res) => {
  try {
    const pricesPath = path.join(__dirname, 'public', 'prices.json');
    if (fs.existsSync(pricesPath)) {
      const data = JSON.parse(fs.readFileSync(pricesPath, 'utf8'));
      res.json(data);
    } else {
      res.json([]);
    }
  } catch (err) {
    res.json([]);
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'buywise-api',
    timestamp: new Date().toISOString(),
    searchCount,
    dailyLimit: DAILY_LIMIT
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BuyWise India running on http://localhost:${PORT}`);
});