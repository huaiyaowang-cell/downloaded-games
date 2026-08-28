/**
 * Cat Simulator — 父页面广告桥接（AdSense / adBreak）
 *
 * 相比 0.0.1：
 * 1. 打印 adBreak 的 breakStatus，便于区分「未填充 / 频次超限 / SDK 未就绪」
 * 2. 增加首响应超时兜底，避免 adBreakDone 不回调时游戏永久卡死；
 *    一旦 beforeAd 触发（广告真的开播）即取消超时，不打断正常播放
 */
(function () {
  "use strict";

  var gameFrame = document.getElementById("csGameFrame");

  // 仅用于「adBreak 完全无响应」的兜底；广告一旦开播即失效
  var AD_START_TIMEOUT_MS = 10000;

  function log() {
    try {
      var args = ["[poki-ad-parent]"].concat([].slice.call(arguments));
      console.log.apply(console, args);
    } catch (e) {}
  }

  function warn() {
    try {
      var args = ["[poki-ad-parent]"].concat([].slice.call(arguments));
      console.warn.apply(console, args);
    } catch (e) {}
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

  /**
   * executor(settle, adStarted)：
   *   settle(result)  —— 结束本次请求（只生效一次）
   *   adStarted()     —— 广告已开播，取消超时，之后无限等待 adBreakDone
   */
  function withAdStartTimeout(kind, timeoutResult, executor) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        timer = null;
        warn(kind + " 超时未响应（" + AD_START_TIMEOUT_MS + "ms），放行游戏继续");
        resolve(timeoutResult);
      }, AD_START_TIMEOUT_MS);

      function clearTimer() {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }

      function settle(result) {
        if (done) return;
        done = true;
        clearTimer();
        resolve(result);
      }

      function adStarted() {
        clearTimer();
      }

      try {
        executor(settle, adStarted);
      } catch (e) {
        warn(kind + " 执行异常:", e);
        settle(timeoutResult);
      }
    });
  }

  function showCommercialBreak() {
    return withAdStartTimeout("commercialBreak", {}, function (settle, adStarted) {
      if (!window.__googleAdsReady) {
        warn("commercialBreak 跳过：AdSense SDK 未就绪（常见原因：广告拦截插件）");
        return settle({});
      }
      if (typeof window.adBreak !== "function") {
        warn("commercialBreak 跳过：window.adBreak 不可用");
        return settle({});
      }

      log("commercialBreak 请求中…");
      window.adBreak({
        type: "browse",
        name: "cat-simulator-commercial",
        beforeAd: function () {
          adStarted();
          log("commercialBreak 广告开始播放");
        },
        afterAd: function () {
          log("commercialBreak 广告播放结束");
        },
        adBreakDone: function (placementInfo) {
          var status = placementInfo && placementInfo.breakStatus;
          log("commercialBreak adBreakDone, breakStatus =", status || "(空)");
          try { history.pushState(null, null, location.href); } catch (e) {}
          settle({});
        },
      });
    });
  }

  function showRewardedBreak() {
    return withAdStartTimeout("rewardedBreak", { rewardGranted: false }, function (settle, adStarted) {
      if (!window.__googleAdsReady) {
        warn("rewardedBreak 跳过：AdSense SDK 未就绪（常见原因：广告拦截插件）");
        return settle({ rewardGranted: false });
      }
      if (typeof window.adBreak !== "function") {
        warn("rewardedBreak 跳过：window.adBreak 不可用");
        return settle({ rewardGranted: false });
      }

      log("rewardedBreak 请求中…");
      window.adBreak({
        type: "reward",
        name: "cat-simulator-reward",
        beforeAd: function () {
          adStarted();
          log("rewardedBreak 广告开始播放");
        },
        afterAd: function () {
          log("rewardedBreak 广告播放结束");
        },
        beforeReward: function (showAdFn) {
          // 激励广告已备妥，此后等待用户看完，不再计超时
          adStarted();
          log("rewardedBreak 已备妥，展示激励广告");
          showAdFn && showAdFn();
        },
        adDismissed: function () {
          log("rewardedBreak 用户中途关闭，不发放奖励");
        },
        adViewed: function () {
          log("rewardedBreak 用户看完，发放奖励");
        },
        adBreakDone: function (placementInfo) {
          var status = placementInfo && placementInfo.breakStatus;
          var viewed = status === "viewed";
          log("rewardedBreak adBreakDone, breakStatus =", status || "(空)", "→ rewardGranted =", viewed);
          settle({ rewardGranted: viewed });
        },
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

  log("父页广告桥接已就绪 (0.0.2)");
})();
