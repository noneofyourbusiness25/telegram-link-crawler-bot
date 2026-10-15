import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  allowedUsers: process.env.ALLOWED_USERS
    ? process.env.ALLOWED_USERS.split(',').map((id) => id.trim()).filter(Boolean)
    : [],
  defaultCheckInterval: parseInt(process.env.DEFAULT_CHECK_INTERVAL || '5', 10),
  maxPostsPerCrawl: parseInt(process.env.MAX_POSTS_PER_CRAWL || '25', 10),
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10),
  requestDelayMs: parseInt(process.env.REQUEST_DELAY_MS || '500', 10),
  serverPort: parseInt(process.env.PORT || '3000', 10),
  feedBaseUrl: process.env.FEED_BASE_URL || `http://localhost:${process.env.PORT || '3000'}`,
  userAgent:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  dataDir: path.join(rootDir, 'data'),
  dbFile: path.join(rootDir, 'data', 'database.json'),
};

export function isUserAllowed(userId) {
  if (!config.allowedUsers || config.allowedUsers.length === 0) {
    return true;
  }
  return config.allowedUsers.includes(String(userId));
}
