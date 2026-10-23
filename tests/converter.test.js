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
  assert.deepStrictEqual(t.map(n => n.title), ['Work', 'Personal']);
  assert.strictEqual(t[0].children[1].children[1].children[0].title, 'React docs');
  assert.strictEqual(t[1].children[1].children[0].url, 'https://www.seriouseats.com/');
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
test('bug 1: multi-window picks container with most items', () => {
  const t = C.parseSidebar(fx('01_multi_container.json'));
  assert.strictEqual(t.length, 1);
  assert.strictEqual(t[0].title, 'Work');
  assert.strictEqual(t[0].children[0].url, 'https://example.com');
});
test('bug 2: markdown link titles with brackets are preserved', () => {
  const t = C.parseMarkdown(fx('02_bracket_title.md'));
  assert.strictEqual(t[0].children[0].title, '[RFC] Proposal');
  assert.strictEqual(t[0].children[0].url, 'https://github.com/x/y/issues/1');
});
test('bug 3: URLs with balanced parentheses are not truncated', () => {
  const t = C.parseMarkdown(fx('03_paren_url.md'));
  assert.strictEqual(t[0].children[0].url, 'https://en.wikipedia.org/wiki/Lisp_(programming_language)');
});
test('bug 4: javascript: and unsafe schemes are filtered', () => {
  assert.throws(() => C.parseSidebar(fx('04_js_url_and_empty_folder.json')), /No bookmarks found/);
});
test('bug 5: empty folders are pruned from JSON output', () => {
  const jsonWithEmptyFolder = '{"sidebar":{"containers":[{"items":["P",{"id":"P","data":{"itemContainer":{"containerType":{"spaceItems":{"_0":"S"}}}},"childrenIds":["T","F"]},"T",{"id":"T","data":{"tab":{"savedURL":"https://example.com","savedTitle":"x"}},"childrenIds":[]},"F",{"id":"F","title":"Empty","data":{"list":{}},"childrenIds":[]}],"spaces":["S",{"id":"S","title":"Sp","containerIDs":["pinned","P"]}]}]}}';
  const t = C.parseSidebar(jsonWithEmptyFolder);
  assert.ok(t.length > 0);
  assert.strictEqual(t[0].children.filter(n => n.type === 'folder' && n.children.length === 0).length, 0);
});
test('bug 6: malformed or empty input throws error', () => {
  assert.throws(() => C.parseSidebar(fx('05_malformed_silent_empty.json')), /No bookmarks found/);
  assert.throws(() => C.parseMarkdown(''), /No bookmarks found/);
  assert.throws(() => C.parseMarkdown('# Just a heading'), /No bookmarks found/);
});
test('bug 7: top-level Arc Data Export heading is skipped', () => {
  const md = '# Arc Data Export\n## Work\n- [Link](https://example.com)';
  const t = C.parseMarkdown(md);
  assert.strictEqual(t.length, 1);
  assert.strictEqual(t[0].title, 'Work');
});
test('multi-window sample yields ~78 tabs with Favorites and spaces', () => {
  const t = C.parseSidebar(fx('multi_window_sample.json'));
  const s = C.stats(t);
  assert.ok(s.links >= 75 && s.links <= 85, `Expected ~78 links, got ${s.links}`);
  const titles = t.map(n => n.title);
  assert.ok(titles.includes('Favorites') || titles.some(t => /fav/i.test(t)), 'Should have Favorites');
  assert.ok(titles.length >= 2, 'Should have multiple top-level folders');
});
