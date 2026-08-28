/**
 * candy-packing-store-yat — 父页面广告桥接（AdSense / adBreak）
 */
(function () {
  "use strict";

  var gameFrame = document.getElementById("hgGameFrame");

  function isOfflineEnvironment() {
    var isFileProtocol = false;
    try {
      isFileProtocol = window.location && window.location.protocol === "file:";
    } catch (e) {}
    return isFileProtocol || (typeof navigator !== "undefined" && navigator.onLine === false);
  }

  function sendResponse(event, requestId, ok, result, error) {
    try {
      if (!event || !event.source || typeof event.source.postMessage !== "function") return;
      event.source.postMessage(
        { type: "poki_ad_response", requestId: requestId, ok: !!ok, result: result || {}, error: error || null },
        "*"
      );
    } catch (e) {}
  }

  // 直接等 window.adBreak 真正可用（最多 waitMs），不再依赖 __googleAdsReady 这个
  // 易与 async 的 adsbygoogle.js 竞态(load 事件早于监听挂载)而永远为 false 的标志。
  function whenAdBreakReady(waitMs) {
    return new Promise(function (resolve) {
      var deadline = Date.now() + (waitMs || 6000);
      (function check() {
        if (typeof window.adBreak === "function") return resolve(true);
        if (Date.now() >= deadline) return resolve(false);
        setTimeout(check, 200);
      })();
    });
  }

  function showCommercialBreak() {
    return whenAdBreakReady(6000).then(function (ready) {
      if (!ready) return {};
      return new Promise(function (resolve) {
        window.adBreak({
          type: "browse",
          name: "candy-packing-store-yat-commercial",
          beforeAd: function () {},
          afterAd: function () {},
          adBreakDone: function () {
            try { history.pushState(null, null, location.href); } catch (e) {}
            resolve({});
          },
        });
      });
    });
  }

  function showRewardedBreak() {
    return whenAdBreakReady(6000).then(function (ready) {
      if (!ready) return { rewardGranted: false };
      return new Promise(function (resolve) {
        window.adBreak({
          type: "reward",
          name: "candy-packing-store-yat-reward",
          beforeAd: function () {},
          afterAd: function () {},
          beforeReward: function (showAdFn) {
            showAdFn && showAdFn();
          },
          adDismissed: function () {},
          adViewed: function () {},
          adBreakDone: function (placementInfo) {
            var viewed = placementInfo && placementInfo.breakStatus === "viewed";
            if (viewed) resolve({ rewardGranted: true });
            else resolve({ rewardGranted: false });
          },
        });
      });
    });
  }

  function handle(payload) {
    payload = payload || {};
    if (payload.kind === "commercialBreak") return showCommercialBreak();
    if (payload.kind === "rewardedBreak") return showRewardedBreak();
    return Promise.reject(new Error("invalid_poki_ad_kind"));
  }

  window.addEventListener("message", function (event) {
    var data = event && event.data;
    if (!data || data.type !== "poki_ad_request") return;
    if (gameFrame && gameFrame.contentWindow && event.source !== gameFrame.contentWindow) return;
    if (data.requestId == null) return;

    handle(data.payload)
      .then(function (result) { sendResponse(event, data.requestId, true, result, null); })
      .catch(function (err) {
        sendResponse(event, data.requestId, false, {}, err && err.message ? err.message : String(err));
      });
  });
})();

