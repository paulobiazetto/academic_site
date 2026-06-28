/* ===================================================================
   theme-init.js
   -------------------------------------------------------------------
   Apply saved theme/accent BEFORE first paint to avoid a flash.
   This script must stay synchronous in <head> (no defer/async) and
   inline-includable. It is shared by every page so the logic lives
   in ONE place.

   -------------------------------------------------------------------
   OLD LOGIC (system theme fallback) — kept for reference, no longer used:
   -------------------------------------------------------------------
   var t = localStorage.getItem("site-theme");
   var prefersDark = window.matchMedia &&
                     window.matchMedia("(prefers-color-scheme: dark)").matches;
   if (t === "dark" || (t === null && prefersDark)) {
     document.documentElement.setAttribute("data-theme", "dark");
   }

   That version followed the OS preference when the user had not
   explicitly chosen a theme. Since we want LIGHT as the site default,
   we no longer consult `prefers-color-scheme`.

   -------------------------------------------------------------------
   NEW LOGIC (light by default, dark only if the user explicitly chose it):
   -------------------------------------------------------------------
   var t = localStorage.getItem("site-theme");
   if (t === "dark") {
     document.documentElement.setAttribute("data-theme", "dark");
   }
   // Otherwise: do nothing — the page renders in the default (light) theme.

   The accent color (`site-accent`, a CSS custom property) is still
   applied if the user saved one, regardless of theme.
   =================================================================== */

(function applyInitialTheme() {
  try {
    var t = localStorage.getItem("site-theme");
    if (t === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }

    var a = localStorage.getItem("site-accent");
    if (a) document.documentElement.style.setProperty("--color-primary", a);
  } catch (e) {}
})();
