/**
 * My Perfect Hotel — 父页面广告桥接（AdSense / adBreak）
 * 由 index.html 加载：响应 iframe 内游戏通过 postMessage 发来的 Poki 广告请求。
 */
(function () {
  "use strict";

  var gameFrame = document.getElementById("mphGameFrame");

  function sendResponse(event, requestId, ok, result, error) {
    try {
      if (!event || !event.source || typeof event.source.postMessage !== "function")
        return;
      event.source.postMessage(
        {
          type: "poki_ad_response",
          requestId: requestId,
          ok: !!ok,
          result: result || {},
          error: error || null,
        },
        "*"
      );
    } catch (e) {}
  }

  function showCommercialBreak() {
    return new Promise(function (resolve) {
      if (typeof window.adBreak !== "function") {
        console.warn("[poki-ad-parent] adBreak 不可用，跳过 commercialBreak");
        resolve({});
        return;
      }
      window.adBreak({
        type: "browse",
        name: "my-perfect-hotel-commercial",
        beforeAd: function () {},
        afterAd: function () {},
        adBreakDone: function (placementInfo) {
          history.pushState(null, null, location.href);
          console.log(
            "[poki-ad-parent] commercial adBreakDone:",
            placementInfo && placementInfo.breakStatus
          );
          resolve({});
        },
      });
    });
  }

  function showRewardedBreak() {
    return new Promise(function (resolve, reject) {
      if (typeof window.adBreak !== "function") {
        console.warn("[poki-ad-parent] adBreak 不可用，跳过 rewardedBreak（视为已发奖）");
        resolve({ rewardGranted: true });
        return;
      }
      window.adBreak({
        type: "reward",
        name: "my-perfect-hotel-reward",
        beforeAd: function () {},
        afterAd: function () {},
        beforeReward: function (showAdFn) {
          showAdFn && showAdFn();
        },
        adDismissed: function () {},
        adViewed: function () {},
        adBreakDone: function (placementInfo) {
          var viewed = placementInfo && placementInfo.breakStatus === "viewed";
          if (viewed) {
            history.pushState(null, null, location.href);
            resolve({ rewardGranted: true });
          } else if (placementInfo && placementInfo.breakStatus === "dismissed") {
            history.pushState(null, null, location.href);
            reject({ rewardGranted: false });
          } else {
            reject({ rewardGranted: false });
          }
        },
      });
    });
  }

  function handlePokiAdRequest(payload) {
    payload = payload || {};
    var kind = payload.kind;
    switch (kind) {
      case "commercialBreak":
        return showCommercialBreak();
      case "rewardedBreak":
        return showRewardedBreak();
      default:
        return Promise.reject(new Error("invalid_poki_ad_kind"));
    }
  }

  window.addEventListener("message", function (event) {
    var data = event && event.data;
    if (!data || data.type !== "poki_ad_request") return;
    if (gameFrame && gameFrame.contentWindow && event.source !== gameFrame.contentWindow) {
      return;
    }

    var requestId = data.requestId;
    if (requestId == null) return;

    handlePokiAdRequest(data.payload)
      .then(function (result) {
        sendResponse(event, requestId, true, result, null);
      })
      .catch(function (err) {
        sendResponse(
          event,
          requestId,
          false,
          {},
          err && err.message ? err.message : String(err)
        );
      });
  });
})();

