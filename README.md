# 🤖 Telegram Link Crawler & RSS Monitor Bot

An intelligent, automated Telegram bot that crawls websites, opens their posts and sub-pages, actively discovers and extracts target links such as **magnet links** (`magnet:?xt=...`), torrent files, and custom download links, and **serves them as live BitTorrent-compatible RSS feeds**.

Built with **Node.js**, **grammY**, and **Cheerio**.

---

## ✨ Features

- 🧲 **Automatic Magnet Link Extraction**: Captures `magnet:?xt=...` links from `<a>` tags, data attributes, `<pre>`, `<code>`, or raw page text. Automatically extracts torrent display names and info hashes.
- 🕷 **Deep Post & Sub-page Crawling**: Automatically navigates into article, post, and thread links found on catalog or index pages.
- ⏱ **Constant Background Monitoring**: Set a scheduled watcher (`/watch <url> 5 magnet`) to continuously monitor websites every 5 minutes (or any interval) and notify you immediately when new links are posted.
- 📡 **BitTorrent-Compatible RSS 2.0 Server**: Built-in HTTP server generates live RSS XML feeds with `<enclosure type="application/x-bittorrent">` tags. Plug it straight into **qBittorrent**, **Transmission**, **Deluge**, **Synology Download Station**, or any RSS reader!
- 📥 **Telegram RSS Export**: Download the live `feed.xml` file directly within Telegram using `/rss`.
- 🚫 **Smart Deduplication**: Remembers already-seen links and posts in a local persistent JSON database so you never get spammed with duplicates.
- 🎯 **Configurable Filters**: Filter by `magnet` links (default), `.torrent` files, direct downloads (`.zip`, `.iso`, `.tar.gz`), or custom regex patterns.
- 🎛 **Interactive Telegram Controls**: Inline buttons to trigger manual crawls, inspect RSS feeds, pause/resume monitors, or delete watched websites.
- 🛡 **Access Control**: Optional `ALLOWED_USERS` whitelist to restrict bot usage to you or your team.

---

## 📋 Commands

| Command | Arguments | Description |
|---|---|---|
| `/start` | - | Welcome message and interactive quick-action buttons. |
| `/help` | - | Full usage guide and examples. |
| `/watch` | `<URL> [interval_min] [filter]` | Adds a background monitor (e.g. every 5 min) that checks the site and alerts you on new links. |
| `/rss` or `/feed` | - | Displays live RSS feed URLs and lets you download the `feed.xml` file. |
| `/watches` | - | Lists your active monitored sites with interactive controls (Check Now, RSS, Pause, Delete). |
| `/crawl` | `<URL> [filter]` | One-off deep crawl: crawls the URL and opens up to 25 sub-posts to extract links immediately. |
| `/unwatch` | `<watch_id>` | Removes a monitored website. |
| `/stats` | - | Shows stats (crawls performed, links discovered, active watchers). |
| `/clear` | `<domain>` | Resets the seen-link cache for a site if you want to re-extract previously seen links. |

> 💡 **Tip:** You can also simply paste any website URL into the chat with the bot, and it will give you one-click buttons to **Crawl Now**, **Monitor Every 5m**, or **Monitor Every 15m/60m**!

---

## 📡 Using the RSS Feed in Torrent Clients

The bot includes a built-in HTTP server that serves real-time RSS 2.0 feeds.

### Feed Endpoints
- **Global Feed (All Monitored Sites):**
  ```
  http://localhost:3000/rss
  ```
- **Site-Specific Feed:**
  ```
  http://localhost:3000/rss/<watch_id>
  ```
- **Web Dashboard:**
  ```
  http://localhost:3000/
  ```

### Adding to qBittorrent:
1. Open **qBittorrent** and go to the **RSS** tab (View > RSS Reader).
2. Click **New subscription** and enter `http://<your-ip-or-localhost>:3000/rss`.
3. In the RSS Downloader rules, enable automatic downloading for your new feed!

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js 18+** installed (`node -v`)
- A **Telegram Bot Token** from [@BotFather](https://t.me/BotFather)

### 2. Installation
Clone the repository:
```bash
git clone https://github.com/noneofyourbusiness25/telegram-link-crawler-bot.git
cd telegram-link-crawler-bot
```

Install dependencies:
```bash
npm install
```

### 3. Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Open `.env` and set your configuration:
```env
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
ALLOWED_USERS=
DEFAULT_CHECK_INTERVAL=5
MAX_POSTS_PER_CRAWL=25
PORT=3000
FEED_BASE_URL=http://localhost:3000
```

### 4. Running the Bot & RSS Server
Start both the bot and RSS feed server:
```bash
npm start
```

Or run in auto-reloading development mode:
```bash
npm run dev
```

---

## 🔍 How Crawling Works

```
[Target Website Landing Page]
         │
         ├──> Scans index page for immediate links
         │
         └──> Discovers internal post / article links (e.g. /post/101, /thread/542)
                   │
                   ├──> [Post 1] ──> Extracts magnet & metadata
                   ├──> [Post 2] ──> Extracts magnet & metadata
                   └──> [Post N] ──> Extracts magnet & metadata
                             │
                             ▼
                    [Deduplication Check]
                             │
                  (Only if link is brand new)
                             │
             ┌───────────────┴───────────────┐
             ▼                               ▼
 [Telegram Alert Dispatched]      [Added to Live RSS Feed]
                                 (qBittorrent / RSS Readers)
```

---

## 📄 License
MIT License
