/**
 * iframe 内游戏侧广告桥接（母页 AdSense / adBreak）
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
  /** 插屏父页一般较快；激励需等用户看完，过短会先收到 rewardGranted:false */
  var PARENT_REPLY_MS_COMMERCIAL = 30000;
  var PARENT_REPLY_MS_REWARD = 130000;

  function genRequestId() {
    return Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
  }

  function postRequest(payload) {
    var requestId = genRequestId();
    var kind = (payload && payload.kind) || "";
    return new Promise(function (resolve, reject) {
      var entry = {
        _done: false,
        timer: null,
        finish: function (v, isErr) {
          if (entry._done) return;
          entry._done = true;
          try {
            clearTimeout(entry.timer);
          } catch (e) {}
          delete pending[requestId];
          if (isErr) reject(v);
          else resolve(v);
        },
      };
      var replyMs = kind === "rewardedBreak" ? PARENT_REPLY_MS_REWARD : PARENT_REPLY_MS_COMMERCIAL;
      entry.timer = setTimeout(function () {
        console.warn("[poki-ad-client] 父页 " + replyMs + "ms 无回复，结束等待");
        if (kind === "rewardedBreak") entry.finish({ rewardGranted: false }, false);
        else entry.finish({}, false);
      }, replyMs);
      pending[requestId] = entry;
      try {
        parentWin.postMessage(
          { type: "poki_ad_request", requestId: requestId, payload: payload || {} },
          "*"
        );
      } catch (e) {
        entry.finish(e, true);
      }
    });
  }

  window.addEventListener("message", function (event) {
    var data = event && event.data;
    if (!data || data.type !== "poki_ad_response") return;
    var entry = pending[data.requestId];
    if (!entry || typeof entry.finish !== "function") return;
    if (data.ok) entry.finish(data.result || {}, false);
    else entry.finish(new Error(data.error || "poki_ad_request_failed"), true);
  });

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

  PokiSDK.rewardedBreak = function () {
    return postRequest({ kind: "rewardedBreak" })
      .then(function (result) {
        return !!(result && result.rewardGranted);
      })
      .catch(function (err) {
        console.warn("[poki-ad-client] rewardedBreak 失败，回退本地:", err);
        return Promise.resolve(false);
      });
  };
})();
