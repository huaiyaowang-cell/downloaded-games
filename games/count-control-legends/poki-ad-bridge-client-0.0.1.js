/**
 * Count Control Legends - iframe 内游戏侧广告桥接
 * 将 PokiSDK.commercialBreak / rewardedBreak 通过 postMessage 交给父页面执行。
 */
(function () {
  "use strict";

  function sealPokiSDK() {
    var sdk = window.PokiSDK;
    if (!sdk) return;
    try {
      Object.freeze(sdk);
    } catch (e) {}
    try {
      Object.defineProperty(window, "PokiSDK", {
        value: sdk,
        writable: false,
        configurable: false,
      });
    } catch (e) {}
  }

  if (!window.PokiSDK) {
    console.warn("[poki-ad-client] PokiSDK undefined, skip bridge");
    return;
  }

  var parentWin;
  try {
    parentWin = window.parent;
  } catch (e) {
    parentWin = null;
  }
  if (!parentWin || parentWin === window) {
    console.log("[poki-ad-client] non-iframe env, fallback to local stub");
    sealPokiSDK();
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
      console.warn("[poki-ad-client] commercialBreak failed, fallback local:", err);
      return origCommercial ? origCommercial() : Promise.resolve();
    });
  };

  PokiSDK.rewardedBreak = function () {
    return postRequest({ kind: "rewardedBreak" })
      .then(function (result) {
        return !!(result && result.rewardGranted);
      })
      .catch(function (err) {
        console.warn("[poki-ad-client] rewardedBreak failed, fallback false:", err);
        return Promise.resolve(false);
      });
  };

  sealPokiSDK();
  console.log("[poki-ad-client] parent ad bridge enabled, PokiSDK sealed");
})();
