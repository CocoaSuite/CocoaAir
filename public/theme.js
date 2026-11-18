// Applies the theme before the first paint, so the page never flashes the wrong colours.
// A saved choice wins; otherwise the device's own light or dark setting decides.
try {
  var saved = localStorage.getItem('ca-theme');
  var light = saved ? saved === 'light' : window.matchMedia('(prefers-color-scheme: light)').matches;
  if (light) {
    document.documentElement.classList.add('light');
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#f3f5f9');
  }
} catch (e) {}
