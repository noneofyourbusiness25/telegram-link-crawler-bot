import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { config, isUserAllowed } from './config.js';
import { storage } from './storage.js';
import { crawlWebsite } from './crawler.js';
import { scheduler } from './scheduler.js';
import { startFeedServer } from './server.js';
import { getFeedXml } from './rss.js';

if (!config.botToken) {
  console.error('ERROR: BOT_TOKEN is missing in .env! Please configure your Telegram bot token.');
  process.exit(1);
}

const bot = new Bot(config.botToken);

function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Splits long text into chunks <= 4000 chars without breaking Markdown lines
 */
async function sendChunkedMessage(ctx, fullText, options = {}) {
  const MAX_CHUNK = 3800;
  if (fullText.length <= MAX_CHUNK) {
    return ctx.reply(fullText, { parse_mode: 'Markdown', disable_web_page_preview: true, ...options });
  }

  const lines = fullText.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if ((currentChunk + '\n' + line).length > MAX_CHUNK) {
      if (currentChunk.trim()) {
        await ctx.reply(currentChunk, { parse_mode: 'Markdown', disable_web_page_preview: true, ...options });
      }
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
    }
  }

  if (currentChunk.trim()) {
    await ctx.reply(currentChunk, { parse_mode: 'Markdown', disable_web_page_preview: true, ...options });
  }
}

// User authorization middleware
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || !isUserAllowed(userId)) {
    return ctx.reply('⛔ Access denied. Your user ID is not authorized to use this bot.');
  }
  return next();
});

// --- COMMAND: /start ---
bot.command('start', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text('❓ Help & Commands', 'menu_help')
    .text('👀 Active Watches', 'menu_watches')
    .row()
    .text('📡 RSS Feeds', 'menu_rss')
    .text('📊 Bot Statistics', 'menu_stats');

  const welcomeText =
    `🤖 *Welcome to Link Crawler & RSS Monitor Bot!*\n\n` +
    `I can visit any website, discover all its posts and sub-pages, and actively extract target links like *magnet links*, torrents, and downloads.\n\n` +
    `*Key Features:*\n` +
    `• 🧲 *Magnet Extraction:* Automatically captures \`magnet:?xt=...\` links from pages, attributes, and text.\n` +
    `• 🕷 *Deep Post Crawling:* Opens articles, threads, and posts found on index pages.\n` +
    `• ⏱ *Constant Monitoring:* Check sites every 5 minutes (or any interval) for new files.\n` +
    `• 📡 *Live RSS Feeds:* Subscribe directly via qBittorrent, Transmission, or RSS readers!\n` +
    `• 🚫 *Zero Duplicates:* Remembers previously seen links to avoid duplicate alerts.\n\n` +
    `Send /help to see all available commands, or simply paste any website URL to get started!`;

  await ctx.reply(welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
});

// --- COMMAND: /help ---
bot.command('help', async (ctx) => {
  const helpText =
    `📖 *Bot Commands & Usage Guide*\n\n` +
    `*1. Constant Automated Monitoring*\n` +
    `\`/watch <URL> [interval_in_minutes] [filter]\`\n` +
    `Monitors the website constantly (e.g. every 5 minutes) and alerts you immediately when a *new* post or magnet link is added.\n` +
    `• Example: \`/watch https://example.com/blog 5 magnet\`\n` +
    `• Default interval is 5 minutes if omitted.\n\n` +
    `*2. Live RSS Feed*\n` +
    `\`/rss\` or \`/feed\`\n` +
    `Provides direct RSS 2.0 XML feed URLs for your torrent clients (**qBittorrent**, **Transmission**, **Deluge**) or RSS readers.\n` +
    `• Includes both a global feed and per-site feeds.\n` +
    `• Allows instant download of the current \`feed.xml\` file.\n\n` +
    `*3. One-Off Deep Crawl*\n` +
    `\`/crawl <URL> [filter]\`\n` +
    `Crawls the website, opens up to 25 sub-posts, and extracts all target links.\n` +
    `• Filters: \`magnet\` (default), \`torrent\`, \`all\`, or custom regex.\n` +
    `• Example: \`/crawl https://example.com/releases/ magnet\`\n\n` +
    `*4. Manage Watches*\n` +
    `\`/watches\` - List all your monitored sites with interactive controls (Check Now, RSS, Pause, Delete).\n` +
    `\`/unwatch <id>\` - Remove a monitored site.\n\n` +
    `*5. Maintenance & Info*\n` +
    `\`/stats\` - View crawl counts and link statistics.\n` +
    `\`/clear <domain>\` - Clear cache for a domain to allow re-detecting existing links.\n` +
    `\`/help\` - Show this guide.\n\n` +
    `💡 *Quick Tip:* You can also just send a website link directly in chat, and I'll ask you what you want to do with it!`;

  await ctx.reply(helpText, { parse_mode: 'Markdown' });
});

// --- COMMAND: /crawl ---
bot.command('crawl', async (ctx) => {
  const text = ctx.message.text.trim();
  const parts = text.split(/\s+/).slice(1);

  if (parts.length === 0) {
    return ctx.reply(
      `⚠️ *Usage:* \`/crawl <URL> [filter]\`\n\n` +
      `*Example:*\n\`/crawl https://releases.ubuntu.com/ magnet\``,
      { parse_mode: 'Markdown' }
    );
  }

  const targetUrl = parts[0];
  const filterType = parts[1] || 'magnet';

  const statusMsg = await ctx.reply(`🔍 Connecting to \`${escapeMarkdown(targetUrl)}\`...\nDiscovered posts will be scanned.`);

  try {
    let lastUpdate = Date.now();
    const result = await crawlWebsite(targetUrl, {
      filterType,
      onProgress: (p) => {
        if (Date.now() - lastUpdate > 3000) {
          lastUpdate = Date.now();
          if (p.stage === 'scanning_post') {
            ctx.api.editMessageText(
              ctx.chat.id,
              statusMsg.message_id,
              `🔍 Scanning post *${p.current}/${p.total}*...\n` +
              `📄 \`${escapeMarkdown(p.url.slice(0, 60))}...\``,
              { parse_mode: 'Markdown' }
            ).catch(() => {});
          }
        }
      },
    });

    await storage.incrementCrawlCount();

    if (!result.items || result.items.length === 0) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `✅ *Crawl Finished*\n\n` +
        `🌐 *Site:* [${escapeMarkdown(result.startUrl)}](${result.startUrl})\n` +
        `📑 *Posts scanned:* ${result.scannedPostsCount}\n` +
        `⏱ *Duration:* ${(result.durationMs / 1000).toFixed(1)}s\n\n` +
        `ℹ️ No matching *${escapeMarkdown(filterType)}* links were found.`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
      return;
    }

    const totalLinks = result.items.reduce((acc, curr) => acc + curr.links.length, 0);

    let output =
      `🎉 *Crawl Completed!*\n\n` +
      `🌐 *Target:* [${escapeMarkdown(result.startUrl)}](${result.startUrl})\n` +
      `📑 *Posts Checked:* ${result.scannedPostsCount}\n` +
      `🧲 *Total Links Found:* ${totalLinks}\n` +
      `⏱ *Duration:* ${(result.durationMs / 1000).toFixed(1)}s\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const item of result.items) {
      output += `📄 *Post:* [${escapeMarkdown(item.postTitle)}](${item.postUrl})\n`;
      for (const link of item.links) {
        if (link.type === 'magnet') {
          output += `🧲 *Magnet:* \`${link.url}\`\n`;
          if (link.displayName) output += `🏷 *Name:* ${escapeMarkdown(link.displayName)}\n`;
          if (link.hash) output += `🔑 *Hash:* \`${link.hash}\`\n`;
        } else {
          output += `🔗 *[${link.type.toUpperCase()}]* [${escapeMarkdown(link.displayName)}](${link.url})\n`;
        }
        output += `\n`;

        // Mark as seen in storage
        await storage.markLinkSeen(link.url, {
          sourceUrl: item.postUrl,
          postTitle: item.postTitle,
          type: link.type,
          displayName: link.displayName,
        });
      }
      output += `────────────────────\n`;
    }

    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    await sendChunkedMessage(ctx, output);
  } catch (err) {
    console.error('[Bot] Crawl error:', err);
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `❌ *Error during crawl:*\n\`${escapeMarkdown(err.message)}\``,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
});

// --- COMMAND: /watch ---
bot.command('watch', async (ctx) => {
  const parts = ctx.message.text.trim().split(/\s+/).slice(1);
  if (parts.length === 0) {
    return ctx.reply(
      `⚠️ *Usage:* \`/watch <URL> [interval_in_minutes] [filter]\`\n\n` +
      `*Example:*\n\`/watch https://releases.ubuntu.com/ 30 magnet\`\n` +
      `*(Defaults to 30 mins interval and magnet filter)*`,
      { parse_mode: 'Markdown' }
    );
  }

  const url = parts[0];
  let interval = parseInt(parts[1] || '30', 10);
  if (isNaN(interval) || interval < 1) interval = 30;

  const filter = parts[2] || 'magnet';

  try {
    new URL(url.startsWith('http') ? url : `https://${url}`);
  } catch {
    return ctx.reply(`❌ Invalid URL: \`${escapeMarkdown(url)}\``, { parse_mode: 'Markdown' });
  }

  const watch = await storage.addWatch({
    chatId: ctx.chat.id,
    url: url.startsWith('http') ? url : `https://${url}`,
    intervalMinutes: interval,
    filterType: filter,
  });

  const keyboard = new InlineKeyboard()
    .text('⚡ Check Now', `check_${watch.id}`)
    .text('🗑 Delete', `del_${watch.id}`);

  await ctx.reply(
    `✅ *Active Monitor Registered!*\n\n` +
    `🌐 *Target:* [${escapeMarkdown(watch.name)}](${watch.url})\n` +
    `⏱ *Check Interval:* Every *${watch.intervalMinutes}* minutes\n` +
    `🎯 *Filter:* \`${watch.filterType}\`\n` +
    `🆔 *Watch ID:* \`${watch.id}\`\n\n` +
    `I will actively inspect this site and all its posts in the background and notify you as soon as new links appear!`,
    {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: keyboard,
    }
  );
});

// --- COMMAND: /watches ---
bot.command('watches', async (ctx) => {
  const watches = storage.getWatches(ctx.chat.id);
  if (watches.length === 0) {
    return ctx.reply(
      `ℹ️ You don't have any active monitors set up yet.\n\n` +
      `Use \`/watch <URL> [interval_in_minutes]\` to add one!`,
      { parse_mode: 'Markdown' }
    );
  }

  await ctx.reply(`📋 *Your Monitored Websites (${watches.length}):*`, { parse_mode: 'Markdown' });

  for (const w of watches) {
    const keyboard = new InlineKeyboard()
      .text(w.enabled ? '⏸ Pause' : '▶️ Resume', `toggle_${w.id}`)
      .text('⚡ Check Now', `check_${w.id}`)
      .row()
      .text('📡 RSS Feed', `rss_${w.id}`)
      .text('🗑 Delete', `del_${w.id}`);

    const lastChecked = w.lastCheck
      ? new Date(w.lastCheck).toLocaleString()
      : 'Never';

    const text =
      `🌐 *[${escapeMarkdown(w.name)}](${w.url})*\n` +
      `🆔 \`${w.id}\` | Status: ${w.enabled ? '🟢 Active' : '⏸ Paused'}\n` +
      `⏱ Interval: Every *${w.intervalMinutes}m* | Filter: \`${w.filterType}\`\n` +
      `🧲 Discovered Links: *${w.totalFound || 0}*\n` +
      `🕒 Last Check: ${lastChecked}\n` +
      `📡 RSS: \`${config.feedBaseUrl}/rss/${w.id}\``;

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: keyboard,
    });
  }
});

// --- COMMAND: /rss or /feed ---
bot.command(['rss', 'feed'], async (ctx) => {
  const globalFeedUrl = `${config.feedBaseUrl}/rss`;
  const watches = storage.getWatches(ctx.chat.id);

  let msg =
    `📡 *Live RSS Feeds (BitTorrent Compatible)*\n\n` +
    `These RSS 2.0 feeds include \`<enclosure type="application/x-bittorrent">\` tags, ready for auto-downloading in:\n` +
    `• *qBittorrent* (Tools > RSS > New Subscription)\n` +
    `• *Transmission* / *Deluge* / *Synology Download Station*\n` +
    `• Any standard RSS reader (Feedly, Inoreader, etc.)\n\n` +
    `🌐 *Global Feed (All Monitored Sites):*\n\`${globalFeedUrl}\`\n\n`;

  if (watches.length > 0) {
    msg += `📋 *Dedicated Feeds per Monitored Site:*\n`;
    for (const w of watches) {
      msg += `• *${escapeMarkdown(w.name)}:*\n  \`${config.feedBaseUrl}/rss/${w.id}\`\n`;
    }
  } else {
    msg += `💡 *Tip:* Use \`/watch <url> 5\` to start monitoring a website every 5 minutes.\n`;
  }

  const keyboard = new InlineKeyboard()
    .text('📥 Download Global feed.xml', 'export_rss_file');

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });
});

// --- COMMAND: /unwatch ---
bot.command('unwatch', async (ctx) => {
  const parts = ctx.message.text.trim().split(/\s+/).slice(1);
  if (parts.length === 0) {
    return ctx.reply(`⚠️ Usage: \`/unwatch <watch_id>\`\nGet your watch IDs from /watches`, {
      parse_mode: 'Markdown',
    });
  }

  const id = parts[0];
  const removed = await storage.removeWatch(id, ctx.chat.id);
  if (removed) {
    await ctx.reply(`✅ Successfully removed monitor \`${escapeMarkdown(id)}\``, {
      parse_mode: 'Markdown',
    });
  } else {
    await ctx.reply(`❌ Monitor ID \`${escapeMarkdown(id)}\` not found or not owned by you.`, {
      parse_mode: 'Markdown',
    });
  }
});

// --- COMMAND: /stats ---
bot.command('stats', async (ctx) => {
  const stats = storage.getStats(ctx.chat.id);
  const text =
    `📊 *Bot Crawler Statistics*\n\n` +
    `🟢 *Active Monitors:* ${stats.activeWatches}\n` +
    `📁 *Total Monitors (You):* ${stats.totalWatches}\n` +
    `🧲 *Total Unique Links Discovered:* ${stats.totalLinksDiscovered}\n` +
    `🕷 *Total Crawls Executed:* ${stats.totalCrawls}\n` +
    `💾 *Tracked Links in DB:* ${stats.trackedLinksCount}\n` +
    `📑 *Tracked Posts in DB:* ${stats.trackedPostsCount}`;

  await ctx.reply(text, { parse_mode: 'Markdown' });
});

// --- COMMAND: /clear ---
bot.command('clear', async (ctx) => {
  const parts = ctx.message.text.trim().split(/\s+/).slice(1);
  if (parts.length === 0) {
    return ctx.reply(
      `⚠️ Usage: \`/clear <domain_or_url>\`\nExample: \`/clear releases.ubuntu.com\`\nThis resets the seen-link cache so existing links can be re-extracted.`,
      { parse_mode: 'Markdown' }
    );
  }

  const target = parts[0];
  const count = await storage.clearSiteCache(target);
  await ctx.reply(`🧹 Cleared *${count}* cached links/posts for \`${escapeMarkdown(target)}\`.`, {
    parse_mode: 'Markdown',
  });
});

// --- CALLBACK QUERY HANDLERS ---
bot.callbackQuery(/^check_(.+)$/, async (ctx) => {
  const watchId = ctx.match[1];
  const watch = storage.getWatchById(watchId);
  if (!watch) {
    return ctx.answerCallbackQuery({ text: 'Monitor not found!' });
  }

  await ctx.answerCallbackQuery({ text: 'Starting crawl check...' });
  await ctx.reply(`⚡ Running manual check for [${escapeMarkdown(watch.name)}](${watch.url})...`, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  });

  await scheduler.runWatch(watch);
  await ctx.reply(`✅ Check finished for *${escapeMarkdown(watch.name)}*.`, {
    parse_mode: 'Markdown',
  });
});

bot.callbackQuery(/^toggle_(.+)$/, async (ctx) => {
  const watchId = ctx.match[1];
  const watch = storage.getWatchById(watchId);
  if (!watch) {
    return ctx.answerCallbackQuery({ text: 'Monitor not found!' });
  }

  const newStatus = !watch.enabled;
  await storage.updateWatch(watchId, { enabled: newStatus });
  await ctx.answerCallbackQuery({ text: newStatus ? 'Resumed!' : 'Paused!' });

  const keyboard = new InlineKeyboard()
    .text(newStatus ? '⏸ Pause' : '▶️ Resume', `toggle_${watch.id}`)
    .text('⚡ Check Now', `check_${watch.id}`)
    .text('🗑 Delete', `del_${watch.id}`);

  const lastChecked = watch.lastCheck
    ? new Date(watch.lastCheck).toLocaleString()
    : 'Never';

  const text =
    `🌐 *[${escapeMarkdown(watch.name)}](${watch.url})*\n` +
    `🆔 \`${watch.id}\` | Status: ${newStatus ? '🟢 Active' : '⏸ Paused'}\n` +
    `⏱ Interval: Every *${watch.intervalMinutes}m* | Filter: \`${watch.filterType}\`\n` +
    `🧲 Discovered Links: *${watch.totalFound || 0}*\n` +
    `🕒 Last Check: ${lastChecked}`;

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    reply_markup: keyboard,
  }).catch(() => {});
});

bot.callbackQuery(/^del_(.+)$/, async (ctx) => {
  const watchId = ctx.match[1];
  const removed = await storage.removeWatch(watchId, ctx.chat.id);
  if (removed) {
    await ctx.answerCallbackQuery({ text: 'Monitor deleted!' });
    await ctx.editMessageText(`🗑 Monitor \`${watchId}\` was deleted.`, {
      parse_mode: 'Markdown',
    }).catch(() => {});
  } else {
    await ctx.answerCallbackQuery({ text: 'Could not delete.' });
  }
});

bot.callbackQuery(/^crawl_now_(.+)$/, async (ctx) => {
  const encodedUrl = ctx.match[1];
  const url = Buffer.from(encodedUrl, 'base64url').toString('utf-8');
  await ctx.answerCallbackQuery();
  await ctx.reply(`Starting crawl for \`${escapeMarkdown(url)}\`...`, { parse_mode: 'Markdown' });

  // Simulate /crawl command
  ctx.message = { text: `/crawl ${url} magnet` };
  // Trigger crawl
  const result = await crawlWebsite(url, { filterType: 'magnet' });
  const totalLinks = result.items.reduce((acc, curr) => acc + curr.links.length, 0);

  if (totalLinks === 0) {
    return ctx.reply(`ℹ️ Crawled ${result.scannedPostsCount} posts, but no magnet links were found on \`${url}\`.`);
  }

  let output = `🎉 Found *${totalLinks}* links on [${url}](${url}):\n\n`;
  for (const item of result.items) {
    output += `📄 *${escapeMarkdown(item.postTitle)}*\n`;
    for (const link of item.links) {
      output += `🧲 \`${link.url}\`\n`;
    }
    output += `\n`;
  }
  await sendChunkedMessage(ctx, output);
});

bot.callbackQuery('menu_help', (ctx) => {
  ctx.answerCallbackQuery();
  return bot.api.sendMessage(ctx.chat.id, 'Use /help to view the full command guide.');
});

bot.callbackQuery('menu_watches', (ctx) => {
  ctx.answerCallbackQuery();
  const watches = storage.getWatches(ctx.chat.id);
  return ctx.reply(`You currently have *${watches.length}* monitor(s). Send /watches to view and manage them.`, {
    parse_mode: 'Markdown',
  });
});

bot.callbackQuery('menu_rss', async (ctx) => {
  ctx.answerCallbackQuery();
  const globalFeedUrl = `${config.feedBaseUrl}/rss`;
  const keyboard = new InlineKeyboard()
    .text('📥 Download Global feed.xml', 'export_rss_file');

  await ctx.reply(
    `📡 *RSS Feed Access*\n\n` +
    `Your live BitTorrent/RSS feed URL is:\n\`${globalFeedUrl}\`\n\n` +
    `You can subscribe to this directly in *qBittorrent* or any RSS reader!`,
    {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: keyboard,
    }
  );
});

bot.callbackQuery('menu_stats', async (ctx) => {
  ctx.answerCallbackQuery();
  const stats = storage.getStats(ctx.chat.id);
  await ctx.reply(
    `📊 *Statistics:*\n` +
    `• Active Monitors: ${stats.activeWatches}\n` +
    `• Links Discovered: ${stats.totalLinksDiscovered}\n` +
    `• Crawls: ${stats.totalCrawls}`,
    { parse_mode: 'Markdown' }
  );
});

// Handle RSS button for a specific watch
bot.callbackQuery(/^rss_(.+)$/, async (ctx) => {
  const watchId = ctx.match[1];
  const watch = storage.getWatchById(watchId);
  if (!watch) {
    return ctx.answerCallbackQuery({ text: 'Monitor not found!' });
  }

  await ctx.answerCallbackQuery();
  const watchFeedUrl = `${config.feedBaseUrl}/rss/${watch.id}`;
  const keyboard = new InlineKeyboard()
    .text('📥 Download feed.xml', `export_watch_rss_${watch.id}`);

  await ctx.reply(
    `📡 *Dedicated RSS Feed for [${escapeMarkdown(watch.name)}](${watch.url})*\n\n` +
    `🔗 *Feed URL:*\n\`${watchFeedUrl}\`\n\n` +
    `Subscribe to this in qBittorrent, Transmission, or an RSS reader to get new files from this website automatically!`,
    {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: keyboard,
    }
  );
});

// Handle export global feed.xml file
bot.callbackQuery('export_rss_file', async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Generating feed.xml...' });
  const xml = getFeedXml();
  const file = new InputFile(Buffer.from(xml, 'utf-8'), 'feed.xml');
  await ctx.replyWithDocument(file, {
    caption: '📡 Global RSS Feed (BitTorrent 2.0 compatible)',
  });
});

// Handle export specific watch feed.xml file
bot.callbackQuery(/^export_watch_rss_(.+)$/, async (ctx) => {
  const watchId = ctx.match[1];
  const watch = storage.getWatchById(watchId);
  if (!watch) {
    return ctx.answerCallbackQuery({ text: 'Monitor not found!' });
  }

  await ctx.answerCallbackQuery({ text: 'Generating feed...' });
  const xml = getFeedXml(watchId);
  const fileName = `${watch.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_feed.xml`;
  const file = new InputFile(Buffer.from(xml, 'utf-8'), fileName);
  await ctx.replyWithDocument(file, {
    caption: `📡 RSS Feed for ${watch.name}`,
  });
});

// --- PLAIN TEXT URL LISTENER ---
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return; // Ignore unhandled slash commands

  // Check if user sent a URL directly
  let parsedUrl = null;
  try {
    if (text.startsWith('http://') || text.startsWith('https://')) {
      parsedUrl = new URL(text);
    }
  } catch {
    return;
  }

  if (parsedUrl) {
    const encoded = Buffer.from(parsedUrl.href).toString('base64url');
    const keyboard = new InlineKeyboard()
      .text('🔍 Crawl Now (One-off)', `crawl_now_${encoded}`)
      .row()
      .text('⏱ Monitor Every 5m', `watch_5_${encoded}`)
      .text('⏱ Monitor Every 15m', `watch_15_${encoded}`)
      .text('⏱ Monitor Every 60m', `watch_60_${encoded}`);

    await ctx.reply(
      `🌐 Detected website: *${escapeMarkdown(parsedUrl.hostname)}*\n` +
      `What would you like me to do?`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  }
});

bot.callbackQuery(/^watch_(\d+)_(.+)$/, async (ctx) => {
  const minutes = parseInt(ctx.match[1], 10);
  const encodedUrl = ctx.match[2];
  const url = Buffer.from(encodedUrl, 'base64url').toString('utf-8');

  await ctx.answerCallbackQuery({ text: 'Setting up monitor...' });
  const watch = await storage.addWatch({
    chatId: ctx.chat.id,
    url,
    intervalMinutes: minutes,
    filterType: 'magnet',
  });

  await ctx.reply(
    `✅ Monitor set for [${escapeMarkdown(watch.name)}](${url}) constantly every *${minutes} minutes*.\n` +
    `• You will receive Telegram alerts whenever new links are detected!\n` +
    `• RSS Feed: \`${config.feedBaseUrl}/rss/${watch.id}\``,
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
});

// --- BOT INITIALIZATION ---
async function startBot() {
  console.log('[Bot] Initializing storage...');
  await storage.init();

  console.log('[Bot] Linking scheduler...');
  scheduler.setBot(bot);
  scheduler.start();

  console.log('[Bot] Starting built-in RSS feed server...');
  startFeedServer();

  console.log('[Bot] Starting Telegram long polling...');
  bot.start({
    onStart: (botInfo) => {
      console.log(`🤖 Bot @${botInfo.username} is running and ready!`);
    },
  });
}

// Graceful shutdown handling
process.once('SIGINT', () => {
  console.log('Shutting down bot...');
  scheduler.stop();
  bot.stop();
  process.exit(0);
});
process.once('SIGTERM', () => {
  console.log('Shutting down bot...');
  scheduler.stop();
  bot.stop();
  process.exit(0);
});

startBot().catch((err) => {
  console.error('[Bot] Fatal startup error:', err);
  process.exit(1);
});
