import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';

class Storage {
  constructor() {
    this.filePath = config.dbFile;
    this.data = {
      watches: [],
      seenLinks: {},
      seenPosts: {},
      stats: {
        totalCrawls: 0,
        totalLinksDiscovered: 0,
      },
    };
    this.isLoaded = false;
    this.savePromise = null;
  }

  async init() {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.data = {
        watches: parsed.watches || [],
        seenLinks: parsed.seenLinks || {},
        seenPosts: parsed.seenPosts || {},
        stats: parsed.stats || { totalCrawls: 0, totalLinksDiscovered: 0 },
      };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('[Storage] Error reading database file:', err.message);
      }
      // If file doesn't exist, create it with initial structure
      await this.save();
    }
    this.isLoaded = true;
  }

  async save() {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      const serialized = JSON.stringify(this.data, null, 2);
      await fs.writeFile(tempPath, serialized, 'utf-8');
      await fs.rename(tempPath, this.filePath);
    } catch (err) {
      console.error('[Storage] Failed to save database:', err.message);
    }
  }

  // --- Watch Management ---

  getWatches(chatId = null) {
    if (chatId !== null) {
      return this.data.watches.filter((w) => String(w.chatId) === String(chatId));
    }
    return this.data.watches;
  }

  getWatchById(id) {
    return this.data.watches.find((w) => w.id === id);
  }

  async addWatch(watch) {
    const newWatch = {
      id: `w_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      chatId: String(watch.chatId),
      url: watch.url,
      name: watch.name || new URL(watch.url).hostname,
      intervalMinutes: parseInt(watch.intervalMinutes || config.defaultCheckInterval, 10),
      filterType: watch.filterType || 'magnet', // 'magnet', 'torrent', 'all', 'custom'
      customPattern: watch.customPattern || null,
      maxPosts: parseInt(watch.maxPosts || config.maxPostsPerCrawl, 10),
      createdAt: new Date().toISOString(),
      lastCheck: null,
      enabled: true,
      totalFound: 0,
    };

    this.data.watches.push(newWatch);
    await this.save();
    return newWatch;
  }

  async removeWatch(id, chatId = null) {
    const initialLength = this.data.watches.length;
    this.data.watches = this.data.watches.filter((w) => {
      if (w.id === id) {
        if (chatId !== null && String(w.chatId) !== String(chatId)) {
          return true; // Not authorized to delete
        }
        return false;
      }
      return true;
    });

    const removed = this.data.watches.length < initialLength;
    if (removed) {
      await this.save();
    }
    return removed;
  }

  async updateWatch(id, updates) {
    const watch = this.getWatchById(id);
    if (!watch) return null;

    Object.assign(watch, updates);
    await this.save();
    return watch;
  }

  // --- Link & Post Deduplication ---

  isLinkSeen(linkUrl) {
    return Boolean(this.data.seenLinks[linkUrl]);
  }

  async markLinkSeen(linkUrl, metadata = {}) {
    if (this.data.seenLinks[linkUrl]) return false;

    this.data.seenLinks[linkUrl] = {
      discoveredAt: new Date().toISOString(),
      ...metadata,
    };
    this.data.stats.totalLinksDiscovered = (this.data.stats.totalLinksDiscovered || 0) + 1;
    await this.save();
    return true;
  }

  isPostSeen(postUrl) {
    return Boolean(this.data.seenPosts[postUrl]);
  }

  async markPostSeen(postUrl, metadata = {}) {
    if (this.data.seenPosts[postUrl]) return false;

    this.data.seenPosts[postUrl] = {
      firstSeenAt: new Date().toISOString(),
      ...metadata,
    };
    await this.save();
    return true;
  }

  async incrementCrawlCount() {
    this.data.stats.totalCrawls = (this.data.stats.totalCrawls || 0) + 1;
    await this.save();
  }

  async clearSiteCache(urlOrHost) {
    let removedLinks = 0;
    let targetHost = urlOrHost;
    try {
      targetHost = new URL(urlOrHost).hostname;
    } catch {
      // urlOrHost might be hostname directly
    }

    for (const [link, meta] of Object.entries(this.data.seenLinks)) {
      if (meta.sourceUrl && meta.sourceUrl.includes(targetHost)) {
        delete this.data.seenLinks[link];
        removedLinks++;
      }
    }

    for (const [postUrl] of Object.entries(this.data.seenPosts)) {
      if (postUrl.includes(targetHost)) {
        delete this.data.seenPosts[postUrl];
      }
    }

    await this.save();
    return removedLinks;
  }

  getStats(chatId = null) {
    const userWatches = this.getWatches(chatId);
    return {
      activeWatches: userWatches.filter((w) => w.enabled).length,
      totalWatches: userWatches.length,
      totalLinksDiscovered: this.data.stats.totalLinksDiscovered || 0,
      totalCrawls: this.data.stats.totalCrawls || 0,
      trackedLinksCount: Object.keys(this.data.seenLinks).length,
      trackedPostsCount: Object.keys(this.data.seenPosts).length,
    };
  }
}

export const storage = new Storage();
