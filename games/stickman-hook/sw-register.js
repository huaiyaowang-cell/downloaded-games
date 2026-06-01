/**
 * 注册当前游戏目录下的 sw.js，并暴露 window.__swReady (Promise<boolean>)。
 *
 * 通过引入脚本的 data-* 配置（均为可选）：
 *   data-sw-url="./sw.js"
 *   data-scope="./"
 *   data-timeout="5000"
 *   data-label="index" | "game"
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var swUrl = "./sw.js";
  var scope = "./";
  var timeoutMs = 5000;
  var label = "page";

  if (script && script.dataset) {
    if (script.dataset.swUrl) swUrl = script.dataset.swUrl;
    if (script.dataset.scope) scope = script.dataset.scope;
    if (script.dataset.timeout) {
      var parsed = parseInt(script.dataset.timeout, 10);
      if (!isNaN(parsed) && parsed > 0) timeoutMs = parsed;
    }
    if (script.dataset.label) label = script.dataset.label;
  }

  window.__swReady = new Promise(function (resolve) {
    if (!("serviceWorker" in navigator)) {
      console.warn("[sw] not supported (" + label + ")");
      resolve(false);
      return;
    }

    var settled = false;
    function done(ok) {
      if (settled) return;
      settled = true;
      resolve(!!ok);
    }

    try {
      navigator.serviceWorker
        .register(swUrl, { scope: scope, updateViaCache: "none" })
        .then(function (reg) {
          console.log("[sw] registered (" + label + "), scope=" + reg.scope);
          try { reg.update(); } catch (_) { /* ignore */ }

          if (navigator.serviceWorker.controller) {
            console.log(
              "[sw] controlled by existing worker (" + label + "), scriptURL=" +
              navigator.serviceWorker.controller.scriptURL
            );
            done(true);
            return;
          }
          navigator.serviceWorker.ready.then(function () {
            if (navigator.serviceWorker.controller) {
              console.log(
                "[sw] ready (" + label + "), scriptURL=" +
                navigator.serviceWorker.controller.scriptURL
              );
            } else {
              console.log("[sw] ready but no controller yet (" + label + ")");
            }
            done(true);
          });
        })
        .catch(function (err) {
          console.warn("[sw] register failed (" + label + "):", err);
          done(false);
        });
    } catch (err) {
      console.warn("[sw] register threw (" + label + "):", err);
      done(false);
    }

    setTimeout(function () {
      done(false);
    }, timeoutMs);
  });
})();
