// Tiny Node server for Render (or any Node host): serves public/ and runs the same /api handlers used on Vercel.
const http = require('http'), fs = require('fs'), path = require('path');
const handlers = { '/api/search': require('./api/search.js'), '/api/event': require('./api/event.js') };
const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const PUB = path.join(__dirname, 'public');
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (handlers[url.pathname]) {
    let body = ''; for await (const c of req) { body += c; if (body.length > 20000) { res.statusCode = 413; return res.end(); } }
    try { req.body = body ? JSON.parse(body) : {}; } catch (e) { req.body = {}; }
    res.status = c => { res.statusCode = c; return res; };
    res.json = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    try { await handlers[url.pathname](req, res); } catch (e) { console.error(e); if (!res.writableEnded) { res.statusCode = 500; res.end('error'); } }
    return;
  }
  const f = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream');
  if (f.endsWith('prices.json')) res.setHeader('cache-control', 'no-cache');
  fs.createReadStream(f).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('BuyWise running on port ' + (process.env.PORT || 3000)));
