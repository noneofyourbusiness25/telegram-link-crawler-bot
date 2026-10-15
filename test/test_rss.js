import assert from 'node:assert';
import { buildRssXml } from '../src/rss.js';
import { storage } from '../src/storage.js';

console.log('--- TESTING RSS XML GENERATION ---');

const mockItems = [
  {
    url: 'magnet:?xt=urn:btih:3333333333333333333333333333333333333333&dn=Fedora-Workstation-Live.iso',
    displayName: 'Fedora Workstation Live ISO',
    sourceUrl: 'https://example.com/posts/fedora-40',
    postTitle: 'Fedora 40 Released',
    type: 'magnet',
    hash: '3333333333333333333333333333333333333333',
    discoveredAt: new Date().toISOString(),
  },
  {
    url: 'https://example.com/downloads/archlinux-2026.iso.torrent',
    displayName: 'Arch Linux Torrent File',
    sourceUrl: 'https://example.com/posts/arch-update',
    postTitle: 'Arch Linux ISO Refresh',
    type: 'torrent',
    discoveredAt: new Date().toISOString(),
  },
];

const xml = buildRssXml({
  title: 'Test Crawler Feed',
  link: 'http://localhost:3000',
  description: 'Test BitTorrent RSS Feed',
  selfUrl: 'http://localhost:3000/rss',
  items: mockItems,
});

assert(xml.includes('<rss version="2.0"'), 'XML must declare RSS 2.0 version');
assert(xml.includes('<channel>'), 'XML must include channel root');
assert(xml.includes('Fedora Workstation Live ISO'), 'XML must contain item title');
assert(xml.includes('type="application/x-bittorrent"'), 'Magnet item must have bittorrent enclosure');
assert(xml.includes('type="application/octet-stream"'), 'Torrent item must have enclosure');
assert(xml.includes('<guid isPermaLink="false">'), 'XML must include guid');

console.log('✅ RSS 2.0 XML generated with correct enclosures & BitTorrent spec!');
console.log('Sample item preview:\n', xml.split('<item>')[1].split('</item>')[0].trim());
console.log('🎉 ALL RSS TESTS PASSED!');
