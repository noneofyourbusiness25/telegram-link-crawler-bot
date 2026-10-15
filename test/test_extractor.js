import assert from 'node:assert';
import { extractLinks, parseMagnetUri } from '../src/extractor.js';
import { storage } from '../src/storage.js';

console.log('--- RUNNING EXTRACTION & STORAGE TESTS ---');

// 1. Test Magnet URI parsing
const sampleMagnet = 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335380dc1f7fed4&dn=Ubuntu+24.04+LTS&tr=https%3A%2F%2Ftorrent.ubuntu.com%2Fannounce';
const parsed = parseMagnetUri(sampleMagnet);

assert.strictEqual(parsed.hash.toLowerCase(), 'c12fe1c06bba254a9dc9f519b335380dc1f7fed4');
assert.strictEqual(parsed.displayName, 'Ubuntu 24.04 LTS');
console.log('✅ Magnet URI parsed successfully:', parsed.displayName, parsed.hash);

// 2. Test HTML extraction (including href, data attribute, and plain text regex)
const sampleHtml = `
<html>
  <body>
    <h1>Latest Community Releases</h1>
    <!-- Link in standard anchor -->
    <a href="${sampleMagnet}">Download via Magnet</a>
    
    <!-- Link in data attribute -->
    <div class="download-box" data-magnet="magnet:?xt=urn:btih:1111111111111111111111111111111111111111&dn=Debian+NetInst">Click to get torrent</div>
    
    <!-- Plain text magnet inside pre or code -->
    <pre>Raw magnet: magnet:?xt=urn:btih:2222222222222222222222222222222222222222&dn=Arch+Linux+Latest</pre>

    <!-- Normal link -->
    <a href="/post/123">Read more</a>
  </body>
</html>
`;

const extracted = extractLinks(sampleHtml, 'https://example.com/index.html', 'magnet');
assert.strictEqual(extracted.length, 3, `Expected 3 extracted magnet links, got ${extracted.length}`);
console.log(`✅ Extracted ${extracted.length} magnet links from HTML elements & text:`);
extracted.forEach((l, i) => console.log(`   ${i + 1}. [${l.displayName}] -> ${l.hash}`));

// 3. Test Storage Deduplication
await storage.init();
const testLink = 'magnet:?xt=urn:btih:deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

const firstCheck = storage.isLinkSeen(testLink);
assert.strictEqual(firstCheck, false, 'Link should not be marked as seen initially');

const marked = await storage.markLinkSeen(testLink, { test: true });
assert.strictEqual(marked, true, 'Link should be marked as seen');

const secondCheck = storage.isLinkSeen(testLink);
assert.strictEqual(secondCheck, true, 'Link should now be seen');

const reMark = await storage.markLinkSeen(testLink, { test: true });
assert.strictEqual(reMark, false, 'Marking seen link again should return false (dedup works)');

console.log('✅ Storage deduplication logic verified!');
console.log('🎉 ALL TESTS PASSED!');
