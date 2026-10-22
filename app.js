(function () {
  var KEY = 'arcExportUnlocked';
  var params = new URLSearchParams(location.search);
  if (params.get('paid') === '1') {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    history.replaceState(null, '', location.pathname + location.hash);
  }
  var unlocked = false; try { unlocked = localStorage.getItem(KEY) === '1'; } catch (e) {}
  var $ = function (id) { return document.getElementById(id); };
  var tree = [];
  function applyLock() { $('locked').hidden = unlocked; $('unlocked').hidden = !unlocked; }
  function render(nodes) {
    var ul = document.createElement('ul');
    nodes.forEach(function (n) {
      var li = document.createElement('li');
      if (n.type === 'folder') { var s = document.createElement('span'); s.className = 'f'; s.textContent = '📁 ' + n.title + ' (' + n.children.length + ')'; li.appendChild(s); li.appendChild(render(n.children)); }
      else { li.textContent = '🔗 ' + n.title; li.title = n.url; }
      ul.appendChild(li);
    });
    return ul;
  }
  function show() {
    var s = ArcConverter.stats(tree);
    $('sLinks').textContent = s.links; $('sFolders').textContent = s.folders; $('sTop').textContent = s.topLevel;
    $('tree').innerHTML = ''; $('tree').appendChild(render(tree));
    $('result').hidden = false; applyLock();
  }
  function load(name, text) {
    $('err').textContent = '';
    try {
      var t = ArcConverter.detectAndParse(name, text);
      if (!t.length) throw new Error('No bookmarks found in ' + name);
      tree = tree.concat(/\.json$/i.test(name) || text.trim()[0] === '{' ? t : [{ type: 'folder', title: 'From Markdown export', children: t }]);
      show();
    } catch (e) { $('err').textContent = 'Could not read ' + name + ': ' + e.message; }
  }
  function files(list) { tree = []; Array.prototype.forEach.call(list, function (f) { f.text().then(function (t) { load(f.name, t); }); }); }
  var drop = $('drop'), input = $('file');
  drop.onclick = function () { input.click(); };
  input.onchange = function () { files(input.files); };
  drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = function () { drop.classList.remove('over'); };
  drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); files(e.dataTransfer.files); };
  $('sample').onclick = function (e) { e.preventDefault(); tree = []; fetch('tests/fixtures/StorableSidebar.json').then(function (r) { return r.text(); }).then(function (t) { load('sample.json', t); }); };
  $('dl').onclick = function () {
    var blob = new Blob([ArcConverter.toNetscapeHTML(tree)], { type: 'text/html' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'arc-bookmarks.html';
    document.body.appendChild(a); a.click(); a.remove();
  };
})();
