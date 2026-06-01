/**
 * 游戏页（game.html）：等 __swReady 后再动态加载入口脚本。
 *
 * 必填：data-entry="master-loader.js" | "bundle.js" 等
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var entry = script && script.dataset && script.dataset.entry;
  if (!entry) {
    console.warn("[sw] sw-game-boot.js: missing data-entry");
    return;
  }

  function loadGame() {
    var s = document.createElement("script");
    s.src = entry;
    document.body.appendChild(s);
  }

  var ready = window.__swReady;
  if (ready && typeof ready.then === "function") {
    ready.then(loadGame, loadGame);
  } else {
    loadGame();
  }
})();
