/**
 * My Perfect Hotel — iframe 内游戏侧广告桥接
 * commercialBreak 在 iframe 内时经 postMessage 交给父页面；rewardedBreak 本地即时发奖。
 * 需在 poki-sdk-stub.js 之后、Unity loader 之前加载。
 */
(function () {
  "use strict";

  if (!window.PokiSDK) {
    console.warn("[poki-ad-client] PokiSDK 未定义，跳过桥接");
    return;
  }

  // 激励广告：不播广告，直接成功回调（game.html 直开与 index.html iframe 均生效）
  PokiSDK.rewardedBreak = function () {
    return Promise.resolve(true);
  };
  console.log("[poki-ad-client] rewardedBreak → 即时发奖（不播广告）");

  var parentWin;
  try {
    parentWin = window.parent;
  } catch (e) {
    parentWin = null;
  }
  if (!parentWin || parentWin === window) {
    console.log("[poki-ad-client] 非 iframe 环境，commercialBreak 使用 stub");
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
          {
            type: "poki_ad_request",
            requestId: requestId,
            payload: payload || {},
          },
          "*"
        );
      } catch (e) {
        delete pending[requestId];
        reject(e);
      }
    });
  }

  function onMessage(event) {
    var data = event && event.data;
    if (!data || data.type !== "poki_ad_response") return;
    var p = pending[data.requestId];
    if (!p) return;
    delete pending[data.requestId];
    if (data.ok) p.resolve(data.result || {});
    else p.reject(new Error(data.error || "poki_ad_request_failed"));
  }

  window.addEventListener("message", onMessage);

  var origCommercial =
    typeof PokiSDK.commercialBreak === "function"
      ? PokiSDK.commercialBreak.bind(PokiSDK)
      : null;

  PokiSDK.commercialBreak = function () {
    return postRequest({ kind: "commercialBreak" }).catch(function (err) {
      console.warn("[poki-ad-client] commercialBreak 失败，回退本地:", err);
      return origCommercial ? origCommercial() : Promise.resolve();
    });
  };

  console.log("[poki-ad-client] 已启用父页面广告代理（commercialBreak）");
})();

