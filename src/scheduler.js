import { storage } from './storage.js';
import { crawlWebsite } from './crawler.js';

class Scheduler {
  constructor() {
    this.bot = null;
    this.intervalHandle = null;
    this.isRunning = false;
    this.isChecking = false;
  }

  setBot(botInstance) {
    this.bot = botInstance;
  }

  start(intervalMs = 60 * 1000) {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[Scheduler] Background monitor started (checking every minute)...');

    // Run first check after a brief startup delay (10s)
    setTimeout(() => this.checkAllWatches(), 10000);

    // Periodically evaluate watches
    this.intervalHandle = setInterval(() => {
      this.checkAllWatches();
    }, intervalMs);
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    console.log('[Scheduler] Background monitor stopped.');
  }

  async checkAllWatches() {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const watches = storage.getWatches().filter((w) => w.enabled);
      const now = Date.now();

      for (const watch of watches) {
        const intervalMs = (watch.intervalMinutes || 30) * 60 * 1000;
        const lastCheckTime = watch.lastCheck ? new Date(watch.lastCheck).getTime() : 0;

        if (now - lastCheckTime >= intervalMs) {
          await this.runWatch(watch);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error in checkAllWatches cycle:', err.message);
    } finally {
      this.isChecking = false;
    }
  }

  async runWatch(watch) {
    console.log(`[Scheduler] Checking watch [${watch.id}] ${watch.url}...`);
    try {
      const crawlResult = await crawlWebsite(watch.url, {
        filterType: watch.filterType,
        customPattern: watch.customPattern,
        maxPosts: watch.maxPosts,
      });

      await storage.incrementCrawlCount();

      const newLinksByPost = [];

      for (const item of crawlResult.items) {
        const unseenLinks = [];
        for (const link of item.links) {
          const alreadySeen = storage.isLinkSeen(link.url);
          if (!alreadySeen) {
            await storage.markLinkSeen(link.url, {
              sourceUrl: item.postUrl,
              postTitle: item.postTitle,
              watchId: watch.id,
              type: link.type,
              displayName: link.displayName,
            });
            unseenLinks.push(link);
          }
        }

        if (unseenLinks.length > 0) {
          newLinksByPost.push({
            postTitle: item.postTitle,
            postUrl: item.postUrl,
            links: unseenLinks,
          });
        }
      }

      const totalNewDiscovered = newLinksByPost.reduce((acc, curr) => acc + curr.links.length, 0);

      // Update watch metadata
      await storage.updateWatch(watch.id, {
        lastCheck: new Date().toISOString(),
        totalFound: (watch.totalFound || 0) + totalNewDiscovered,
      });

      // Dispatch notifications to Telegram chat
      if (totalNewDiscovered > 0 && this.bot) {
        await this.notifyChat(watch, newLinksByPost);
      }
    } catch (err) {
      console.error(`[Scheduler] Error running watch [${watch.id}]:`, err.message);
    }
  }

  async notifyChat(watch, newItems) {
    if (!this.bot || !watch.chatId) return;

    for (const item of newItems) {
      for (const link of item.links) {
        let msg = '';
        if (link.type === 'magnet') {
          msg =
            `🧲 *New Magnet Link Found!*\n\n` +
            `🌐 *Website:* [${escapeMarkdown(watch.name)}](${watch.url})\n` +
            `📄 *Post:* [${escapeMarkdown(item.postTitle)}](${item.postUrl})\n` +
            (link.displayName ? `🏷 *Name:* \`${escapeMarkdown(link.displayName)}\`\n` : '') +
            (link.hash ? `🔑 *Hash:* \`${link.hash}\`\n` : '') +
            `\n🔗 *Magnet Link:*\n\`${link.url}\``;
        } else {
          msg =
            `📥 *New Link Discovered!*\n\n` +
            `🌐 *Website:* [${escapeMarkdown(watch.name)}](${watch.url})\n` +
            `📄 *Post:* [${escapeMarkdown(item.postTitle)}](${item.postUrl})\n` +
            `🏷 *Type:* ${link.type.toUpperCase()}\n` +
            `🔗 *URL:* [Download](${link.url})`;
        }

        try {
          await this.bot.api.sendMessage(watch.chatId, msg, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          });
        } catch (err) {
          console.error(`[Scheduler] Failed to send message to chat ${watch.chatId}:`, err.message);
        }
      }
    }
  }
}

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

export const scheduler = new Scheduler();
