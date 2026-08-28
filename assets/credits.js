/* Target practice, after the manner of the Melee credits: once the warp drive
   has arrived, a crosshair unlocks and every word in the book becomes a target.
   Hits knock the word off the page and count up; leaving the mode puts every
   word back exactly as it was, because this is still a handbook. The title
   card gets targets of its own: little asteroids drift over the cover, blow
   into pixel debris when shot, and float back in from the edges. A run is 30
   seconds on the clock; the best score survives the session in localStorage,
   and only a run the clock ends is allowed to set it. */

(function () {
  var main = document.querySelector('main');
  if (!main || !window.requestAnimationFrame) return;

  var CELL = 4;                                  // same pixel grid as the warp
  var RANKS = [[1, 'CRACK SHOT'], [0.8, 'SHARP'], [0.5, 'STEADY'], [0, 'SPRAY AND PRAY']];

  var TIME = 30;                                 // seconds on the clock per run
  var BEST_KEY = 'handbook:best';

  var on = false, unlocked = false;
  var hits = 0, shots = 0, wrapped = [];
  var timeLeft = TIME, best = 0;
  try { best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) {}
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

  /* --- the asteroid field: the title card is mostly empty sky, so it gets
         targets of its own. Little rocks drift over the cover while the mode
         is on; a hit blows one into pixel debris and another floats in from
         the edge a beat later. They live in cover-local coordinates so they
         ride the page under the fixed overlay. */

  var cover = document.querySelector('.cover');
  var ROCKS = 6;
  var rocks = [], respawns = [];
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  function makeRock(fromEdge) {
    var rect = cover.getBoundingClientRect();
    var r = 9 + Math.random() * 9;                                  // css px
    var x, y;
    if (fromEdge) {
      var side = (Math.random() * 4) | 0;
      x = side === 1 ? -r : side === 3 ? rect.width + r : Math.random() * rect.width;
      y = side === 0 ? -r : side === 2 ? rect.height + r : Math.random() * rect.height;
    } else {
      x = Math.random() * rect.width;
      y = Math.random() * rect.height;
    }
    var motion = !(reduce && reduce.matches);
    var sp = motion ? 8 + Math.random() * 16 : 0;                   // css px/s
    var dir = Math.random() * Math.PI * 2;
    var verts = [];                       // radius jitter, one entry per vertex
    var n = 7 + ((Math.random() * 3) | 0);
    for (var i = 0; i < n; i++) verts.push(0.66 + Math.random() * 0.52);
    return {
      x: x, y: y, r: r,
      vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp,
      rot: Math.random() * Math.PI * 2,
      vr: motion ? (Math.random() - 0.5) * 1.1 : 0,
      verts: verts
    };
  }

  function seedRocks() {
    rocks = [];
    respawns = [];
    if (!cover) return;
    for (var i = 0; i < ROCKS; i++) rocks.push(makeRock(false));
  }

  function rockAt(x, y) {
    if (!cover) return -1;
    var rect = cover.getBoundingClientRect();
    for (var i = 0; i < rocks.length; i++) {
      var rk = rocks[i];
      var dx = x - (rect.left + rk.x), dy = y - (rect.top + rk.y);
      if (dx * dx + dy * dy <= rk.r * rk.r * 1.35) return i;        // a shade generous
    }
    return -1;
  }

  function drawRocks(dt, orange) {
    if (!cover || (!rocks.length && !respawns.length)) return;
    for (var i = respawns.length - 1; i >= 0; i--) {
      respawns[i] -= dt;
      if (respawns[i] <= 0) { respawns.splice(i, 1); rocks.push(makeRock(true)); }
    }
    var rect = cover.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;   // cover scrolled away
    ctx.fillStyle = orange;
    for (i = 0; i < rocks.length; i++) {
      var rk = rocks[i];
      rk.rot += rk.vr * dt;
      /* wrap a full radius past the cover edge, so a rock leaves before it re-enters */
      var mw = rect.width + rk.r * 2, mh = rect.height + rk.r * 2;
      rk.x = ((rk.x + rk.vx * dt + rk.r) % mw + mw) % mw - rk.r;
      rk.y = ((rk.y + rk.vy * dt + rk.r) % mh + mh) % mh - rk.r;
      var sx = rect.left + rk.x, sy = rect.top + rk.y;
      /* a jagged pixel ring: walk the circle one block of arc at a time and
         bend the radius between the vertex jitters */
      var n = rk.verts.length;
      var step = CELL / rk.r;
      for (var t = 0; t < Math.PI * 2; t += step) {
        var f = t / (Math.PI * 2) * n;
        var v = f | 0, frac = f - v;
        var rad = rk.r * (rk.verts[v % n] * (1 - frac) + rk.verts[(v + 1) % n] * frac);
        ctx.fillRect(((sx + Math.cos(t + rk.rot) * rad) / CELL) | 0,
                     ((sy + Math.sin(t + rk.rot) * rad) / CELL) | 0, 1, 1);
      }
      /* one crater block, riding the spin */
      ctx.fillRect(((sx + Math.cos(rk.rot) * rk.r * 0.35) / CELL) | 0,
                   ((sy + Math.sin(rk.rot) * rk.r * 0.35) / CELL) | 0, 1, 1);
    }
  }

  function explode(i) {
    var rk = rocks[i];
    rocks.splice(i, 1);
    respawns.push(1.2 + Math.random() * 1.6);
    var rect = cover.getBoundingClientRect();
    var ex = rect.left + rk.x, ey = rect.top + rk.y;
    var n = 16 + Math.round(rk.r);
    for (var k = 0; k < n; k++) {
      var a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 130;
      bursts.push({
        x: ex, y: ey,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.7 + Math.random() * 0.3, hit: true,
        big: Math.random() < 0.3                    // a few 2x2 chunks in the debris
      });
    }
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
    var hit = false;
    var ri = rockAt(x, y);            // rocks overlay the page, so they go first
    if (ri >= 0) {
      explode(ri);
      hit = true;
    } else {
      var range = wordAt(x, y);
      hit = range ? knock(range, x, y) : false;
    }
    if (hit) hits++;
    burst(x, y, hit);
    paintHud();
  }

  function paintHud() {
    var acc = shots ? Math.round(hits / shots * 100) : 0;
    var t = Math.max(0, Math.ceil(timeLeft));
    hud.textContent = '0:' + (t < 10 ? '0' + t : t)
      + '  ·  SCORE ' + hits
      + '  ·  ' + (shots ? acc + '%' : '--');
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

    if (on) drawRocks(dt, orange);

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
      var s = b.big ? 2 : 1;
      ctx.fillStyle = b.hit ? orange : pale;
      ctx.globalAlpha = Math.max(0, Math.min(1, b.life));
      ctx.fillRect(Math.round(b.x / CELL), Math.round(b.y / CELL), s, s);
      ctx.globalAlpha = 1;
    }
  }

  var last = 0;
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (on) {
      var shown = Math.ceil(timeLeft);
      timeLeft -= dt;
      if (Math.ceil(timeLeft) !== shown) paintHud();
      if (timeLeft <= 0) stop(true);
    }
    draw(dt);
    if (on || bursts.length) raf = requestAnimationFrame(loop);
  }

  /* --- mode -------------------------------------------------------------- */

  function start() {
    if (on || !unlocked) return;
    on = true;
    hits = shots = 0;
    timeLeft = TIME;
    document.body.classList.add('is-playing');
    toggle.setAttribute('aria-pressed', 'true');
    size();
    seedRocks();
    paintHud();
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stop(full) {
    if (!on) return;
    on = false;
    document.body.classList.remove('is-playing');
    toggle.setAttribute('aria-pressed', 'false');
    var acc = shots ? hits / shots : 0;
    if (full === true) {
      /* the clock ran out: this run counts. A quit run only ever scores
         lower than a finished one would have, so it shows its numbers but
         never touches the best. */
      var newBest = hits > best;
      if (newBest) {
        best = hits;
        try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
      }
      hud.textContent = (newBest ? 'NEW BEST ' + hits : 'SCORE ' + hits + '  ·  BEST ' + best)
        + '  ·  ' + Math.round(acc * 100) + '%  ·  ' + rank(acc);
    } else {
      hud.textContent = shots
        ? hits + '/' + shots + '  ·  ' + Math.round(acc * 100) + '%  ·  ' + rank(acc)
        : '';
    }
    hud.classList.add('is-summary');
    window.setTimeout(function () { hud.classList.remove('is-summary'); }, full === true ? 5200 : 3200);
    restore();
    rocks = [];
    respawns = [];
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
    score: function () { return { hits: hits, shots: shots, live: wrapped.length, rocks: rocks.length, time: timeLeft, best: best }; }
  };
})();
