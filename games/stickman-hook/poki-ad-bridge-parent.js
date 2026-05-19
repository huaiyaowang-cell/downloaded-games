/**
 * Stickman Hook parent ad bridge.
 */
(function () {
  "use strict";
  window.showCommercialBreakCount = 0;
  var gameFrame = document.getElementById("shGameFrame");
  var bannerContainer = document.getElementById("ad-banner-container");
  var adClient = "ca-pub-4202034217897578";
  var adSlot = "8757642828";

  function resolveBannerSize(size) {
    var normalized = String(size || "").toLowerCase();
    var isLandscapeWide = window.innerWidth >= 900 && window.innerWidth > window.innerHeight;
    if (normalized.indexOf("728x90") >= 0 || normalized.indexOf("728") >= 0 || isLandscapeWide) {
      return { width: 728, height: 90 };
    }
    return { width: 320, height: 50 };
  }

  function sendResponse(event, requestId, ok, result, error) {
    try {
      if (!event || !event.source || typeof event.source.postMessage !== "function") return;
      event.source.postMessage(
        {
          type: "poki_ad_response",
          requestId: requestId,
          ok: !!ok,
          result: result || {},
          error: error || null
        },
        "*"
      );
    } catch (e) {}
  }

  function showCommercialBreak() {
    if (window.showCommercialBreakCount < 2) {
      window.showCommercialBreakCount++;
      return Promise.resolve({});
    }
    return new Promise(function (resolve) {
      if (typeof window.adBreak !== "function" || !window.__googleAdsReady) {
        resolve({});
        return;
      }
      window.adBreak({
        type: "browse",
        name: "stickman-hook-commercial",
        beforeAd: function () {},
        afterAd: function () {},
        adBreakDone: function () {
          resolve({});
        }
      });
    });
  }

  function showRewardedBreak() {
    return new Promise(function (resolve) {
      if (typeof window.adBreak !== "function") {
        resolve({ rewardGranted: true });
        return;
      }
      window.adBreak({
        type: "reward",
        name: "stickman-hook-reward",
        beforeAd: function () {},
        afterAd: function () {},
        beforeReward: function (showAdFn) {
          if (showAdFn) showAdFn();
        },
        adDismissed: function () {},
        adViewed: function () {},
        adBreakDone: function (placementInfo) {
          resolve({ rewardGranted: !!(placementInfo && placementInfo.breakStatus === "viewed") });
        }
      });
    });
  }

  function showBanner(size) {
    return new Promise(function (resolve) {
      if (!bannerContainer) {
        resolve({});
        return;
      }
      var banner = document.createElement("ins");
      banner.className = "adsbygoogle";
      banner.style.display = "inline-block";
      banner.style.width = "320px";
      banner.style.height = "50px";
      banner.setAttribute("data-ad-client", adClient);
      banner.setAttribute("data-ad-slot", adSlot);

      bannerContainer.innerHTML = "";
      bannerContainer.style.width = "320px";
      bannerContainer.style.height = "50px";
      bannerContainer.style.display = "block";
      bannerContainer.appendChild(banner);

      try {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
      } catch (e) {}
      resolve({});
    });
  }

  function hideBanner() {
    return new Promise(function (resolve) {
      if (bannerContainer) {
        bannerContainer.innerHTML = "";
        bannerContainer.style.display = "none";
      }
      resolve({});
    });
  }

  function handlePokiAdRequest(payload) {
    payload = payload || {};
    if (payload.kind === "commercialBreak") return showCommercialBreak();
    if (payload.kind === "rewardedBreak") return showRewardedBreak();
    if (payload.kind === "displayBanner") return showBanner(payload.size);
    if (payload.kind === "destroyBanner") return hideBanner();
    return Promise.reject(new Error("invalid_poki_ad_kind"));
  }

  window.addEventListener("message", function (event) {
    var data = event && event.data;
    if (!data || data.type !== "poki_ad_request") return;
    if (gameFrame && gameFrame.contentWindow && event.source !== gameFrame.contentWindow) return;
    if (data.requestId == null) return;

    handlePokiAdRequest(data.payload)
      .then(function (result) {
        sendResponse(event, data.requestId, true, result, null);
      })
      .catch(function (err) {
        sendResponse(event, data.requestId, false, {}, err && err.message ? err.message : String(err));
      });
  });
})();
