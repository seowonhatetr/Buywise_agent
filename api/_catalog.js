// Server-side catalogue: only these products can be priced, so the paid price API cannot be abused with arbitrary queries.
// must = every token must appear in the listing title; not = none may appear.
module.exports = {
  1: { q: 'OnePlus 13R 5G', must: ['oneplus', '13r'], not: [], kind: 'phone' },
  2: { q: 'POCO F7 5G', must: ['poco', 'f7'], not: ['pro', 'ultra'], kind: 'phone' },
  3: { q: 'Samsung Galaxy A56 5G', must: ['samsung', 'a56'], not: [], kind: 'phone' },
  4: { q: 'Nothing Phone (3a)', must: ['nothing', '3a'], not: ['lite', 'pro'], kind: 'phone' },
  5: { q: 'Redmi Note 14 Pro+ 5G', must: ['redmi', '14 pro+'], not: [], kind: 'phone' },
  7: { q: 'Minimalist 10% Niacinamide face serum 30ml', must: ['minimalist', 'niacinamide'], not: [], kind: 'beauty' },
  8: { q: 'Cetaphil Gentle Skin Cleanser 125ml', must: ['cetaphil', 'cleanser'], not: [], kind: 'beauty' },
  9: { q: 'Neutrogena Ultra Sheer Dry-Touch Sunscreen SPF 50+ 88ml', must: ['neutrogena', 'ultra sheer'], not: [], kind: 'beauty' },
  10: { q: 'Cetaphil Moisturising Cream 80g', must: ['cetaphil', 'moisturising'], not: [], kind: 'beauty' },
  11: { q: 'Dot & Key Watermelon Cooling Sunscreen SPF 50', must: ['dot', 'key', 'sunscreen'], not: [], kind: 'beauty' },
  12: { q: 'Simple Kind to Skin Refreshing Facial Wash', must: ['simple', 'facial wash'], not: [], kind: 'beauty' }
};
