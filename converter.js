/* Arc → Netscape bookmarks converter. Runs entirely in the browser (also Node for tests). */
(function (root) {
  'use strict';
  function folder(title, children) { return { type: 'folder', title: title || 'Untitled', children: children || [] }; }
  function link(title, url) { return { type: 'link', title: title || url, url: url }; }

  // ---------- StorableSidebar.json ----------
  // Arc stores Swift-encoded dictionaries as flat arrays: [key, value, key, value, ...]
  function pairs(arr) {
    var out = [];
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i + 1 < arr.length; i += 2) out.push([arr[i], arr[i + 1]]);
    return out;
  }
  function objectsFrom(arr) {
    // items/spaces arrays alternate "ID" strings and objects; tolerate either shape
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (x) { return x && typeof x === 'object'; });
  }
  function parseSidebar(json) {
    var data = typeof json === 'string' ? JSON.parse(json) : json;
    var containers = (data.sidebar && data.sidebar.containers) || data.containers;
    if (!Array.isArray(containers)) throw new Error('Not an Arc StorableSidebar.json (sidebar.containers missing)');
    var main = containers.find(function (c) { return c && Array.isArray(c.items) && c.items.length; }) ||
               containers.find(function (c) { return c && Array.isArray(c.spaces); });
    if (!main) throw new Error('No sidebar items found');
    var items = {};
    objectsFrom(main.items).forEach(function (it) { if (it.id) items[it.id] = it; });
    var spaces = objectsFrom(main.spaces);

    function convertItem(id, seen) {
      var it = items[id]; if (!it || seen[id]) return null; seen[id] = 1;
      var d = it.data || {};
      if (d.tab) {
        var url = d.tab.savedURL || d.tab.url; if (!url) return null;
        return link(it.title || d.tab.savedTitle || url, url);
      }
      if (d.easel || d.splitView || d.list || d.itemContainer || (it.childrenIds && it.childrenIds.length)) {
        var kids = (it.childrenIds || []).map(function (c) { return convertItem(c, seen); }).filter(Boolean);
        if (d.splitView || d.itemContainer) return kids.length ? folder(it.title || (d.splitView ? 'Split View' : 'Group'), kids) : null;
        return folder(it.title || 'Untitled Folder', kids);
      }
      return null;
    }
    function containerChildren(cid, seen) {
      var c = items[cid]; if (!c) return [];
      return (c.childrenIds || []).map(function (k) { return convertItem(k, seen); }).filter(Boolean);
    }
    var root = [], seen = {};
    // Favorites (topApps)
    var favs = [];
    Object.keys(items).forEach(function (id) {
      var ct = items[id].data && items[id].data.itemContainer && items[id].data.itemContainer.containerType;
      if (ct && ct.topApps) favs = favs.concat(containerChildren(id, seen));
    });
    if (favs.length) root.push(folder('Favorites', favs));
    spaces.forEach(function (sp) {
      var name = sp.title || (sp.customInfo && sp.customInfo.title) || 'Space';
      var ids = pairs(sp.containerIDs || sp.newContainerIDs || []);
      var pinned = [], unpinned = [];
      ids.forEach(function (p) {
        var k = p[0], v = p[1];
        var kind = typeof k === 'string' ? k : (k && Object.keys(k)[0]);
        if (kind === 'pinned') pinned = pinned.concat(containerChildren(v, seen));
        else if (kind === 'unpinned') unpinned = unpinned.concat(containerChildren(v, seen));
      });
      var kids = pinned.slice();
      if (unpinned.length) kids.push(folder('Today (unpinned tabs)', unpinned));
      if (kids.length) root.push(folder(name, kids));
    });
    return root;
  }

  // ---------- Arc Data Export.md ----------
  var LINK_RE = /\[([^\]]*)\]\(\s*<?([^)\s>]+)>?\s*\)/;
  function parseMarkdown(text) {
    var root = folder('root', []);
    var headingStack = [{ level: 0, node: root }];
    var listStack = [];
    text.replace(/\r\n?/g, '\n').split('\n').forEach(function (raw) {
      if (!raw.trim()) return;
      var h = /^(#{1,6})\s+(.*)$/.exec(raw);
      if (h) {
        var lvl = h[1].length, title = h[2].trim().replace(/^\*\*|\*\*$/g, '');
        while (headingStack.length > 1 && headingStack[headingStack.length - 1].level >= lvl) headingStack.pop();
        var f = folder(title, []);
        headingStack[headingStack.length - 1].node.children.push(f);
        headingStack.push({ level: lvl, node: f });
        listStack = [];
        return;
      }
      var b = /^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/.exec(raw);
      var parent = headingStack[headingStack.length - 1].node;
      if (b) {
        var indent = b[1].replace(/\t/g, '    ').length, body = b[2].trim();
        while (listStack.length && listStack[listStack.length - 1].indent >= indent) listStack.pop();
        var host = listStack.length ? listStack[listStack.length - 1].node : parent;
        var m = LINK_RE.exec(body), bare = /^<?(https?:\/\/\S+?)>?$/.exec(body);
        if (m) host.children.push(link(m[1].trim() || m[2], m[2]));
        else if (bare) host.children.push(link(bare[1], bare[1]));
        else {
          var f2 = folder(body.replace(/^\*\*|\*\*$/g, '').replace(/:$/, ''), []);
          host.children.push(f2); listStack.push({ indent: indent, node: f2 });
        }
        return;
      }
      var m2 = LINK_RE.exec(raw);
      if (m2) parent.children.push(link(m2[1].trim() || m2[2], m2[2]));
    });
    return prune(root.children);
  }
  function prune(nodes) {
    return nodes.map(function (n) {
      if (n.type === 'folder') { n.children = prune(n.children); return n.children.length ? n : null; }
      return n;
    }).filter(Boolean);
  }

  // ---------- Output ----------
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toNetscapeHTML(tree, opts) {
    opts = opts || {};
    var ts = Math.floor((opts.now || Date.now()) / 1000);
    var out = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<!-- This is an automatically generated file.', '     It will be read and overwritten.', '     DO NOT EDIT! -->',
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>'];
    function walk(nodes, depth) {
      var pad = new Array(depth + 1).join('    ');
      nodes.forEach(function (n) {
        if (n.type === 'folder') {
          out.push(pad + '<DT><H3 ADD_DATE="' + ts + '" LAST_MODIFIED="' + ts + '">' + esc(n.title) + '</H3>');
          out.push(pad + '<DL><p>'); walk(n.children, depth + 1); out.push(pad + '</DL><p>');
        } else out.push(pad + '<DT><A HREF="' + esc(n.url) + '" ADD_DATE="' + ts + '">' + esc(n.title) + '</A>');
      });
    }
    var top = opts.wrap === false ? tree : [folder(opts.rootName || 'Arc Import', tree)];
    walk(top, 1);
    out.push('</DL><p>');
    return out.join('\n') + '\n';
  }
  function stats(tree) {
    var s = { links: 0, folders: 0, topLevel: tree.length };
    (function w(ns) { ns.forEach(function (n) { if (n.type === 'folder') { s.folders++; w(n.children); } else s.links++; }); })(tree);
    return s;
  }
  function detectAndParse(name, text) {
    var t = text.trim();
    if (/\.json$/i.test(name) || t[0] === '{') return parseSidebar(t);
    return parseMarkdown(text);
  }
  var api = { parseSidebar: parseSidebar, parseMarkdown: parseMarkdown, toNetscapeHTML: toNetscapeHTML, stats: stats, detectAndParse: detectAndParse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ArcConverter = api;
})(this);
