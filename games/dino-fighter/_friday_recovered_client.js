/**
 * Dino Fighter — iframe 广告桥接（happy-glass + Unity 发奖修复）
 * - patch PokiSDK → postMessage 父页 adBreak
 * - 覆盖 window.rewardedBreak，用 window.pokiBridge 调 rewardedBreakCompleted（避免闭包 n 失效）
 * - 支持 framework 传入的 { size } 及 onStart / onComplete
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
    var kind = payload && payload.kind;
    console.log("[poki-ad-client] → 父页 postMessage", kind, requestId);
    return new Promise(function (resolve, reject) {
      pending[requestId] = {
        resolve: function (v) {
          resolve(v);
        },
        reject: function (e) {
          reject(e);
        },
      };
      try {
        try {
          if (parentWin && typeof parentWin.focus === "function") parentWin.focus();
        } catch (eFocus) {}
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
    console.log("[poki-ad-client] ← 父页响应", data.requestId, data.ok, data.result);
    if (data.ok) p.resolve(data.result || {});
    else p.reject(new Error(data.error || "poki_ad_request_failed"));
  });

  function unityRewardedParam(granted) {
    return granted === true || granted === "true" || granted === "True" ? "true" : "false";
  }

  function notifyUnityRewarded(granted) {
    var s = unityRewardedParam(granted);
    setTimeout(function () {
      try {
        if (!window.unityGame || typeof window.unityGame.SendMessage !== "function") {
          console.warn("[poki-ad-client] 无法发奖: unityGame 未就绪");
          return;
        }
        if (!window.pokiBridge) {
          console.warn("[poki-ad-client] 无法发奖: pokiBridge 未设置（等 initPokiBridge）");
          return;
        }
        window.unityGame.SendMessage(window.pokiBridge, "rewardedBreakCompleted", s);
        console.log("[poki-ad-client] Unity 发奖 SendMessage", window.pokiBridge, s);
      } catch (e) {
        console.error("[poki-ad-client] SendMessage rewardedBreakCompleted 失败", e);
      }
    }, 0);
  }

  function runRewardedBreak(arg) {
    if (arg && typeof arg === "object" && typeof arg.onStart === "function") {
      try {
        arg.onStart();
      } catch (e0) {}
    }

    return postRequest({ kind: "rewardedBreak" })
      .then(function (result) {
        var granted = !!(result && result.rewardGranted);
        if (typeof arg === "function") {
          try {
            arg(granted);
          } catch (e) {}
        } else if (arg && typeof arg === "object") {
          if (typeof arg.onComplete === "function") {
            try {
              arg.onComplete(granted);
            } catch (e2) {}
          } else if (typeof arg.finished === "function") {
            try {
              arg.finished(granted);
            } catch (e3) {}
          }
        }
        return granted;
      })
      .catch(function (err) {
        console.warn("[poki-ad-client] rewardedBreak 失败:", err);
        return false;
      });
  }

  function applyPokiSdkBridge() {
    if (!window.PokiSDK || typeof window.PokiSDK !== "object") return false;

    var origCommercial =
      window.PokiSDK.__pokiOrigCommercial ||
      (typeof window.PokiSDK.commercialBreak === "function" &&
      !window.PokiSDK.commercialBreak.__pokiBridged
        ? window.PokiSDK.commercialBreak.bind(window.PokiSDK)
        : null);

    if (!window.PokiSDK.__pokiOrigCommercial && origCommercial) {
      window.PokiSDK.__pokiOrigCommercial = origCommercial;
    }
    origCommercial = window.PokiSDK.__pokiOrigCommercial;

    window.PokiSDK.commercialBreak = function () {
      return postRequest({ kind: "commercialBreak" }).catch(function (err) {
        console.warn("[poki-ad-client] commercialBreak 失败，回退本地:", err);
        return origCommercial ? origCommercial() : Promise.resolve();
      });
    };
    window.PokiSDK.commercialBreak.__pokiBridged = true;

    window.PokiSDK.rewardedBreak = function (arg) {
      return runRewardedBreak(arg);
    };
    window.PokiSDK.rewardedBreak.__pokiBridged = true;
    return true;
  }

  /** unity-2020 原版用闭包 n 发奖，易失效；改为 pokiBridge（与 initPokiBridge 一致） */
  function installWindowRewardedBreak() {
    if (window.rewardedBreak && window.rewardedBreak.__pokiRewardHook) return true;

    window.rewardedBreak = function () {
      var args = arguments;
      console.log("[poki-ad-client] window.rewardedBreak 调用", args);
      return runRewardedBreak(args[0])
        .then(function (granted) {
          notifyUnityRewarded(granted);
          return granted;
        })
        .catch(function (err) {
          console.warn("[poki-ad-client] window.rewardedBreak 链失败", err);
          notifyUnityRewarded(false);
          return false;
        });
    };
    window.rewardedBreak.__pokiRewardHook = true;
    console.log("[poki-ad-client] window.rewardedBreak 已接管（发奖走 pokiBridge）");
    return true;
  }

  applyPokiSdkBridge();
  installWindowRewardedBreak();

  var hookTimer = setInterval(function () {
    applyPokiSdkBridge();
    installWindowRewardedBreak();
    if (
      window.PokiSDK.rewardedBreak &&
      window.PokiSDK.rewardedBreak.__pokiBridged &&
      window.rewardedBreak &&
      window.rewardedBreak.__pokiRewardHook
    ) {
      clearInterval(hookTimer);
      console.log("[poki-ad-client] 激励广告链路就绪（PokiSDK + window.rewardedBreak）");
    }
  }, 200);
  setTimeout(function () {
    clearInterval(hookTimer);
  }, 60000);
})();
