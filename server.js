import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(rootDir, 'dist');
const port = Number(process.env.PORT || 4173);
const googleEndpoint = 'https://www.google.com.tw/inputtools/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8';

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Request body quá lớn'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function proxyHandwriting(req, res) {
  try {
    const body = await readBody(req);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const upstream = await fetch(googleEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal
    });
    clearTimeout(timeout);
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(await upstream.text());
  } catch (error) {
    sendJson(res, error.name === 'AbortError' ? 504 : 502, {
      error: 'Không thể kết nối máy chủ nhận diện chữ viết tay'
    });
  }
}

function serveStatic(req, res) {
  let requestPath;
  try {
    requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (_) {
    sendJson(res, 400, { error: 'Đường dẫn không hợp lệ' });
    return;
  }
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.slice(1);
  const candidate = path.resolve(distDir, relativePath);
  if (!candidate.startsWith(`${distDir}${path.sep}`)) {
    sendJson(res, 400, { error: 'Đường dẫn không hợp lệ' });
    return;
  }

  const filePath = fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(distDir, 'index.html');
  if (!fs.existsSync(filePath)) {
    sendJson(res, 503, { error: 'Chưa có thư mục dist. Hãy chạy npm run build trước.' });
    return;
  }

  res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && new URL(req.url, 'http://localhost').pathname === '/api/handwriting') {
    proxyHandwriting(req, res);
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res);
    return;
  }
  sendJson(res, 405, { error: 'Method không được hỗ trợ' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`InkToWord server listening on http://localhost:${port}`);
});
