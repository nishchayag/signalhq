/*!
 * SignalHQ embed loader. Plain ES5, no dependencies.
 *
 * Usage (place one <script> tag per widget — several may appear on the same
 * page):
 *   <script src="https://signal.example.com/embed.js" data-org="acme" async></script>
 *   <script src="https://signal.example.com/embed.js" data-question="ab12cd34" data-theme="dark" async></script>
 *
 * Security notes:
 * - The iframe's origin is taken from this script's own `src` (never from
 *   the host page's URL), so the widget always points at the real SignalHQ
 *   origin regardless of what page it's embedded on.
 * - Only `data-org` / `data-question` (slug-shaped strings) and `data-theme`
 *   (one of a fixed set) ever become part of the iframe's `src` — nothing
 *   from the host page's own URL (query string, hash, referrer) is ever
 *   forwarded into the frame.
 * - Inbound postMessages are accepted only from the exact iframe this
 *   script created, from the exact origin it was loaded from, and only the
 *   documented resize message shape — anything else is ignored.
 */
(function () {
  "use strict";

  var SLUG_RE = /^[a-z0-9-]{1,64}$/i;
  var THEMES = { light: 1, dark: 1, system: 1 };
  var DEFAULT_HEIGHT = 480;
  var MAX_HEIGHT = 4000;
  var PROCESSED_ATTR = "data-signalhq-embedded";
  var RESIZE_TYPE = "signalhq:resize";

  function originOf(scriptEl) {
    // scriptEl.src is always the browser-resolved absolute URL, even when
    // the tag's `src` attribute was written as a relative path.
    var src = scriptEl.src || "";
    var m = /^(https?:\/\/[^/]+)/i.exec(src);
    return m ? m[1] : "";
  }

  function validSlug(value) {
    return typeof value === "string" && SLUG_RE.test(value) ? value : null;
  }

  function validTheme(value) {
    return typeof value === "string" && THEMES.hasOwnProperty(value) ? value : null;
  }

  function parseHeight(value) {
    var n = parseInt(value, 10);
    return isFinite(n) && n > 0 ? n : DEFAULT_HEIGHT;
  }

  function buildSrc(origin, orgSlug, questionSlug, theme) {
    var path = questionSlug ? "/embed/q/" + questionSlug : "/embed/o/" + orgSlug;
    var query = theme ? "?theme=" + encodeURIComponent(theme) : "";
    return origin + path + query;
  }

  function processScript(scriptEl) {
    if (scriptEl.getAttribute(PROCESSED_ATTR) === "1") return;
    scriptEl.setAttribute(PROCESSED_ATTR, "1");

    var orgSlug = validSlug(scriptEl.getAttribute("data-org"));
    var questionSlug = validSlug(scriptEl.getAttribute("data-question"));
    if (!orgSlug && !questionSlug) return;

    var origin = originOf(scriptEl);
    if (!origin) return;

    var theme = validTheme(scriptEl.getAttribute("data-theme"));
    var height = parseHeight(scriptEl.getAttribute("data-height"));

    var iframe = document.createElement("iframe");
    iframe.src = buildSrc(origin, orgSlug, questionSlug, theme);
    iframe.title = "SignalHQ anonymous feedback";
    iframe.loading = "lazy";
    iframe.setAttribute("allow", "clipboard-write");
    // No `allow-top-navigation` or `allow-top-navigation-by-user-activation`:
    // the frame may never navigate the host page away. allow-popups(+escape)
    // is for the receipt link's "Open in new tab".
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    );
    iframe.style.width = "100%";
    iframe.style.height = height + "px";
    iframe.style.border = "0";
    iframe.style.display = "block";

    if (scriptEl.parentNode) {
      scriptEl.parentNode.insertBefore(iframe, scriptEl.nextSibling);
    } else {
      document.body.appendChild(iframe);
    }

    window.addEventListener("message", function (event) {
      if (event.source !== iframe.contentWindow) return;
      if (event.origin !== origin) return;
      var data = event.data;
      if (!data || data.type !== RESIZE_TYPE) return;
      var h = Number(data.height);
      if (!isFinite(h) || h <= 0) return;
      iframe.style.height = Math.min(h, MAX_HEIGHT) + "px";
    });
  }

  // The common case: this file was loaded from a single <script data-org|
  // data-question> tag, so document.currentScript (valid during synchronous
  // execution of a classic script, async or not) is that very tag.
  var current = document.currentScript;
  if (current && (current.hasAttribute("data-org") || current.hasAttribute("data-question"))) {
    processScript(current);
    return;
  }

  // Fallback for engines/load-orders where document.currentScript isn't
  // available (or several tags were inserted dynamically before any of them
  // ran): scan the page for any not-yet-processed matching tags. Each one
  // still resolves its own origin from its own `src`, so multiple widgets on
  // one page — including ones pointing at different SignalHQ deployments —
  // each get their own correctly scoped iframe.
  var all = document.querySelectorAll("script[data-org], script[data-question]");
  for (var i = 0; i < all.length; i++) {
    processScript(all[i]);
  }
})();
