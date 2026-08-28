/* Cover warp jump. The canvas backing store is one pixel per block and CSS
   scales it up with image-rendering: pixelated, so every star is a real pixel
   rather than a drawn square. It runs once on load and then stops — this is a
   title card, not a screensaver — and re-runs on demand from the engage
   button, which is also the only way to run it under reduced-motion. */

(function () {
  var cover = document.querySelector('.cover');
  if (!cover || !window.requestAnimationFrame) return;

  var CELL = 4;                       // css px per pixel block
  var HUE = ['232,89,12', '184,67,10', '28,25,23'];   // orange, deep, ink

  /* the starfield takes its colours from the live theme tokens, so the jump
     reads the same in dark as it does on paper */
  function channels(value) {
    value = value.trim();
    var m = /^#?([0-9a-f]{6})$/i.exec(value);
    if (m) {
      var n = parseInt(m[1], 16);
      return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
    }
    m = /rgba?\(([^)]+)\)/.exec(value);
    return m ? m[1].split(',').slice(0, 3).join(',') : null;
  }

  function readTheme() {
    var cs = getComputedStyle(document.documentElement);
    var picked = ['--orange', '--orange-deep', '--ink'].map(function (name) {
      return channels(cs.getPropertyValue(name) || '');
    });
    for (var i = 0; i < 3; i++) if (picked[i]) HUE[i] = picked[i];
  }

  /* phase lengths, ms: tremble, spool up, the jump itself, coast down */
  var CHARGE = 700, SPOOL = 800, JUMP = 420, SETTLE = 1600;
  var TOTAL = CHARGE + SPOOL + JUMP + SETTLE;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  var canvas = document.createElement('canvas');
  canvas.className = 'cover__warp';
  canvas.setAttribute('aria-hidden', 'true');
  cover.insertBefore(canvas, cover.firstChild);
  var ctx = canvas.getContext('2d');

  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'cover__engage';
  button.innerHTML = '<span>&#9654;</span> engage warp drive';
  var anchor = cover.querySelector('.cover__sub') || cover.querySelector('.cover__title');
  anchor.parentNode.insertBefore(button, anchor.nextSibling);

  var W = 0, H = 0, cx = 0, cy = 0, maxR = 1;
  var stars = [];
  var raf = 0, start = 0, last = 0, running = false;

  function resize() {
    var rect = cover.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width / CELL));
    H = Math.max(1, Math.round(rect.height / CELL));
    canvas.width = W;
    canvas.height = H;
    cx = W / 2;
    cy = H / 2;
    maxR = Math.sqrt(cx * cx + cy * cy) + 2;
    ctx.imageSmoothingEnabled = false;
  }

  function star(r) {
    return {
      a: Math.random() * Math.PI * 2,
      r: r,
      s: 0.45 + Math.random() * 1.15,                                  // speed
      c: Math.random() < 0.72 ? 0 : (Math.random() < 0.7 ? 1 : 2)      // colour
    };
  }

  function seed() {
    var count = Math.min(300, Math.max(90, Math.round(W * H / 26)));
    stars = [];
    for (var i = 0; i < count; i++) stars.push(star(Math.random() * maxR));
  }

  /* warp factor over the sequence: a tremor while charging, a cubed ramp
     while spooling, a hard spike on the jump, then an eased coast down. */
  function warpAt(t) {
    if (t < CHARGE) return 0.05 + 0.025 * Math.sin(t / 38);
    if (t < CHARGE + SPOOL) {
      var p = (t - CHARGE) / SPOOL;
      return 0.08 + 1.1 * p * p * p;
    }
    if (t < CHARGE + SPOOL + JUMP) {
      var j = (t - CHARGE - SPOOL) / JUMP;
      return 1.2 + 7.5 * Math.pow(j, 0.55);
    }
    var d = (t - CHARGE - SPOOL - JUMP) / SETTLE;
    return 0.08 + 8.6 * Math.pow(1 - d, 3);
  }

  function alphaAt(t) {
    var inn = Math.min(1, t / 260);
    var tail = CHARGE + SPOOL + JUMP + SETTLE * 0.45;
    var out = t < tail ? 1 : Math.max(0, 1 - (t - tail) / (SETTLE * 0.55));
    return inn * out;
  }

  function block(x, y, hue, a) {
    if (a <= 0.02 || x < -1 || y < -1 || x > W || y > H) return;
    ctx.fillStyle = 'rgba(' + hue + ',' + (a > 1 ? 1 : a) + ')';
    ctx.fillRect(x | 0, y | 0, 1, 1);
  }

  function ring(radius, a) {
    if (radius < 1 || a <= 0.02) return;
    var step = 1 / radius;
    for (var t = 0; t < Math.PI * 2; t += step) {
      block(cx + Math.cos(t) * radius, cy + Math.sin(t) * radius, HUE[0], a);
    }
  }

  function frame(now) {
    var t = now - start;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (t >= TOTAL) return stop();

    var w = warpAt(t);
    var alpha = alphaAt(t);
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      var pr = st.r;
      st.r += (0.35 + w * st.s * (2 + st.r * 0.9)) * dt * 4;

      /* the streak: sampled blocks from the old radius to the new one, capped
         so an extreme warp factor cannot blow up the per-frame draw count. */
      var len = st.r - pr;
      var steps = Math.min(32, Math.max(1, Math.round(len)));
      var ca = Math.cos(st.a), sa = Math.sin(st.a);
      for (var k = 0; k <= steps; k++) {
        var r = pr + (len * k) / steps;
        var mask = Math.min(1, Math.max(0.05, (r / maxR - 0.06) / 0.32));
        var fade = 0.35 + 0.65 * (k / steps);          // tail dimmer than head
        block(cx + ca * r, cy + sa * r, HUE[st.c], alpha * mask * fade * 0.85);
      }

      if (st.r > maxR) stars[i] = star(1 + Math.random() * 5);
    }

    /* the jump itself: a bloom at the origin and one expanding pixel ring */
    var since = t - (CHARGE + SPOOL);
    if (since > 0 && since < 900) {
      var p = since / 900;
      var bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.6);
      bloom.addColorStop(0, 'rgba(' + HUE[0] + ',' + 0.3 * (1 - p) * alpha + ')');
      bloom.addColorStop(1, 'rgba(' + HUE[0] + ',0)');
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, W, H);
      ring(maxR * 1.15 * p, (1 - p) * 0.85 * alpha);
    }

    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, W, H);
    canvas.classList.remove('is-live');
    cover.classList.remove('is-warping');
    button.disabled = false;
  }

  function play() {
    cancelAnimationFrame(raf);
    readTheme();
    resize();
    seed();
    running = true;
    button.disabled = true;
    canvas.classList.add('is-live');
    start = last = performance.now();
    raf = requestAnimationFrame(frame);
    window.setTimeout(function () {
      if (running && !reduce.matches) cover.classList.add('is-warping');
    }, CHARGE + SPOOL - 60);
    window.setTimeout(function () {
      cover.classList.remove('is-warping');
    }, CHARGE + SPOOL + JUMP + 200);
  }

  button.addEventListener('click', play);
  window.addEventListener('resize', function () { if (running) resize(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && running) stop();
  });

  resize();
  if (!reduce.matches) window.setTimeout(play, 260);
})();
