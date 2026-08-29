/* Cover warp jump. The canvas backing store is one pixel per block and CSS
   scales it up with image-rendering: pixelated, so every star is a real pixel
   rather than a drawn square.

   The jump runs once on load and then decays into a drift the field keeps
   forever, so the cover always has a sky. The drift has a floor: below about
   one block of travel per rendered frame a star holds still and then jumps a
   whole block, which stutters, so frames are pooled to a fixed 60 a second and
   the decay bottoms out above that line. Under reduced motion a single static
   field is drawn instead. */

(function () {
  var cover = document.querySelector('.cover');
  if (!cover || !window.requestAnimationFrame) return;

  var CELL = 4;                       // css px per pixel block
  var HUE = ['232,89,12', '184,67,10', '28,25,23'];   // orange, deep, ink

  /* A phone's cover is edge to edge, so the short side of the viewport is
     close to the phone's screen width whichever way it's held. Block count
     (W * H) alone doesn't catch that: a tall narrow phone cover carries as
     many blocks as a short wide desktop hero, so it hit the same star cap
     and did full desktop-weight per-frame work on a phone CPU.
     navigator.deviceMemory is unset on iOS Safari, so its absence has to
     read as "unknown", not as "plenty" — it only ever pulls the cap down. */
  var shortSide = Math.min(window.innerWidth || 1200, window.innerHeight || 900);
  var lowCores = (navigator.hardwareConcurrency || 8) <= 4;
  var lowMem = !!navigator.deviceMemory && navigator.deviceMemory <= 4;
  var STAR_CAP = shortSide <= 480 ? 110 : (shortSide <= 820 ? 190 : 300);
  var MOBILE = shortSide <= 480 || lowCores || lowMem;
  if (MOBILE) STAR_CAP = Math.min(STAR_CAP, 130);

  /* phase lengths, ms: tremble, spool up, the jump itself, coast down */
  var CHARGE = 700, SPOOL = 800, JUMP = 420, SETTLE = 1600;
  var TOTAL = CHARGE + SPOOL + JUMP + SETTLE;

  /* The field never stops: it decays into a slow drift and keeps floating.
     CRUISE_WARP is a floor, not a crawl — stars sit on a 4px grid, so below
     about one block of travel per rendered frame a star holds still and then
     jumps a whole block, which is what stutters. The decay bottoms out above
     that line and stays there. */
  var CRUISE_WARP = 0.45, CRUISE_ALPHA = 0.6;

  /* The drift used to ease down to a much slower float over the four seconds
     after arrival. Held against the widened gate below it broke the floor the
     line above describes: at 20 renders a second a star at radius 40 traveled
     0.45 of a block per rendered frame and one at radius 100 traveled 0.99,
     so the whole field froze and hopped a block every quarter second. Either
     optimization is safe alone; the two are not safe together. The drift stays
     at CRUISE_WARP. */

  /* Rendered at a fixed 60 a second whatever the display does. A 120Hz panel
     was halving the travel per frame, dropping the drift under the pixel grid
     exactly where the settle slows — and doing twice the work to do it. */
  var FRAME = 1 / 75;    // gate: 60Hz passes every frame, 120Hz every other

  /* Once arrived, nobody is timing this against a clock — it's a permanent
     background tax competing with scroll and the shooter minigame. Render a
     third as often past that point (a tenth on a phone) and let the pooled
     step below grow to match: the same real time lands in fewer, larger
     steps, so each rendered frame still clears the one-block floor instead
     of crawling under it and stuttering. */
  var DRIFT_FRAME = MOBILE ? 1 / 10 : 1 / 24;

  /* The jump's visible streak length is the whole point of the burst; the
     drift's is not — at cruise a step is a few blocks at most, well under the
     cap. A phone doesn't need 32 samples to read as continuous at 4px a block,
     so the cap that only ever binds during the burst (an edge star under full
     warp) can drop by more than half there and cost nothing the eye can find
     during the slow drift after. */
  var STEP_CAP = MOBILE ? 14 : 32;

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
  var raf = 0, elapsed = 0, last = 0, running = false, seeded = false;
  var arrived = false, motionless = false, acc = 0;

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
    for (i = 0; i < 3; i++) {
      var parts = HUE[i].split(',');
      RGB[i] = [parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, parseInt(parts[2], 10) || 0];
    }
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
    img = ctx.createImageData(W, H);
    data = img.data;
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
    var count = Math.min(STAR_CAP, Math.max(Math.round(STAR_CAP * 0.3), Math.round(W * H / 26)));
    stars = [];
    for (var i = 0; i < count; i++) stars.push(star(Math.random() * maxR));
    seeded = true;
  }

  /* warp factor over the sequence: a tremor while charging, a cubed ramp while
     spooling, a hard spike on the jump, an eased coast down — then cruise */
  function warpAt(t) {
    if (t >= TOTAL) return CRUISE_WARP;
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
    return CRUISE_WARP + 8.6 * Math.pow(1 - d, 3);
  }

  /* fades up at the start, then down to the drifting level — never to nothing */
  function alphaAt(t) {
    if (t >= TOTAL) return CRUISE_ALPHA;
    var inn = Math.min(1, t / 260);
    var tail = CHARGE + SPOOL + JUMP + SETTLE * 0.45;
    if (t < tail) return inn;
    var d = Math.min(1, (t - tail) / (SETTLE * 0.55));
    return inn * (1 - (1 - CRUISE_ALPHA) * d);
  }

  /* One fillRect per block meant thousands of canvas calls in the frames
     either side of the jump. The field is written into a pixel buffer instead
     and blitted once, so a frame is one canvas call whatever the star count.
     Bytes are composited by hand because putImageData replaces rather than
     blends, and overlapping streaks have to add up. */
  var img = null, data = null;
  var RGB = [[232, 89, 12], [184, 67, 10], [28, 25, 23]];

  function block(x, y, hueIdx, a) {
    x |= 0; y |= 0;
    if (a <= 0.02 || x < 0 || y < 0 || x >= W || y >= H) return;
    if (a > 1) a = 1;
    var c = RGB[hueIdx], i = (y * W + x) * 4, da = data[i + 3] / 255;
    if (da === 0) {
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = a * 255;
      return;
    }
    var oa = a + da * (1 - a), f = a / oa, g = da * (1 - a) / oa;
    data[i]     = c[0] * f + data[i]     * g;
    data[i + 1] = c[1] * f + data[i + 1] * g;
    data[i + 2] = c[2] * f + data[i + 2] * g;
    data[i + 3] = oa * 255;
  }

  function ring(radius, a) {
    if (radius < 1 || a <= 0.02) return;
    ctx.fillStyle = 'rgba(' + HUE[0] + ',' + (a > 1 ? 1 : a) + ')';
    var step = 1.4 / radius;   // thinner ring, ~30% fewer blocks
    for (var t = 0; t < Math.PI * 2; t += step) {
      ctx.fillRect((cx + Math.cos(t) * radius) | 0, (cy + Math.sin(t) * radius) | 0, 1, 1);
    }
  }

  function render(t, dt) {
    var w = warpAt(t);
    var alpha = alphaAt(t);
    data.fill(0);

    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      var pr = st.r;
      st.r += (0.35 + w * st.s * (2 + st.r * 0.9)) * dt * 4;

      /* the streak: sampled blocks from the old radius to the new one, capped
         so an extreme warp factor cannot blow up the per-frame draw count. */
      var len = st.r - pr;
      var steps = Math.min(STEP_CAP, Math.max(1, Math.round(len)));
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

    ctx.putImageData(img, 0, 0);          // the whole field, in one call

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

    /* A 120Hz panel delivers twice the frames, which halved the travel per
       frame and dropped the drift under the pixel grid — the stutter near the
       end — while doing twice the work. Frames are pooled to a 60th of a
       second so a rendered step is the same everywhere. Past arrival the gate
       widens (see DRIFT_FRAME above): the pooled step grows by the same
       factor the render rate drops by, so the field drifts at the same speed
       for a fraction of the render() calls. */
    acc += dt;
    var gate = arrived ? DRIFT_FRAME : FRAME;
    if (acc < gate) { raf = requestAnimationFrame(frame); return; }
    var step = acc;
    acc = 0;

    if (elapsed < TOTAL) {
      elapsed += step * 1000;
      if (elapsed >= TOTAL) elapsed = TOTAL;
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

    render(t, step);
    if (!arrived && elapsed >= TOTAL) {
      arrived = true;
      announce();
      button.disabled = false;
      cover.classList.remove('is-warping');
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
    if (running || motionless || !seeded) return;
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
    arrived = false;
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
    arrived = true;
    motionless = true;                      // no loop may start behind this
    announce();
    cover.classList.add('is-jumped');
    canvas.classList.add('is-live');
    render(TOTAL, 0.016);
  }

  button.addEventListener('click', play);

  window.addEventListener('resize', function () {
    if (!seeded) return;
    resize();
    if (!running) render(elapsed, 0.016);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (arrived) pause(); } else resume();
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
      if (entries[entries.length - 1].isIntersecting) resume();
      else if (arrived) pause();          // never pause mid-sequence: the end unlocks things
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
