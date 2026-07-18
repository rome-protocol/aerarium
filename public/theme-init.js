// Aerarium is light-only — the landing brings its own dark treatment per-surface,
// so there is no user light/dark toggle. Force data-theme=light before first paint
// (the complete light token set lives in globals.css html[data-theme="light"];
// the editorial palette/type layers on top via app/aerarium-tokens.css).
(function () {
  document.documentElement.setAttribute("data-theme", "light");
})();
