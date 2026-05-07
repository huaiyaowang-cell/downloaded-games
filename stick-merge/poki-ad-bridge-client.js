/**
 * Stick Merge iframe ad bridge client.
 */
(function () {
  "use strict";

  function sealPokiSDK() {
    var sdk = window.PokiSDK;
    if (!sdk) return;
    try { Object.freeze(sdk); } catch (e) {}
    try {
      Object.defineProperty(window, "PokiSDK", {
        value: sdk,
        writable: false,
        configurable: false
      });
    } catch (e) {}
  }

  if (!window.PokiSDK) return;

  var parentWin;
  try { parentWin = window.parent; } catch (e) { parentWin = null; }
  if (!parentWin || parentWin === window) {
    sealPokiSDK();
    return;
  }

  var pending = Object.create(null);
  var POPUP_MIN_INTERVAL_MS = 60 * 1000;
  var lastPopupShownAt = 0;

  function genRequestId() {
    return Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
  }

  function postRequest(payload) {
    var requestId = genRequestId();
    return new Promise(function (resolve, reject) {
      pending[requestId] = { resolve: resolve, reject: reject };
      try {
        parentWin.postMessage({ type: "poki_ad_request", requestId: requestId, payload: payload || {} }, "*");
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

  var origCommercial = typeof PokiSDK.commercialBreak === "function" ? PokiSDK.commercialBreak.bind(PokiSDK) : null;
  var origRewarded = typeof PokiSDK.rewardedBreak === "function" ? PokiSDK.rewardedBreak.bind(PokiSDK) : null;
  var origDisplayAd = typeof PokiSDK.displayAd === "function" ? PokiSDK.displayAd.bind(PokiSDK) : null;
  var origDestroyAd = typeof PokiSDK.destroyAd === "function" ? PokiSDK.destroyAd.bind(PokiSDK) : null;
  var origGameplayStart = typeof PokiSDK.gameplayStart === "function" ? PokiSDK.gameplayStart.bind(PokiSDK) : null;
  var origGameplayStop = typeof PokiSDK.gameplayStop === "function" ? PokiSDK.gameplayStop.bind(PokiSDK) : null;

  PokiSDK.commercialBreak = function () {
    return postRequest({ kind: "commercialBreak" }).catch(function () {
      return origCommercial ? origCommercial() : Promise.resolve();
    });
  };

  PokiSDK.rewardedBreak = function () {
    return postRequest({ kind: "rewardedBreak" })
      .then(function (result) {
        return !!(result && result.rewardGranted);
      })
      .catch(function () {
        return origRewarded ? origRewarded() : Promise.resolve(false);
      });
  };

  PokiSDK.displayAd = function (container, size) {
    return postRequest({ kind: "displayBanner", size: size || "" }).catch(function () {
      return origDisplayAd ? origDisplayAd(container, size) : Promise.resolve();
    });
  };

  PokiSDK.destroyAd = function (container) {
    return postRequest({ kind: "destroyBanner" }).catch(function () {
      return origDestroyAd ? origDestroyAd(container) : Promise.resolve();
    });
  };

  PokiSDK.gameplayStart = function () {
    if (origGameplayStart) origGameplayStart();
    return Promise.resolve();
  };

  PokiSDK.gameplayStop = function () {
    if (origGameplayStop) origGameplayStop();
    var now = Date.now();
    if (lastPopupShownAt > 0 && now - lastPopupShownAt < POPUP_MIN_INTERVAL_MS) {
      return Promise.resolve({ skipped: true, reason: "popup_frequency_limited" });
    }
    return postRequest({ kind: "showPopupAd" }).catch(function () {
      return Promise.resolve();
    }).then(function (result) {
      lastPopupShownAt = Date.now();
      return result;
    });
  };

  sealPokiSDK();
})();
