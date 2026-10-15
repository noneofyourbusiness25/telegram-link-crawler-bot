import * as cheerio from 'cheerio';
import { config } from './config.js';
import { extractLinks, extractPageMeta } from './extractor.js';

const EXCLUDED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
  '.css', '.js', '.mjs', '.json', '.xml',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp3', '.wav', '.ogg',
  '.pdf',
]);

const EXCLUDED_PATH_KEYWORDS = [
  '/login', '/signin', '/logout', '/register', '/signup',
  '/cart', '/checkout', '/account', '/profile',
  '/privacy', '/terms', '/disclaimer', '/copyright',
  '/contact', '/about-us', '/about', '/donate',
  '/search', '/search?', '/wp-login.php',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Robust fetch with timeout, custom User-Agent, and redirect handling
 */
export async function fetchHtml(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': config.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
      return null;
    }

    return await res.text();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Extracts candidate post/article links from a website's landing page
 */
export function discoverPostUrls(html, baseUrl) {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const discovered = new Set();

  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    const trimmed = href.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('javascript:') || trimmed.startsWith('mailto:')) {
      return;
    }

    try {
      const resolved = new URL(trimmed, baseUrl);

      // Must belong to same hostname
      if (resolved.hostname !== base.hostname) {
        return;
      }

      // Check excluded file extensions
      const pathname = resolved.pathname.toLowerCase();
      const dotIndex = pathname.lastIndexOf('.');
      if (dotIndex !== -1) {
        const ext = pathname.slice(dotIndex);
        if (EXCLUDED_EXTENSIONS.has(ext)) {
          return;
        }
      }

      // Check excluded navigational keywords
      const isExcluded = EXCLUDED_PATH_KEYWORDS.some((kw) => pathname.includes(kw));
      if (isExcluded) {
        return;
      }

      // Skip exact landing page URL
      if (resolved.href === base.href || resolved.pathname === base.pathname && !resolved.search) {
        return;
      }

      // Clean hash/fragments
      resolved.hash = '';

      discovered.add(resolved.href);
    } catch {
      // Ignore invalid URL formatting
    }
  });

  return Array.from(discovered);
}

/**
 * Crawls a website:
 * 1. Checks landing page for direct links
 * 2. Discovers sub-posts/articles
 * 3. Visits each post and extracts target links (magnet, torrent, custom)
 */
export async function crawlWebsite(targetUrl, options = {}) {
  const {
    filterType = 'magnet',
    customPattern = null,
    maxPosts = config.maxPostsPerCrawl,
    delayMs = config.requestDelayMs,
    onProgress = null,
  } = options;

  const startTime = Date.now();
  const results = [];
  const visitedUrls = new Set();

  // Normalize target URL
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
  } catch (err) {
    throw new Error(`Invalid URL: ${targetUrl} (${err.message})`);
  }

  const startUrl = parsedUrl.href;
  visitedUrls.add(startUrl);

  if (onProgress) {
    onProgress({ stage: 'fetching_index', url: startUrl });
  }

  // 1. Fetch main landing page
  const indexHtml = await fetchHtml(startUrl);
  if (!indexHtml) {
    return {
      startUrl,
      scannedPostsCount: 0,
      durationMs: Date.now() - startTime,
      items: [],
      error: 'No HTML content returned from index page',
    };
  }

  // Check if landing page itself has target links directly
  const indexLinks = extractLinks(indexHtml, startUrl, filterType, customPattern);
  if (indexLinks.length > 0) {
    const meta = extractPageMeta(indexHtml, startUrl);
    results.push({
      postTitle: meta.title || 'Main Page',
      postUrl: startUrl,
      links: indexLinks,
      isIndex: true,
    });
  }

  // 2. Discover post links
  const postUrls = discoverPostUrls(indexHtml, startUrl);
  const postsToScan = postUrls.slice(0, maxPosts);

  if (onProgress) {
    onProgress({
      stage: 'posts_discovered',
      totalDiscovered: postUrls.length,
      willScan: postsToScan.length,
    });
  }

  // 3. Scan each post
  let scannedCount = 0;
  for (const postUrl of postsToScan) {
    if (visitedUrls.has(postUrl)) continue;
    visitedUrls.add(postUrl);

    try {
      if (delayMs > 0 && scannedCount > 0) {
        await sleep(delayMs);
      }

      scannedCount++;
      if (onProgress) {
        onProgress({
          stage: 'scanning_post',
          current: scannedCount,
          total: postsToScan.length,
          url: postUrl,
        });
      }

      const postHtml = await fetchHtml(postUrl);
      if (!postHtml) continue;

      const links = extractLinks(postHtml, postUrl, filterType, customPattern);
      if (links.length > 0) {
        const meta = extractPageMeta(postHtml, postUrl);
        results.push({
          postTitle: meta.title || postUrl,
          postUrl,
          links,
          isIndex: false,
        });
      }
    } catch (err) {
      console.warn(`[Crawler] Failed to scan post ${postUrl}:`, err.message);
    }
  }

  return {
    startUrl,
    scannedPostsCount: scannedCount,
    durationMs: Date.now() - startTime,
    items: results,
  };
}
