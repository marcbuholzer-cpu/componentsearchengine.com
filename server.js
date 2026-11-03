'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = Number(process.env.PORT) || 3030;
const UPSTREAM = new URL(process.env.UPSTREAM || 'https://componentsearchengine.com');
const START_PATH = process.env.START_PATH || '/search?term=schurter';
const EXPORT_PREFIX = '/__export/';

const upstreamClient = UPSTREAM.protocol === 'https:' ? https : http;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Matches absolute upstream URLs, also protocol-relative, www-prefixed and JSON-escaped (https:\/\/host).
const hostRe = escRe(UPSTREAM.host.replace(/^www\./, ''));
const ABS_URL_RE = new RegExp(`(?:https?:)?\\\\?/\\\\?/(?:www\\.)?${hostRe}`, 'gi');

const REWRITE_TYPES = /text\/html|text\/css|javascript|application\/json/i;
const HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'accept-encoding',
]);
const DROP_RESPONSE_HEADERS = new Set([
  'content-security-policy', 'content-security-policy-report-only',
  'x-frame-options', 'strict-transport-security', 'content-length',
  'content-encoding', 'transfer-encoding', 'connection', 'keep-alive', 'alt-svc',
]);

const INJECT_TAG =
  `<script src="${EXPORT_PREFIX}inject.js" data-upstream="${UPSTREAM.origin}" defer></script>`;

function serveStatic(req, res) {
  const name = path.basename(new URL(req.url, 'http://x').pathname);
  const file = path.join(__dirname, 'public', name);
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-cache',
    });
    res.end(data);
  });
}

function rewriteLocation(loc, proxyOrigin) {
  try {
    const u = new URL(loc, UPSTREAM);
    if (u.host.replace(/^www\./, '') === UPSTREAM.host.replace(/^www\./, '')) {
      return proxyOrigin + u.pathname + u.search + u.hash;
    }
  } catch (_) { /* leave unchanged */ }
  return loc;
}

function rewriteCookie(c, secureClient) {
  let out = c.replace(/;\s*domain=[^;]*/gi, '');
  if (!secureClient) out = out.replace(/;\s*secure/gi, '').replace(/;\s*samesite=none/gi, '; SameSite=Lax');
  return out;
}

function decompress(buf, encoding) {
  switch ((encoding || '').toLowerCase()) {
    case 'gzip': case 'x-gzip': return zlib.gunzipSync(buf);
    case 'deflate': return zlib.inflateSync(buf);
    case 'br': return zlib.brotliDecompressSync(buf);
    default: return buf;
  }
}

function injectScript(html) {
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${INJECT_TAG}</body>`);
  return html + INJECT_TAG;
}

function proxy(req, res) {
  const secureClient = req.headers['x-forwarded-proto'] === 'https';
  const proxyOrigin = `${secureClient ? 'https' : 'http'}://${req.headers.host}`;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_HEADERS.has(k) && !k.startsWith('x-forwarded-')) headers[k] = v;
  }
  headers.host = UPSTREAM.host;
  headers['accept-encoding'] = 'gzip, deflate, br';
  for (const h of ['origin', 'referer']) {
    if (headers[h]) headers[h] = headers[h].split(proxyOrigin).join(UPSTREAM.origin);
  }

  const upReq = upstreamClient.request(
    {
      protocol: UPSTREAM.protocol,
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port || undefined,
      method: req.method,
      path: req.url,
      headers,
    },
    (upRes) => {
      const outHeaders = {};
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (DROP_RESPONSE_HEADERS.has(k)) continue;
        if (k === 'location') outHeaders[k] = rewriteLocation(v, proxyOrigin);
        else if (k === 'set-cookie') outHeaders[k] = v.map((c) => rewriteCookie(c, secureClient));
        else outHeaders[k] = v;
      }

      const type = upRes.headers['content-type'] || '';
      if (!REWRITE_TYPES.test(type)) {
        // Binary or untouched content: stream through, keep original encoding.
        if (upRes.headers['content-encoding']) outHeaders['content-encoding'] = upRes.headers['content-encoding'];
        if (upRes.headers['content-length']) outHeaders['content-length'] = upRes.headers['content-length'];
        res.writeHead(upRes.statusCode, outHeaders);
        upRes.pipe(res);
        return;
      }

      const chunks = [];
      upRes.on('data', (c) => chunks.push(c));
      upRes.on('error', (e) => fail(res, e));
      upRes.on('end', () => {
        let body;
        try {
          body = decompress(Buffer.concat(chunks), upRes.headers['content-encoding']).toString('utf8');
        } catch (e) {
          fail(res, e);
          return;
        }
        body = body.replace(ABS_URL_RE, '');
        if (/text\/html/i.test(type)) body = injectScript(body);
        const buf = Buffer.from(body, 'utf8');
        outHeaders['content-length'] = buf.length;
        res.writeHead(upRes.statusCode, outHeaders);
        res.end(buf);
      });
    },
  );
  upReq.on('error', (e) => fail(res, e));
  req.pipe(upReq);
}

function fail(res, err) {
  console.error('[proxy]', err.message);
  if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`Bad gateway: ${err.message}`);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith(EXPORT_PREFIX)) return serveStatic(req, res);
  if (req.method === 'GET' && req.url === '/__start') {
    res.writeHead(302, { location: START_PATH }).end();
    return;
  }
  proxy(req, res);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Proxy for ${UPSTREAM.origin} on http://localhost:${PORT}${START_PATH}`);
  });
}

module.exports = { server, ABS_URL_RE, rewriteCookie, rewriteLocation };
