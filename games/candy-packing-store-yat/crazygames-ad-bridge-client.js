/**
 * candy-packing-store-yat — iframe 内游戏侧广告桥接（CrazyGames SDK → 父页 adBreak）
 *
 * 复用 happy-glass 的传输协议：
 *   子页 postMessage { type:"poki_ad_request", requestId, payload:{kind} }
 *   父页 crazygames-ad-bridge-parent 收到后调用 window.adBreak，再回传 { type:"poki_ad_response" }
 *
 * 关键保证（离线兼容）：
 *   - 仅在真 iframe（window.parent !== window）下桥接；直接打开 game.html 则跳过，走 stub 本地逻辑。
 *   - 桥接失败（postMessage 异常 / 父页无响应 / 离线）一律回退到 crazygames-sdk-stub 的原生模拟，
 *     游戏绝不会卡在广告回调。
 */
(function () {
  "use strict";

  var parentWin;
  try { parentWin = window.parent; } catch (e) { parentWin = null; }
  if (!parentWin || parentWin === window) {
    console.log("[cg-ad-client] 非 iframe 环境，使用本地 stub 广告逻辑");
    return;
  }

  var pending = Object.create(null);

  function genRequestId() {
    return Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
  }

  // CrazyGames 广告类型：midgame(插屏) / rewarded(激励) 等
  function mapKind(type) {
    var t = String(type == null ? "" : type).toLowerCase();
    if (t.indexOf("reward") >= 0) return "rewardedBreak";
    return "commercialBreak";
  }

  function postRequest(kind) {
    var requestId = genRequestId();
    console.log("[cg-ad-client] 桥接广告请求 kind=" + kind + " requestId=" + requestId);
    return new Promise(function (resolve, reject) {
      pending[requestId] = { resolve: resolve, reject: reject };
      try {
        parentWin.postMessage(
          { type: "poki_ad_request", requestId: requestId, payload: { kind: kind } },
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
    else p.reject(new Error(data.error || "cg_ad_request_failed"));
  });

  var mounted = 0;

  // v3: CrazyGames.SDK.ad.requestAd(type, callbacks)
  var CG = (window.CrazyGames && window.CrazyGames.SDK) || null;
  if (CG && CG.ad && typeof CG.ad.requestAd === "function") {
    var origV3 = CG.ad.requestAd.bind(CG.ad);
    CG.ad.requestAd = function (type, callbacks) {
      return postRequest(mapKind(type))
        .then(function () {
          if (callbacks && typeof callbacks === "object") {
            try { callbacks.adStarted && callbacks.adStarted(); } catch (e) {}
            try { callbacks.adFinished && callbacks.adFinished({ value: true }); } catch (e) {}
          }
          return Promise.resolve({ adFinished: true });
        })
        .catch(function (err) {
          console.warn("[cg-ad-client] v3 桥接失败，回退本地模拟:", err);
          return origV3(type, callbacks);
        });
    };
    mounted++;
  } else {
    console.warn("[cg-ad-client] CrazyGames.SDK.ad.requestAd 未定义，跳过 v3 桥接");
  }

  // v2: CrazySDK.requestAd(type, cb) / CrazySDK.showAd(cb)
  var CS = window.CrazySDK;
  if (CS) {
    if (typeof CS.requestAd === "function") {
      var origV2 = CS.requestAd.bind(CS);
      CS.requestAd = function (type, cb) {
        return postRequest(mapKind(type))
          .then(function () {
            if (typeof cb === "function") { try { cb(); } catch (e) {} }
            return Promise.resolve();
          })
          .catch(function (err) {
            console.warn("[cg-ad-client] v2 requestAd 桥接失败，回退:", err);
            return origV2(type, cb);
          });
      };
      mounted++;
    }
    if (typeof CS.showAd === "function") {
      var origShow = CS.showAd.bind(CS);
      CS.showAd = function (cb) {
        return postRequest("commercialBreak")
          .then(function () {
            if (typeof cb === "function") { try { cb(); } catch (e) {} }
            return Promise.resolve();
          })
          .catch(function (err) {
            console.warn("[cg-ad-client] v2 showAd 桥接失败，回退:", err);
            return origShow(cb);
          });
      };
      mounted++;
    }
  }

  console.log("[cg-ad-client] CrazyGames 广告桥接已挂载 (→ 父页 adBreak, 挂载点=" + mounted + ")");
})();
