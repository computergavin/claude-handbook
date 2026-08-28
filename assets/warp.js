/* Cover warp jump. The canvas backing store is one pixel per block and CSS
   scales it up with image-rendering: pixelated, so every star is a real pixel
   rather than a drawn square.

   The jump runs once on load and then holds: the settled field stays on the
   cover as its background and the loop stops dead, so the page goes idle and
   costs nothing to keep the stars there. Leaving it looping at 60fps to drift
   was visible as a stutter the moment the motion slowed. Under reduced motion
   nothing animates, but the same static field is drawn, so the cover is never
   bare. */

(function () {
  var cover = document.querySelector('.cover');
  if (!cover || !window.requestAnimationFrame) return;

  var CELL = 4;                       // css px per pixel block
  var HUE = ['232,89,12', '184,67,10', '28,25,23'];   // orange, deep, ink

  /* phase lengths, ms: tremble, spool up, the jump itself, coast down */
  var CHARGE = 700, SPOOL = 800, JUMP = 420, SETTLE = 1600;
  var TOTAL = CHARGE + SPOOL + JUMP + SETTLE;

  /* What the field settles to and holds. ARRIVE_WARP is a floor, not a crawl:
     stars are drawn on a 4px grid, so below about one block of movement per
     frame a star sits still for several frames and then jumps a whole block —
     the field stutters instead of slowing. A cubic decay spends its last
     quarter under that line whatever its length, so the decay bottoms out
     above it and the sequence stops while still gliding. */
  var ARRIVE_WARP = 0.55, CRUISE_ALPHA = 0.6;

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

  var W = 0, H = 0, cx = 0, cy = 0, maxR = 1, jolted = false;
  var stars = [];
  var raf = 0, elapsed = 0, last = 0, running = false, seeded = false, held = false;

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
    styleCache = [];
  }

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
    seeded = true;
  }

  /* warp factor over the sequence: a tremor while charging, a cubed ramp while
     spooling, a hard spike on the jump, an eased coast down — then cruise */
  function warpAt(t) {
    if (t >= TOTAL) return ARRIVE_WARP;
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
    return ARRIVE_WARP + 8.6 * Math.pow(1 - d, 3);
  }

  /* fades up at the start, then down to the resting level — never to nothing */
  function alphaAt(t) {
    if (t >= TOTAL) return CRUISE_ALPHA;
    var inn = Math.min(1, t / 260);
    var tail = CHARGE + SPOOL + JUMP + SETTLE * 0.45;
    if (t < tail) return inn;
    var d = Math.min(1, (t - tail) / (SETTLE * 0.55));
    return inn * (1 - (1 - CRUISE_ALPHA) * d);
  }

  /* Blocks are queued by colour and quantised alpha, then flushed a bucket at a
     time. Setting fillStyle per block meant building and parsing a fresh rgba
     string for every pixel — over a hundred thousand of them in one run, and
     ~3700 in the frames either side of the jump, which is where it stuttered.
     There are only BUCKETS x 3 possible colours, so they are built once. */
  var BUCKETS = 32;
  var queue = [], styleCache = [];

  function block(x, y, hueIdx, a) {
    if (a <= 0.02 || x < -1 || y < -1 || x > W || y > H) return;
    var q = a >= 1 ? BUCKETS - 1 : (a * BUCKETS) | 0;
    var k = hueIdx * BUCKETS + q;
    var arr = queue[k] || (queue[k] = []);
    arr.push(x | 0, y | 0);
  }

  function flush() {
    for (var k = 0; k < queue.length; k++) {
      var arr = queue[k];
      if (!arr || !arr.length) continue;
      var style = styleCache[k];
      if (!style) {
        style = styleCache[k] =
          'rgba(' + HUE[(k / BUCKETS) | 0] + ',' + ((k % BUCKETS) + 0.5) / BUCKETS + ')';
      }
      ctx.fillStyle = style;
      for (var j = 0; j < arr.length; j += 2) ctx.fillRect(arr[j], arr[j + 1], 1, 1);
      arr.length = 0;
    }
  }

  function ring(radius, a) {
    if (radius < 1 || a <= 0.02) return;
    var step = 1.4 / radius;   // thinner ring, ~30% fewer blocks
    for (var t = 0; t < Math.PI * 2; t += step) {
      block(cx + Math.cos(t) * radius, cy + Math.sin(t) * radius, 0, a);
    }
  }

  function render(t, dt) {
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
        block(cx + ca * r, cy + sa * r, st.c, alpha * mask * fade * 0.85);
      }

      if (st.r > maxR) {                       // recycle in place, no garbage
        st.a = Math.random() * Math.PI * 2;
        st.r = 1 + Math.random() * 5;
        st.s = 0.45 + Math.random() * 1.15;
        st.c = Math.random() < 0.72 ? 0 : (Math.random() < 0.7 ? 1 : 2);
      }
    }

    flush();

    /* the jump itself: a bloom at the origin and one expanding pixel ring */
    var since = t - (CHARGE + SPOOL);
    if (since > 0 && since < 900) {
      var p = since / 900;
      var br = maxR * 0.6;
      var bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, br);
      bloom.addColorStop(0, 'rgba(' + HUE[0] + ',' + 0.3 * (1 - p) * alpha + ')');
      bloom.addColorStop(1, 'rgba(' + HUE[0] + ',0)');
      ctx.fillStyle = bloom;
      ctx.fillRect(cx - br, cy - br, br * 2, br * 2);   // only what the gradient covers
      ring(maxR * 1.15 * p, (1 - p) * 0.85 * alpha);
      flush();
    }
  }

  function frame(now) {
    /* elapsed accumulates from the frames actually delivered rather than from
       the clock. On a phone the first frame can arrive a second or more after
       play() — off the wall clock that skips the jump outright. */
    /* A long gap means the main thread was busy — a font swap reflow, a GC, an
       extension reprocessing the DOM. Taking the whole gap as one step makes
       the field lurch on the next frame, which reads as a freeze and then a
       snap. Resync at a normal step instead and let the sequence run late. */
    var raw = now - last;
    last = now;
    var dt = raw > 120 ? 0.016 : Math.min(0.033, raw / 1000);
    if (elapsed < TOTAL) {
      elapsed += dt * 1000;
      if (elapsed >= TOTAL) elapsed = TOTAL;      // arrived: this frame is the held one
    }

    var t = elapsed;
    if (!jolted && t > CHARGE + SPOOL - 60 && t <= TOTAL) {
      jolted = true;
      cover.classList.add('is-jumped');       // the rule stays out from here on
      if (!reduce.matches) {
        cover.classList.add('is-warping');
        window.setTimeout(function () { cover.classList.remove('is-warping'); }, JUMP + 200);
      }
    }

    render(t, dt);

    /* the settled field is the last thing drawn; the loop stops here and the
       pixels simply stay on the canvas until a replay, resize or theme flip */
    if (elapsed >= TOTAL) {
      running = false;
      held = true;
      announce();
      button.disabled = false;
      cover.classList.remove('is-warping');
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  /* the drive has arrived: whatever wants to wake up on that can listen */
  function announce() {
    window.__warpHeld = true;
    if (window.CustomEvent) document.dispatchEvent(new CustomEvent('warp:held'));
  }

  /* pause leaves the pixels on the canvas; only the loop stops */
  function pause() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function resume() {
    if (running || held || !seeded) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function play() {
    cancelAnimationFrame(raf);
    readTheme();
    resize();
    seed();
    running = true;
    held = false;
    jolted = false;
    cover.classList.remove('is-jumped');
    button.disabled = true;
    canvas.classList.add('is-live');
    elapsed = 0;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  /* reduced motion: one static field, drawn once, so the cover still has a
     background without anything ever moving */
  function still() {
    readTheme();
    resize();
    seed();
    elapsed = TOTAL;
    held = true;
    cover.classList.add('is-jumped');
    canvas.classList.add('is-live');
    render(TOTAL, 0.016);
  }

  button.addEventListener('click', play);

  window.addEventListener('resize', function () {
    if (!seeded) return;
    resize();
    if (!running) render(elapsed, 0.016);       // repaint the held field
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause(); else resume();
  });

  /* the field is permanent now, so a theme flip has to recolour it in place
     rather than waiting for the next replay */
  if (window.MutationObserver) {
    new MutationObserver(function () {
      readTheme();
      if (!running && seeded) render(elapsed, 0.016);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      if (entries[entries.length - 1].isIntersecting) resume(); else pause();
    }, { threshold: 0 }).observe(cover);
  }

  resize();

  function autoplay() {
    if (H < 8 || W < 8) { window.setTimeout(autoplay, 400); return; }  // not laid out yet
    if (reduce.matches) still();                 // the button stays the way in
    else play();
  }

  /* The webfonts arrive after load and relayout the whole book when they swap
     in — a long task that would stall the animation mid-flight. Wait for them,
     but never longer than it takes to notice. */
  function arm() {
    var started = false;
    function go() {
      if (started) return;
      started = true;
      window.setTimeout(function () { resize(); autoplay(); }, 220);
    }
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(go);
      window.setTimeout(go, 2500);
    } else go();
  }

  if (document.readyState === 'complete') arm();
  else window.addEventListener('load', arm);
})();
