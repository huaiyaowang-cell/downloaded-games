/**
 * 游玩过程中定时触发插屏（PokiSDK.commercialBreak → 父页 adBreak / 演示层）
 *
 * 配置（在引入本脚本之前设置）：
 *   window.__WCS_GAMEPLAY_ADS__ = {
 *     interstitialSec: 0,     // 0 = 关闭定时插屏；>0 = 每隔多少秒尝试一次（仅 Main 关卡场景）
 *     minGapMs: 60000,        // 两次插屏之间最少间隔，避免叠在一起
 *   };
 *
 * 说明：本包内过关等仍会走原有 ads.showInter（插屏）；激励（reward）仅建议保留在商店等
 * 玩家主动点击处，不在此脚本里自动弹出。
 */
(function () {
  "use strict";

  var cfg = window.__WCS_GAMEPLAY_ADS__ || {};
  var interstitialSec = typeof cfg.interstitialSec === "number" ? cfg.interstitialSec : 0;
  var minGapMs = typeof cfg.minGapMs === "number" ? cfg.minGapMs : 60000;

  if (interstitialSec <= 0) {
    console.log("[gameplay-ad-hooks] 定时插屏未启用（__WCS_GAMEPLAY_ADS__.interstitialSec <= 0）");
    return;
  }

  var lastAdAt = 0;
  var running = false;

  function inMainGameScene() {
    try {
      if (typeof cc === "undefined" || !cc.director) return false;
      var sc = cc.director.getScene();
      if (!sc || !sc.name) return false;
      return sc.name === "Main";
    } catch (e) {
      return false;
    }
  }

  function tryInterstitial() {
    if (running) return;
    if (!inMainGameScene()) return;
    if (!window.PokiSDK || typeof PokiSDK.commercialBreak !== "function") return;
    var now = Date.now();
    if (now - lastAdAt < minGapMs) return;
    running = true;
    Promise.resolve()
      .then(function () {
        return PokiSDK.commercialBreak();
      })
      .catch(function () {})
      .then(function () {
        lastAdAt = Date.now();
        running = false;
      });
  }

  function waitEngine() {
    if (typeof cc === "undefined" || !cc.director) {
      setTimeout(waitEngine, 400);
      return;
    }
    setInterval(tryInterstitial, interstitialSec * 1000);
    console.log(
      "[gameplay-ad-hooks] 已启用过程插屏：每 " +
        interstitialSec +
        "s（仅 Main 场景），最小间隔 " +
        minGapMs +
        "ms"
    );
  }

  setTimeout(waitEngine, 2500);
})();
