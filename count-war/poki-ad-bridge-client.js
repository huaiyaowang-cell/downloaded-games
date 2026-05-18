/**
 * Count War — iframe 内广告桥接（postMessage 到父页；PokiSDK 代理，兼容 Unity 晚注入 PokiSDK）
 */
(function () {
  "use strict";

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
    if (data.ok) p.resolve(data.result || {});
    else p.reject(new Error(data.error || "poki_ad_request_failed"));
  });

  function patchSdk(sdk) {
    if (!sdk || typeof sdk !== "object") return;

    if (!sdk.__pokiOrigAds) {
      try {
        Object.defineProperty(sdk, "__pokiOrigAds", {
          value: {
            commercialBreak:
              typeof sdk.commercialBreak === "function"
                ? sdk.commercialBreak.bind(sdk)
                : null,
            rewardedBreak:
              typeof sdk.rewardedBreak === "function"
                ? sdk.rewardedBreak.bind(sdk)
                : null,
          },
          enumerable: false,
          configurable: true,
        });
      } catch (eMeta) {
        return;
      }
    }
    var orig = sdk.__pokiOrigAds;

    sdk.commercialBreak = function () {
      return postRequest({ kind: "commercialBreak" }).catch(function (err) {
        console.warn("[poki-ad-client] commercialBreak 失败，回退本地:", err);
        return orig.commercialBreak ? orig.commercialBreak() : Promise.resolve();
      });
    };

    sdk.rewardedBreak = function (arg) {
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
          return orig.rewardedBreak ? orig.rewardedBreak(arg) : Promise.resolve(false);
        });
    };
  }

  var holder = { sdk: window.PokiSDK };
  if (!holder.sdk) {
    console.warn("[poki-ad-client] PokiSDK 未定义，跳过桥接（请保证 poki-sdk-stub.js 在桥接脚本之前）");
    return;
  }

  try {
    Object.defineProperty(window, "PokiSDK", {
      configurable: true,
      enumerable: true,
      get: function () {
        return holder.sdk;
      },
      set: function (v) {
        holder.sdk = v;
        patchSdk(holder.sdk);
      },
    });
  } catch (e) {
    patchSdk(holder.sdk);
    return;
  }

  patchSdk(holder.sdk);
  console.log("[poki-ad-client] 已桥接父页广告（commercialBreak / rewardedBreak → postMessage）");
})();
