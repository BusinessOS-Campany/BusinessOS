/**
 * Applies the stored theme before first paint.
 *
 * Why this is a file and not an inline <script> in the root layout: React 19
 * refuses to execute a <script> that a component renders on the client, and
 * replaces it with an inert <div><script></script></div> placeholder while
 * logging "Encountered a script tag while rendering React component". A
 * `type` attribute does not help - only the non-executable data-block types
 * skip that path. A script with `async` + `src` is the one shape React hoists
 * and executes correctly, so that is what the layout renders.
 *
 * This must run before first paint, because dark mode is a class-based variant
 * (`&:where(.dark, .dark *)`) rather than a `prefers-color-scheme` media query -
 * there is no CSS fallback that could cover for a late script. Keep it tiny and
 * keep it dependency-free: it is on the critical path to first paint.
 */
(function () {
  try {
    var root = document.documentElement;
    var stored = localStorage.getItem("bos_theme");
    if (stored === "light" || stored === "dark") {
      root.classList.add(stored);
      return;
    }
    if (!stored || window.matchMedia("(prefers-color-scheme: dark)").matches) {
      root.classList.add("dark");
    }
  } catch (e) {
    // Private-mode storage failures must not leave an unstyled page.
    document.documentElement.classList.add("dark");
  }
})();
