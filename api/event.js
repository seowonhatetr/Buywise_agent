// POST /api/event { sid, type, data } -> logs anonymous usage (Vercel logs + optional Google Sheet webhook)
const TYPES = ['query', 'shortlist', 'rating', 'clickout'];
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  let b = {}; try { b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) {}
  if (!TYPES.includes(b.type)) return res.status(400).end();
  const rec = { t: new Date().toISOString(), sid: String(b.sid || '').slice(0, 40), type: b.type, data: JSON.stringify(b.data || {}).slice(0, 600) };
  console.log('EVENT', JSON.stringify(rec));
  if (process.env.EVENT_WEBHOOK_URL) { try { await fetch(process.env.EVENT_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(rec) }); } catch (e) {} }
  res.status(204).end();
};
