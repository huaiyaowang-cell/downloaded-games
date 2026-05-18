/**
 * Count War — iframe 内游戏侧广告桥接（与 happy-glass 同款）
 */
(function () {
  "use strict";

  if (!window.PokiSDK) {
    console.warn("[poki-ad-client] PokiSDK 未定义，跳过桥接");
    return;
  }

  var parentWin;
  try {
    parentWin = window.parent;
  } catch (e) {
    parentWin = null;
  }
  if (!parentWin || parentWin === window) {
    console.log("[poki-ad-client] 非 iframe 环境，使用本地 stub 广告逻辑");
    return;
  }

  var pending = Object.create(null);

  function genRequestId() {
    return Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
  }

  function postRequest(payload) {
    var requestId = genRequestId();
    return new Promise(function (resolve, reject) {
      pending[requestId] = { resolve: resolve, reject: reject };
      try {
        parentWin.postMessage(
          { type: "poki_ad_request", requestId: requestId, payload: payload || {} },
          "*"
        );
      } catch (e) {
        delete pending[requestId];
        reject(e);
      }
    });
  }

  window.addEventListener("message", function (event) {
    var data = event && event.data;
    if (!data || data.type !== "poki_ad_response") return;
    var p = pending[data.requestId];
    if (!p) return;
    delete pending[data.requestId];
    if (data.ok) p.resolve(data.result || {});
    else p.reject(new Error(data.error || "poki_ad_request_failed"));
  });

  var origCommercial =
    typeof PokiSDK.commercialBreak === "function"
      ? PokiSDK.commercialBreak.bind(PokiSDK)
      : null;

  var origRewarded =
    typeof PokiSDK.rewardedBreak === "function"
      ? PokiSDK.rewardedBreak.bind(PokiSDK)
      : null;

  PokiSDK.commercialBreak = function () {
    return postRequest({ kind: "commercialBreak" }).catch(function (err) {
      console.warn("[poki-ad-client] commercialBreak 失败，回退本地:", err);
      return origCommercial ? origCommercial() : Promise.resolve();
    });
  };

  PokiSDK.rewardedBreak = function (arg) {
    if (arg && typeof arg === "object" && typeof arg.onStart === "function") {
      try { arg.onStart(); } catch (e0) {}
    }
    return postRequest({ kind: "rewardedBreak" })
      .then(function (result) {
        var granted = !!(result && result.rewardGranted);
        if (typeof arg === "function") {
          try { arg(granted); } catch (e) {}
        } else if (arg && typeof arg === "object") {
          if (typeof arg.onComplete === "function") {
            try { arg.onComplete(granted); } catch (e2) {}
          } else if (typeof arg.finished === "function") {
            try { arg.finished(granted); } catch (e3) {}
          }
        }
        return granted;
      })
      .catch(function (err) {
        console.warn("[poki-ad-client] rewardedBreak 失败，回退本地:", err);
        return origRewarded ? origRewarded(arg) : Promise.resolve(false);
      });
  };
})();
