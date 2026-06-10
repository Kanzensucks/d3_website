// GenAI-assisted (Claude)
// Shared light/dark toggle for the Home and About pages.
// The chart pages have their own toggle buttons wired the same way;
// all of them read/write the 'rc-theme' localStorage key so the
// choice persists across every page of the site.
(function () {
  var btn = document.querySelector('.nav-theme-btn');
  if (!btn) return;
  function glyph() {
    btn.textContent = document.documentElement.dataset.theme === 'dark' ? '☀' : '🌙';
  }
  glyph();
  btn.addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('rc-theme', next); } catch (e) {}
    glyph();
  });
})();
