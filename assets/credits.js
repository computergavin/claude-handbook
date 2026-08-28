/* Target practice, after the manner of the Melee credits: once the warp drive
   has arrived, a crosshair unlocks and every word in the book becomes a target.
   Hits knock the word off the page and count up; leaving the mode puts every
   word back exactly as it was, because this is still a handbook. */

(function () {
  var main = document.querySelector('main');
  if (!main || !window.requestAnimationFrame) return;

  var CELL = 4;                                  // same pixel grid as the warp
  var RANKS = [[1, 'CRACK SHOT'], [0.8, 'SHARP'], [0.5, 'STEADY'], [0, 'SPRAY AND PRAY']];

  var on = false, unlocked = false;
  var hits = 0, shots = 0, wrapped = [];
  var px = -99, py = -99, raf = 0, bursts = [];

  /* --- chrome ----------------------------------------------------------- */

  var canvas = document.createElement('canvas');
  canvas.className = 'reticle';
  canvas.setAttribute('aria-hidden', 'true');
  var ctx = canvas.getContext('2d');

  var hud = document.createElement('div');
  hud.className = 'hud';
  hud.setAttribute('aria-live', 'off');

  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'playtoggle';
  toggle.title = 'Target practice';
  toggle.setAttribute('aria-label', 'Target practice');
  toggle.textContent = '⌖';

  document.body.appendChild(canvas);
  document.body.appendChild(hud);
  document.body.appendChild(toggle);

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    document.body.classList.add('can-play');
  }

  document.addEventListener('warp:held', unlock);
  if (window.__warpHeld) unlock();

  /* The drive arriving is the cue, but it must not be the only one: if the
     cover never finishes its sequence — scrolled away, a tab left in the
     background — the crosshair would never appear at all. */
  window.setTimeout(unlock, 8000);

  /* --- the target field: a word is found under the shot, not marked up in
         advance. Wrapping every word in 21 chapters would cost more than the
         whole book; caretRangeFromPoint finds the one that was actually hit. */

  function caretAt(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      var p = document.caretPositionFromPoint(x, y);
      if (!p) return null;
      var r = document.createRange();
      r.setStart(p.offsetNode, p.offset);
      r.collapse(true);
      return r;
    }
    return null;
  }

  /* Everything on the page is a target except the game's own chrome and the
     controls. Limiting this to the chapters meant the crosshair unlocked while
     you were still looking at the cover, where nothing could be hit at all —
     which is indistinguishable from the thing being broken. */
  var SAFE = '.hud, .playtoggle, .themetoggle, .topbar, .results, .shot';

  function targetable(node) {
    if (!node || node.nodeType !== 3) return false;
    var el = node.parentNode;
    if (!el || !el.closest) return false;
    return !el.closest(SAFE);
  }

  function wordAt(x, y) {
    var range = caretAt(x, y);
    if (!range || !targetable(range.startContainer)) return null;
    var text = range.startContainer.nodeValue, i = range.startOffset;
    if (!text || !text.trim()) return null;
    var a = i, b = i;
    while (a > 0 && /\S/.test(text.charAt(a - 1))) a--;
    while (b < text.length && /\S/.test(text.charAt(b))) b++;
    if (b <= a) return null;
    var word = document.createRange();
    word.setStart(range.startContainer, a);
    word.setEnd(range.startContainer, b);
    return word;
  }

  function knock(range, fromX, fromY) {
    var rect = range.getBoundingClientRect();
    var span = document.createElement('span');
    span.className = 'shot';
    try { range.surroundContents(span); } catch (e) { return false; }   // spans a tag boundary

    /* thrown away from the shot, so it reads as being hit rather than fading */
    var dx = (rect.left + rect.width / 2) - fromX;
    var dy = (rect.top + rect.height / 2) - fromY;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    span.style.setProperty('--dx', Math.round(dx / len * (60 + Math.random() * 90)) + 'px');
    span.style.setProperty('--dy', Math.round(dy / len * (40 + Math.random() * 70) - 40) + 'px');
    span.style.setProperty('--rot', Math.round((Math.random() - 0.5) * 90) + 'deg');
    wrapped.push(span);
    requestAnimationFrame(function () { span.classList.add('is-out'); });
    return true;
  }

  function restore() {
    for (var i = 0; i < wrapped.length; i++) {
      var span = wrapped[i], parent = span.parentNode;
      if (!parent) continue;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();                     // put the split text node back together
    }
    wrapped = [];
  }

  /* --- shooting ---------------------------------------------------------- */

  function burst(x, y, hit) {
    var n = hit ? 14 : 5;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (hit ? 40 : 18) + Math.random() * (hit ? 90 : 30);
      bursts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, hit: hit });
    }
  }

  function fire(x, y) {
    shots++;
    var range = wordAt(x, y);
    var hit = range ? knock(range, x, y) : false;
    if (hit) hits++;
    burst(x, y, hit);
    paintHud();
  }

  function paintHud() {
    var acc = shots ? Math.round(hits / shots * 100) : 0;
    hud.textContent = 'HITS ' + hits + '  ·  SHOTS ' + shots + '  ·  ' + (shots ? acc + '%' : '--');
  }

  function rank(acc) {
    for (var i = 0; i < RANKS.length; i++) if (acc >= RANKS[i][0]) return RANKS[i][1];
    return RANKS[RANKS.length - 1][1];
  }

  /* --- the overlay ------------------------------------------------------- */

  function size() {
    canvas.width = Math.max(1, Math.round(window.innerWidth / CELL));
    canvas.height = Math.max(1, Math.round(window.innerHeight / CELL));
    ctx.imageSmoothingEnabled = false;
  }

  function ink(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function draw(dt) {
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    var orange = ink('--orange', '#e8590c'), pale = ink('--ink', '#1c1917');

    var cx = Math.round(px / CELL), cy = Math.round(py / CELL);
    if (px > -50) {
      ctx.fillStyle = orange;
      for (var d = 3; d <= 6; d++) {                       // four ticks and a dot
        ctx.fillRect(cx - d, cy, 1, 1); ctx.fillRect(cx + d, cy, 1, 1);
        ctx.fillRect(cx, cy - d, 1, 1); ctx.fillRect(cx, cy + d, 1, 1);
      }
      ctx.fillRect(cx, cy, 1, 1);
      ctx.strokeStyle = orange;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 8.5, cy - 8.5, 17, 17);
    }

    for (var i = bursts.length - 1; i >= 0; i--) {
      var b = bursts[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt * 2.2;
      if (b.life <= 0) { bursts.splice(i, 1); continue; }
      ctx.fillStyle = b.hit ? orange : pale;
      ctx.globalAlpha = Math.max(0, b.life);
      ctx.fillRect(Math.round(b.x / CELL), Math.round(b.y / CELL), 1, 1);
      ctx.globalAlpha = 1;
    }
  }

  var last = 0;
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    draw(dt);
    if (on || bursts.length) raf = requestAnimationFrame(loop);
  }

  /* --- mode -------------------------------------------------------------- */

  function start() {
    if (on || !unlocked) return;
    on = true;
    hits = shots = 0;
    document.body.classList.add('is-playing');
    toggle.setAttribute('aria-pressed', 'true');
    size();
    paintHud();
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (!on) return;
    on = false;
    document.body.classList.remove('is-playing');
    toggle.setAttribute('aria-pressed', 'false');
    var acc = shots ? hits / shots : 0;
    hud.textContent = shots
      ? hits + '/' + shots + '  ·  ' + Math.round(acc * 100) + '%  ·  ' + rank(acc)
      : '';
    hud.classList.add('is-summary');
    window.setTimeout(function () { hud.classList.remove('is-summary'); }, 3200);
    restore();
    px = py = -99;
  }

  toggle.addEventListener('click', function () { on ? stop() : start(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && on) stop();
  });

  document.addEventListener('pointermove', function (e) {
    if (!on) return;
    px = e.clientX; py = e.clientY;
  });

  /* firing on click rather than pointerdown keeps a touch drag as a scroll,
     so you can work your way down through the chapters between shots */
  document.addEventListener('click', function (e) {
    if (!on || e.target === toggle) return;
    e.preventDefault();
    px = e.clientX; py = e.clientY;
    fire(e.clientX, e.clientY);
  }, true);

  window.addEventListener('resize', function () { if (on) size(); });
  window.addEventListener('blur', function () { if (on) stop(); });

  /* exposed so the state can be driven in a test without synthesising input */
  window.__targets = {
    start: start, stop: stop, fire: fire, unlock: unlock,
    score: function () { return { hits: hits, shots: shots, live: wrapped.length }; }
  };
})();
