# 🤖 Telegram Link Crawler & Monitor Bot

An intelligent, automated Telegram bot that crawls websites, opens their posts and sub-pages, and actively discovers and extracts target links such as **magnet links** (`magnet:?xt=...`), torrent files, and custom download links.

Built with **Node.js**, **grammY**, and **Cheerio**.

---

## ✨ Features

- 🧲 **Automatic Magnet Link Extraction**: Captures `magnet:?xt=...` links from `<a>` tags, data attributes, `<pre>`, `<code>`, or raw page text.
- 🕷 **Deep Post & Sub-page Crawling**: Automatically navigates into article, post, and thread links found on index/catalog pages.
- ⏱ **Active Background Monitoring**: Set a scheduled watcher (`/watch <url> <interval>`) to continuously monitor websites and notify you immediately in Telegram whenever new links are posted.
- 🚫 **Smart Deduplication**: Remembers already-seen links and posts in a local persistent JSON database so you never get spammed with duplicates.
- 🎯 **Configurable Filters**: Filter by `magnet` links (default), `.torrent` files, direct downloads (`.zip`, `.iso`, `.tar.gz`), or custom regex patterns.
- 🎛 **Interactive Telegram Controls**: Inline buttons to trigger manual crawls, pause/resume monitors, or delete watched websites.
- 🛡 **Access Control**: Optional `ALLOWED_USERS` whitelist to restrict bot usage to you or your team.

---

## 📋 Commands

| Command | Arguments | Description |
|---|---|---|
| `/start` | - | Welcome message and interactive quick-action buttons. |
| `/help` | - | Full usage guide and examples. |
| `/crawl` | `<URL> [filter]` | One-off deep crawl: crawls the URL and opens up to 25 sub-posts to extract links. |
| `/watch` | `<URL> [interval_min] [filter]` | Adds a background monitor that checks the site periodically and alerts you on new links. |
| `/watches` | - | Lists your active monitored sites with interactive controls (Check Now, Pause, Delete). |
| `/unwatch` | `<watch_id>` | Removes a monitored website. |
| `/stats` | - | Shows stats (crawls performed, links discovered, active watchers). |
| `/clear` | `<domain>` | Resets the seen-link cache for a site if you want to re-extract previously seen links. |

> 💡 **Tip:** You can also simply paste any website URL into the chat with the bot, and it will give you one-click buttons to either **Crawl Now** or **Monitor Every 15m/60m**!

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

Open `.env` and fill in your Telegram Bot Token:
```env
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
ALLOWED_USERS=
DEFAULT_CHECK_INTERVAL=30
MAX_POSTS_PER_CRAWL=25
```

### 4. Running the Bot
Start the bot in production mode:
```bash
npm start
```

Or run in development watch mode:
```bash
npm run dev
```

---

## 🔍 How Crawling Works

```
[Target Website Landing Page]
         │
         ├──> Finds direct magnet / torrent links on main page
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
                             ▼
              [Telegram Alert Sent to Your Chat]
```

---

## 🛠 Customization & Regex

You can specify custom patterns when crawling or monitoring:
- Extracting only Linux ISOs:
  ```
  /crawl https://example.com/downloads/ ubuntu|debian
  ```
- Extracting archives or images:
  ```
  /crawl https://example.com/files/ all
  ```

---

## 📄 License
MIT License
