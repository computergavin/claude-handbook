/* Search. Indexes the rendered DOM, so nothing extra is generated at build
   time and the index can never drift from the text on the page.

   The script tag sits right after the last chapter, so a synchronous walk
   here runs inline during initial parsing, over every h2/h3/p/li/pre/td in
   every chapter, before the browser can finish the page and paint it. None of
   that work is needed until someone actually searches, so it is built once,
   lazily, the first time the box is touched — with an idle-time warm-up so
   it is usually already done by then instead of stalling that first
   keystroke. */

(function () {
  var input = document.getElementById('q');
  var panel = document.getElementById('results');
  var inner = document.getElementById('results-inner');
  if (!input || !panel || !inner) return;

  var index = [];
  var anchorSeq = 0;
  var indexed = false;

  function clean(node) {
    var rail = node.querySelector ? node.querySelector('.rail') : null;
    var text = node.textContent;
    if (rail) text = text.slice(rail.textContent.length);
    return text.replace(/\s+/g, ' ').trim();
  }

  function firstProse(node) {
    var sib = node.nextElementSibling;
    while (sib && !/^(P|UL|OL|PRE|TABLE|ASIDE)$/.test(sib.tagName)) sib = sib.nextElementSibling;
    return sib ? clean(sib).slice(0, 260) : '';
  }

  function buildIndex() {
    if (indexed) return;
    indexed = true;

    document.querySelectorAll('.chapter').forEach(function (chapter) {
      var h1 = chapter.querySelector('h1');
      var chapterTitle = clean(h1);
      if (!chapter.id) chapter.id = 'c' + (anchorSeq++);

      // the chapter itself, so a title search surfaces the chapter before its innards
      index.push({
        id: chapter.id,
        chapter: chapterTitle,
        section: '',
        match: chapterTitle,
        show: firstProse(chapter.querySelector('.chapter__head')) || chapterTitle,
        weight: 8
      });

      var section = '';
      chapter.querySelectorAll('h2, h3, p, li, pre, td').forEach(function (node) {
        if (node.closest('.chapter__meta') || node.closest('.chapter__head')) return;
        var text = clean(node);
        var heading = node.tagName === 'H2' || node.tagName === 'H3';
        if (!heading && text.length < 24) return;
        if (heading) section = text;
        if (!node.id) node.id = 'x' + (anchorSeq++);

        index.push({
          id: node.id,
          chapter: chapterTitle,
          section: heading ? text : section,
          match: heading ? text : section + ' ' + text,
          show: heading ? (firstProse(node) || text) : text,
          weight: node.tagName === 'H2' ? 5 : node.tagName === 'H3' ? 4 : 1
        });
      });
    });

    index.forEach(function (e) { e.haystack = e.match.toLowerCase(); });
  }

  // Warm the index once the browser is idle, so the first real search rarely
  // pays the build cost. run() and the hit handler still call buildIndex()
  // themselves, so search is correct even if this callback never fires.
  if (window.requestIdleCallback) requestIdleCallback(buildIndex, { timeout: 2000 });
  else setTimeout(buildIndex, 300);
  input.addEventListener('focus', buildIndex, { once: true });

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function snippet(text, terms) {
    var lower = text.toLowerCase();
    var at = Math.min.apply(null, terms.map(function (t) {
      var i = lower.indexOf(t);
      return i === -1 ? Infinity : i;
    }));
    if (!isFinite(at)) at = 0;
    var start = Math.max(0, at - 70);
    var out = escapeHtml(text.slice(start, start + 230));
    if (start > 0) out = '…' + out;
    if (start + 230 < text.length) out += '…';
    terms.forEach(function (t) {
      out = out.replace(
        new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
        '<mark>$1</mark>'
      );
    });
    return out;
  }

  function run(query) {
    var terms = query.toLowerCase().split(/\s+/).filter(function (t) { return t.length > 1; });
    if (!terms.length) { panel.dataset.open = 'false'; return; }
    buildIndex();

    var hits = [];
    index.forEach(function (entry) {
      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        if (entry.haystack.indexOf(terms[i]) === -1) return;
        score += entry.weight;
      }
      hits.push({ entry: entry, score: score });
    });

    hits.sort(function (a, b) { return b.score - a.score; });
    hits = hits.slice(0, 30);

    var count = hits.length === 30 ? '30+ matches' : hits.length + (hits.length === 1 ? ' match' : ' matches');
    var html = '<p class="results__count">' + count + ' for “' + escapeHtml(query) + '”</p>';

    if (!hits.length) {
      html += '<p class="results__empty">Nothing in the handbook yet. That is usually a gap worth filling — try <code>/capture-lesson</code>.</p>';
    } else {
      hits.forEach(function (hit) {
        var e = hit.entry;
        var where = escapeHtml(e.chapter) + (e.section ? ' \u203a ' + escapeHtml(e.section) : '');
        html += '<button class="hit" data-target="' + e.id + '">' +
          '<span class="hit__where">' + where + '</span>' +
          '<p class="hit__text">' + snippet(e.show, terms) + '</p></button>';
      });
    }
    inner.innerHTML = html;
    panel.dataset.open = 'true';
  }

  var timer;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { run(input.value.trim()); }, 110);
  });

  inner.addEventListener('click', function (event) {
    var button = event.target.closest('.hit');
    if (!button) return;
    var target = document.getElementById(button.dataset.target);
    panel.dataset.open = 'false';
    input.value = '';
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    target.classList.remove('is-flashed');
    void target.offsetWidth;
    target.classList.add('is-flashed');
  });

  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      input.focus();
      input.select();
    } else if (event.key === '/' && document.activeElement !== input) {
      event.preventDefault();
      input.focus();
    } else if (event.key === 'Escape') {
      panel.dataset.open = 'false';
      input.blur();
    }
  });
})();
