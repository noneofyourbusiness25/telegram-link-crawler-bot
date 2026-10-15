import http from 'http';
import { config } from './config.js';
import { getFeedXml } from './rss.js';
import { storage } from './storage.js';

export function startFeedServer() {
  const port = config.serverPort;

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;

      // Handle CORS & headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Powered-By', 'Telegram-Link-Crawler-Bot');

      // 1. Health check
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
      }

      // 2. Global RSS Feed (/rss, /feed, /rss.xml, /feed.xml)
      if (pathname === '/rss' || pathname === '/feed' || pathname === '/rss.xml' || pathname === '/feed.xml') {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${port}`;
        const baseUrl = `${protocol}://${host}`;

        const xml = getFeedXml(null, baseUrl);
        res.writeHead(200, {
          'Content-Type': 'application/rss+xml; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        return res.end(xml);
      }

      // 3. Watch-specific RSS Feed (/rss/:watchId or /rss/:watchId.xml)
      const watchMatch = pathname.match(/^\/rss\/([^/]+?)(\.xml)?$/);
      if (watchMatch) {
        const watchId = watchMatch[1];
        const watch = storage.getWatchById(watchId);
        if (!watch) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end(`Watch monitor "${watchId}" not found.`);
        }

        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${port}`;
        const baseUrl = `${protocol}://${host}`;

        const xml = getFeedXml(watchId, baseUrl);
        res.writeHead(200, {
          'Content-Type': 'application/rss+xml; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        return res.end(xml);
      }

      // 4. Web overview / landing dashboard
      if (pathname === '/' || pathname === '/status') {
        const watches = storage.getWatches();
        const stats = storage.getStats();

        const watchItemsHtml = watches.map((w) => `
          <li style="margin-bottom: 12px; padding: 10px; background: #f8f9fa; border-radius: 6px;">
            <strong>${escapeHtml(w.name)}</strong> - <code>${w.url}</code><br>
            Interval: <strong>${w.intervalMinutes}m</strong> | Links found: <strong>${w.totalFound || 0}</strong><br>
            <a href="/rss/${w.id}" target="_blank" style="color: #0366d6; text-decoration: none; font-weight: bold;">📡 RSS Feed: /rss/${w.id}</a>
          </li>
        `).join('');

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Telegram Link Crawler - RSS Feeds</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; }
    h1 { color: #24292e; border-bottom: 2px solid #eaecef; padding-bottom: 8px; }
    .badge { background: #28a745; color: white; padding: 4px 8px; border-radius: 12px; font-size: 13px; }
    .card { background: #e7f3ff; border: 1px solid #cce5ff; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
    ul { list-style: none; padding-left: 0; }
  </style>
</head>
<body>
  <h1>🤖 Link Crawler & RSS Server</h1>
  <div class="card">
    <h3>📡 Global RSS Feed</h3>
    <p>Subscribe to all discovered magnet and download links in your torrent client (qBittorrent, Transmission) or RSS reader:</p>
    <p><a href="/rss" style="font-size: 18px; font-weight: bold; color: #0366d6;">👉 View / Subscribe to Global Feed: /rss</a></p>
    <p><span class="badge">Active</span> Total Links Tracked: <strong>${stats.trackedLinksCount}</strong> | Active Monitors: <strong>${stats.activeWatches}</strong></p>
  </div>

  <h2>Monitored Websites</h2>
  ${watches.length > 0 ? `<ul>${watchItemsHtml}</ul>` : '<p>No monitored websites added yet. Use <code>/watch &lt;url&gt; 5</code> in Telegram!</p>'}
</body>
</html>`;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } catch (err) {
      console.error('[HttpServer] Request error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });

  server.listen(port, () => {
    console.log(`[HttpServer] RSS Feed server listening on port ${port} (URL: ${config.feedBaseUrl}/rss)`);
  });

  return server;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
