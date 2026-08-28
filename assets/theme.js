/* Theme toggle. Dark is the default and is set on <html> at build time, with a
   head script applying any stored choice before first paint, so neither theme
   flashes. The switch is a fixed control at the bottom left, outside the
   sheet's edge on any viewport wide enough to have a margin there. */

(function () {
  var root = document.documentElement;
  var KEY = 'wwc-theme';

  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'themetoggle';

  function apply(theme, store) {
    root.setAttribute('data-theme', theme);
    var dark = theme === 'dark';
    button.textContent = dark ? '◑' : '◐';
    button.title = dark ? 'Switch to light' : 'Switch to dark';
    button.setAttribute('aria-label', button.title);
    if (store) { try { localStorage.setItem(KEY, theme); } catch (e) {} }
  }

  apply(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark', false);

  button.addEventListener('click', function () {
    apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
  });

  document.body.appendChild(button);
})();
