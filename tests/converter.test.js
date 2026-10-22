const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const C = require('../converter.js');
const fx = f => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
test('sidebar: spaces, favorites, nested folders, unpinned', () => {
  const t = C.parseSidebar(fx('StorableSidebar.json'));
  assert.deepStrictEqual(t.map(n => n.title), ['Favorites', 'Work', 'Personal']);
  const work = t[1];
  assert.strictEqual(work.children[1].title, 'Docs');
  assert.strictEqual(work.children[1].children[1].children[0].url, 'https://react.dev/');
  assert.strictEqual(work.children[2].title, 'Today (unpinned tabs)');
  assert.deepStrictEqual(C.stats(t), { links: 6, folders: 6, topLevel: 3 });
});
test('markdown: headings become spaces, indented bullets folders', () => {
  const t = C.parseMarkdown(fx('Arc Data Export.md'));
  const ws = t[0].children;
  assert.deepStrictEqual(ws.map(n => n.title), ['Work', 'Personal']);
  assert.strictEqual(ws[0].children[1].children[1].children[0].title, 'React docs');
  assert.strictEqual(ws[1].children[1].children[0].url, 'https://www.seriouseats.com/');
  assert.strictEqual(C.stats(t).links, 5);
});
test('html output is valid Netscape format and escaped', () => {
  const h = C.toNetscapeHTML(C.parseSidebar(fx('StorableSidebar.json')), { now: 0 });
  assert.match(h, /^<!DOCTYPE NETSCAPE-Bookmark-file-1>/);
  assert.match(h, /HREF="https:\/\/developer.mozilla.org\/\?a=1&amp;b=2"/);
  assert.match(h, /MDN &lt;Web Docs&gt;/);
  assert.strictEqual((h.match(/<DL><p>/g)||[]).length, (h.match(/<\/DL><p>/g)||[]).length);
});
test('detectAndParse picks format', () => {
  assert.ok(C.detectAndParse('x.json', fx('StorableSidebar.json')).length);
  assert.ok(C.detectAndParse('x.md', fx('Arc Data Export.md')).length);
  assert.throws(() => C.parseSidebar('{}'));
});
