/**
 * Water Color Sort — 父页面广告桥接（count-war 流程：waitForSdk → adBreak → fallback）
 * localhost / 内网 / file 下 Google 常 403，adBreak 可能长时间无回调 → 直接走演示层，避免「没有任何弹出」。
 * 父页加 ?pokiRealAds=1 时仍先尝试真实 adBreak。
 */
(function () {
  "use strict";

  var gameFrame = document.getElementById("cwGameFrame");
  var ADBREAK_MS_COMMERCIAL = 22000;
  /** 真实激励可能较长，过短会 reject 后误进 fallback；与 count-war 一致用 120s */
  var ADBREAK_MS_REWARD = 120000;

  function isLikelyNoFillHost() {
    try {
      if (location.protocol === "file:") return true;
      var h = (location.hostname || "").toLowerCase();
      if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "") return true;
      if (/^192\.168\./.test(h)) return true;
      if (/^10\./.test(h)) return true;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    } catch (e) {}
    return false;
  }

  function forceRealAds() {
    try {
      return /(?:^|[?&])pokiRealAds=1(?:&|$)/.test(location.search || "");
    } catch (e) {
      return false;
    }
  }

  function useNoFillFastPath() {
    return isLikelyNoFillHost() && !forceRealAds();
  }

  function waitForSdk(ms) {
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      var id = setInterval(function () {
        if (window.__googleAdsReady && typeof window.adBreak === "function") {
          clearInterval(id);
          resolve();
        } else if (Date.now() - t0 > ms) {
          clearInterval(id);
          reject(new Error("sdk_timeout"));
        }
      }, 50);
    });
  }

  function showFallbackCommercial() {
    return new Promise(function (resolve) {
      var root = document.getElementById("__wcs_fallback_ad");
      if (root) try { root.remove(); } catch (e) {}
      root = document.createElement("div");
      root.id = "__wcs_fallback_ad";
      root.setAttribute("role", "dialog");
      root.style.cssText =
        "position:fixed;inset:0;z-index:2147483646;background:#121212;color:#eee;font-family:system-ui,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px;box-sizing:border-box;text-align:center;pointer-events:auto;";
      var title = document.createElement("div");
      title.style.cssText = "font-size:18px;font-weight:600;";
      title.textContent = "演示插屏广告（本地 / SDK 不可用）";
      var sub = document.createElement("div");
      sub.style.cssText = "font-size:14px;opacity:0.85;max-width:360px;line-height:1.4;";
      sub.textContent =
        "localhost 等环境 Network 里常见 ads?… 403，Google 不会弹出真实广告。此为演示层；上线请用已验证的 HTTPS 域名。";
      var row = document.createElement("div");
      row.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;justify-content:center;";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "关闭";
      btn.style.cssText =
        "cursor:pointer;padding:10px 20px;font-size:15px;border-radius:8px;border:0;background:#2d7dfa;color:#fff;";
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        try {
          clearTimeout(tmax);
        } catch (e2) {}
        try {
          root.remove();
        } catch (e3) {}
        resolve({});
      }
      var tmax = setTimeout(finish, 5000);
      btn.addEventListener("click", finish);
      row.appendChild(btn);
      root.appendChild(title);
      root.appendChild(sub);
      root.appendChild(row);
      document.body.appendChild(root);
    });
  }

  function showFallbackRewarded() {
    return new Promise(function (resolve) {
      var root = document.getElementById("__wcs_fallback_ad");
      if (root) try { root.remove(); } catch (e) {}
      root = document.createElement("div");
      root.id = "__wcs_fallback_ad";
      root.setAttribute("role", "dialog");
      root.style.cssText =
        "position:fixed;inset:0;z-index:2147483646;background:#121212;color:#eee;font-family:system-ui,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px;box-sizing:border-box;text-align:center;pointer-events:auto;";
      var title = document.createElement("div");
      title.style.cssText = "font-size:18px;font-weight:600;";
      title.textContent = "演示激励广告";
      var sub = document.createElement("div");
      sub.style.cssText = "font-size:14px;opacity:0.85;max-width:360px;line-height:1.4;";
      sub.textContent =
        "必须点击绿色「观看完毕」才会 +25；点「跳过」或关闭不会发奖。真实广告环境请看控制台 [poki-ad-parent] 日志。";
      var row = document.createElement("div");
      row.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;justify-content:center;";
      var btnWatch = document.createElement("button");
      btnWatch.type = "button";
      btnWatch.textContent = "观看完毕";
      btnWatch.style.cssText =
        "cursor:pointer;padding:10px 20px;font-size:15px;border-radius:8px;border:0;background:#2a9d3a;color:#fff;";
      var btnSkip = document.createElement("button");
      btnSkip.type = "button";
      btnSkip.textContent = "跳过";
      btnSkip.style.cssText =
        "cursor:pointer;padding:10px 20px;font-size:15px;border-radius:8px;border:1px solid #555;background:transparent;color:#ccc;";
      var done = false;
      function finish(granted) {
        if (done) return;
        done = true;
        try {
          clearTimeout(tmax);
        } catch (e2) {}
        try {
          root.remove();
        } catch (e3) {}
        resolve({ rewardGranted: !!granted });
      }
      var tmax = setTimeout(function () {
        finish(true);
      }, 8000);
      btnWatch.addEventListener("click", function () {
        finish(true);
      });
      btnSkip.addEventListener("click", function () {
        finish(false);
      });
      row.appendChild(btnWatch);
      row.appendChild(btnSkip);
      root.appendChild(title);
      root.appendChild(sub);
      root.appendChild(row);
      document.body.appendChild(root);
    });
  }

  function tryAdBreakCommercial() {
    return new Promise(function (resolve, reject) {
      if (!window.__googleAdsReady || typeof window.adBreak !== "function") {
        reject(new Error("sdk_not_ready"));
        return;
      }
      var settled = false;
      var to = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error("adbreak_timeout"));
      }, ADBREAK_MS_COMMERCIAL);
      window.adBreak({
        type: "browse",
        name: "water-color-sort-commercial",
        beforeAd: function () {},
        afterAd: function () {},
        adBreakDone: function () {
          if (settled) return;
          settled = true;
          try {
            clearTimeout(to);
          } catch (e) {}
          try {
            history.pushState(null, null, location.href);
          } catch (e2) {}
          resolve({});
        },
      });
    });
  }

  function tryAdBreakRewarded() {
    return new Promise(function (resolve, reject) {
      if (!window.__googleAdsReady || typeof window.adBreak !== "function") {
        reject(new Error("sdk_not_ready"));
        return;
      }
      var settled = false;
      var rewardEarnedByViewCallback = false;
      var dismissedEarly = false;
      var to = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error("adbreak_timeout"));
      }, ADBREAK_MS_REWARD);
      function normStatus(x) {
        if (x == null || x === "") return "";
        return String(x).toLowerCase().replace(/-/g, "").replace(/_/g, "");
      }
      function grantFromPlacement(pi) {
        pi = pi || {};
        var st = pi.breakStatus != null ? pi.breakStatus : pi.break_status;
        var stn = normStatus(st);
        /** 文档：viewed；部分环境 adBreakDone 早于 adViewed，故以 adViewed 为准；另兼容常见别名 */
        return (
          rewardEarnedByViewCallback ||
          stn === "viewed" ||
          stn === "rewarded" ||
          stn === "granted" ||
          stn === "playbackcompleted" ||
          stn === "completed" ||
          stn === "finished"
        );
      }
      function finishReward(placementInfo, deferredMs) {
        if (settled) return;
        var pi = placementInfo || {};
        var grant = grantFromPlacement(pi);
        /** 即将拒奖时再等一帧：部分实现里 adViewed 晚于 adBreakDone */
        if (!grant && !dismissedEarly && deferredMs != null) {
          setTimeout(function () {
            if (settled) return;
            settled = true;
            try {
              clearTimeout(to);
            } catch (e) {}
            try {
              history.pushState(null, null, location.href);
            } catch (e2) {}
            var grant2 = grantFromPlacement(pi);
            if (!grant2 && !dismissedEarly) {
              try {
                console.info(
                  "[poki-ad-parent] 激励未发奖: breakStatus=" +
                    String(pi.breakStatus != null ? pi.breakStatus : pi.break_status) +
                    " adViewed=" +
                    rewardEarnedByViewCallback +
                    " dismissedEarly=" +
                    dismissedEarly +
                    " placement=" +
                    JSON.stringify(pi)
                );
              } catch (logE) {}
            }
            resolve({ rewardGranted: !!grant2 });
          }, deferredMs);
          return;
        }
        settled = true;
        try {
          clearTimeout(to);
        } catch (e) {}
        try {
          history.pushState(null, null, location.href);
        } catch (e2) {}
        if (!grant && !dismissedEarly) {
          try {
            console.info(
              "[poki-ad-parent] 激励未发奖: breakStatus=" +
                String(pi.breakStatus != null ? pi.breakStatus : pi.break_status) +
                " adViewed=" +
                rewardEarnedByViewCallback +
                " dismissedEarly=" +
                dismissedEarly +
                " placement=" +
                JSON.stringify(pi)
            );
          } catch (logE) {}
        }
        resolve({ rewardGranted: !!grant });
      }
      window.adBreak({
        type: "reward",
        name: "water-color-sort-reward-" + Date.now().toString(36),
        beforeAd: function () {},
        afterAd: function () {},
        beforeReward: function (showAdFn) {
          showAdFn && showAdFn();
        },
        /** 勿在此 resolve：部分环境 adDismissed 早于 adBreakDone，会锁死 settled 导致看完也不发奖 */
        adDismissed: function () {
          dismissedEarly = true;
        },
        adViewed: function () {
          rewardEarnedByViewCallback = true;
          /** 若 SDK 先调 adViewed 再调 adBreakDone，可提前发奖；若顺序相反由 adBreakDone / 延迟路径处理 */
          if (!settled) {
            finishReward({}, null);
          }
        },
        adBreakDone: function (placementInfo) {
          if (settled) return;
          var grantNow = grantFromPlacement(placementInfo);
          if (grantNow) {
            finishReward(placementInfo, null);
            return;
          }
          finishReward(placementInfo, 120);
        },
      });
    });
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

  function showCommercialBreak() {
    if (useNoFillFastPath()) {
      console.info("[poki-ad-parent] 无填充环境 → 直接演示插屏（跳过易 403 的 adBreak）");
      return showFallbackCommercial();
    }
    return tryAdBreakCommercial()
      .catch(function () {
        return waitForSdk(10000).then(tryAdBreakCommercial);
      })
      .catch(function () {
        return showFallbackCommercial();
      });
  }

  function showRewardedBreak() {
    if (useNoFillFastPath()) {
      console.info("[poki-ad-parent] 无填充环境 → 直接演示激励（跳过易 403 的 adBreak）");
      return showFallbackRewarded();
    }
    return tryAdBreakRewarded()
      .catch(function () {
        return waitForSdk(10000).then(tryAdBreakRewarded);
      })
      .catch(function () {
        return showFallbackRewarded();
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
