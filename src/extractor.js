import * as cheerio from 'cheerio';

export const MAGNET_REGEX = /magnet:\?[^\s"'<>\)]+/gi;
export const TORRENT_EXT_REGEX = /\.torrent(\?.*)?$/i;
export const ARCHIVE_EXT_REGEX = /\.(zip|tar\.gz|tgz|rar|7z|iso|bin)(\?.*)?$/i;

/**
 * Parses details from a magnet URI
 */
export function parseMagnetUri(magnetUrl) {
  try {
    const parsed = new URL(magnetUrl);
    const params = parsed.searchParams;

    const xt = params.get('xt') || '';
    let hash = '';
    const hashMatch = xt.match(/urn:btih:([a-zA-Z0-9]+)/i);
    if (hashMatch) {
      hash = hashMatch[1];
    }

    const dn = params.get('dn');
    const displayName = dn ? decodeURIComponent(dn.replace(/\+/g, ' ')) : null;
    const trackers = params.getAll('tr');

    return {
      type: 'magnet',
      url: magnetUrl,
      hash,
      displayName: displayName || (hash ? `Magnet [${hash.slice(0, 8)}]` : 'Magnet Link'),
      trackers,
    };
  } catch {
    return {
      type: 'magnet',
      url: magnetUrl,
      hash: '',
      displayName: 'Magnet Link',
      trackers: [],
    };
  }
}

/**
 * Resolves a potentially relative URL against a base URL
 */
function resolveUrl(relativeOrAbsolute, baseUrl) {
  try {
    return new URL(relativeOrAbsolute, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Extracts links from HTML content based on filter type and patterns
 */
export function extractLinks(html, baseUrl, filterType = 'magnet', customPattern = null) {
  if (!html || typeof html !== 'string') return [];

  const $ = cheerio.load(html);
  const found = new Map(); // key = normalized URL, value = link object

  // 1. Scan for Magnet Links via Regex (finds magnet links even if in text, pre, code, or javascript)
  if (filterType === 'magnet' || filterType === 'all' || !filterType) {
    const rawMatches = html.match(MAGNET_REGEX) || [];
    for (const raw of rawMatches) {
      // Clean trailing punctuation that might get captured if embedded in prose
      const cleaned = raw.replace(/[.,;!?]+$/, '');
      if (cleaned.startsWith('magnet:?')) {
        const parsed = parseMagnetUri(cleaned);
        found.set(cleaned, parsed);
      }
    }
  }

  // 2. Scan DOM Anchor and Data Attributes
  $('a, [data-href], [data-url], [data-magnet]').each((_, el) => {
    const elem = $(el);
    const href =
      elem.attr('href') ||
      elem.attr('data-magnet') ||
      elem.attr('data-href') ||
      elem.attr('data-url');

    if (!href) return;

    const trimmedHref = href.trim();
    const linkText = elem.text().trim();

    // Check Magnet Link in href
    if (trimmedHref.toLowerCase().startsWith('magnet:?')) {
      if (filterType === 'magnet' || filterType === 'all' || !filterType) {
        const parsed = parseMagnetUri(trimmedHref);
        if (linkText && !parsed.displayName.startsWith('Magnet [')) {
          parsed.displayName = linkText;
        }
        found.set(trimmedHref, parsed);
      }
      return;
    }

    // Check Torrent File Link
    if (TORRENT_EXT_REGEX.test(trimmedHref)) {
      if (filterType === 'torrent' || filterType === 'all') {
        const fullUrl = resolveUrl(trimmedHref, baseUrl);
        if (fullUrl) {
          found.set(fullUrl, {
            type: 'torrent',
            url: fullUrl,
            displayName: linkText || fullUrl.split('/').pop() || 'Torrent File',
          });
        }
      }
      return;
    }

    // Check Common Archives & Media ISOs (if filterType is 'all')
    if (filterType === 'all' && ARCHIVE_EXT_REGEX.test(trimmedHref)) {
      const fullUrl = resolveUrl(trimmedHref, baseUrl);
      if (fullUrl) {
        found.set(fullUrl, {
          type: 'download',
          url: fullUrl,
          displayName: linkText || fullUrl.split('/').pop() || 'Download Link',
        });
      }
      return;
    }

    // Check Custom User Pattern
    if (customPattern) {
      try {
        const regex = new RegExp(customPattern, 'i');
        if (regex.test(trimmedHref) || regex.test(linkText)) {
          const fullUrl = resolveUrl(trimmedHref, baseUrl) || trimmedHref;
          found.set(fullUrl, {
            type: 'custom',
            url: fullUrl,
            displayName: linkText || fullUrl,
          });
        }
      } catch (err) {
        console.error('[Extractor] Invalid custom regex:', err.message);
      }
    }
  });

  return Array.from(found.values());
}

/**
 * Extracts page title and metadata
 */
export function extractPageMeta(html, pageUrl) {
  if (!html) return { title: pageUrl };
  const $ = cheerio.load(html);

  const ogTitle = $('meta[property="og:title"]').attr('content');
  const twitterTitle = $('meta[name="twitter:title"]').attr('content');
  const h1 = $('h1').first().text().trim();
  const docTitle = $('title').first().text().trim();

  const title = ogTitle || twitterTitle || h1 || docTitle || pageUrl;
  return {
    title: title.replace(/\s+/g, ' ').trim(),
  };
}
