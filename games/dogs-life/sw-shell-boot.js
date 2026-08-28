/**
 * 外壳页（index.html）：等 __swReady 后再给 iframe 设置 data-src。
 *
 * 必填：data-iframe="myGameFrame"（iframe 元素的 id）
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var iframeId = script && script.dataset && script.dataset.iframe;
  if (!iframeId) {
    console.warn("[sw] sw-shell-boot.js: missing data-iframe");
    return;
  }

  var frame = document.getElementById(iframeId);
  var target = frame && frame.getAttribute("data-src");

  function start() {
    if (frame && target && !frame.src) {
      frame.src = target;
    }
  }

  var ready = window.__swReady;
  if (ready && typeof ready.then === "function") {
    ready.then(start, start);
  } else {
    start();
  }
})();
