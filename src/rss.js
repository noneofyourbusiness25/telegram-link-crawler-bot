import { storage } from './storage.js';
import { config } from './config.js';

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

/**
 * Builds an RSS 2.0 XML string compatible with standard RSS readers and torrent clients (qBittorrent, etc.)
 */
export function buildRssXml({ title, link, description, selfUrl, items }) {
  const lastBuildDate = new Date().toUTCString();

  const xmlItems = items.map((item) => {
    const itemTitle = item.displayName || item.postTitle || item.hash || 'New Extracted Link';
    const pubDate = item.discoveredAt ? new Date(item.discoveredAt).toUTCString() : lastBuildDate;
    const enclosureType = item.type === 'magnet' ? 'application/x-bittorrent' : 'application/octet-stream';

    const safeUrl = escapeXml(item.url);
    const safeTitle = escapeXml(itemTitle);
    const safeGuid = escapeXml(item.url);

    return `    <item>
      <title>${safeTitle}</title>
      <link>${safeUrl}</link>
      <guid isPermaLink="false">${safeGuid}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[
        <p><strong>Post Title:</strong> <a href="${item.sourceUrl || '#'}">${item.postTitle || 'Original Post'}</a></p>
        <p><strong>Source URL:</strong> <a href="${item.sourceUrl || '#'}">${item.sourceUrl || '#'}</a></p>
        <p><strong>Type:</strong> ${item.type || 'link'}</p>
        ${item.hash ? `<p><strong>Torrent Hash:</strong> <code>${item.hash}</code></p>` : ''}
        <p><strong>Target Link:</strong> <a href="${item.url}">${item.url}</a></p>
      ]]></description>
      <enclosure url="${safeUrl}" length="0" type="${enclosureType}" />
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    ${selfUrl ? `<atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml" />` : ''}
${xmlItems}
  </channel>
</rss>`;
}

/**
 * Generates an RSS XML feed for a specific watch or global feed
 */
export function getFeedXml(watchId = null, hostBaseUrl = null) {
  const baseUrl = hostBaseUrl || config.feedBaseUrl;
  const items = storage.getDiscoveredLinks(watchId, 100);

  if (watchId) {
    const watch = storage.getWatchById(watchId);
    const feedTitle = watch ? `${watch.name} - Extracted Links Feed` : `Monitor [${watchId}] Feed`;
    const feedLink = watch ? watch.url : baseUrl;
    const feedDesc = watch
      ? `Live RSS feed of newly detected magnet & download links crawled from ${watch.url}`
      : 'Live RSS feed of newly detected links';

    return buildRssXml({
      title: feedTitle,
      link: feedLink,
      description: feedDesc,
      selfUrl: `${baseUrl}/rss/${watchId}`,
      items,
    });
  }

  // Global feed
  return buildRssXml({
    title: 'Telegram Link Crawler - Global RSS Feed',
    link: baseUrl,
    description: 'Live RSS feed of all magnet, torrent, and download links discovered by Telegram Crawler Bot',
    selfUrl: `${baseUrl}/rss`,
    items,
  });
}
