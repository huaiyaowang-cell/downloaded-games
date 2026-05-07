/**
 * Stick Merge parent ad bridge.
 */
(function () {
  "use strict";
  window.showCommercialBreakCount = 0;
  var gameFrame = document.getElementById("smGameFrame");
  var bannerContainer = document.getElementById("ad-banner-container");
  var adClient = "ca-pub-4202034217897578";
  var bannerAdSlot = "7993782536";
  var popupAdSlot = "7575510367";
  var popupOverlay = null;
  var popupAdBody = null;
  var popupFallbackBody = null;
  var popupFillCheckTimer = null;
  var popupFillTimeoutTimer = null;

  function clearPopupFillCheckTimers() {
    if (popupFillCheckTimer) {
      clearInterval(popupFillCheckTimer);
      popupFillCheckTimer = null;
    }
    if (popupFillTimeoutTimer) {
      clearTimeout(popupFillTimeoutTimer);
      popupFillTimeoutTimer = null;
    }
  }

  function getPopupFallbackConfig() {
    var cfg = window.__POPUP_FALLBACK_AD__ || {};
    return {
      title: cfg.title || "Recommended Game",
      description: cfg.description || "No ad inventory right now. Try this instead.",
      ctaText: cfg.ctaText || "Open",
      clickUrl: cfg.clickUrl || "",
      imageUrl: cfg.imageUrl || ""
    };
  }

  function renderPopupFallback() {
    if (!popupFallbackBody) return;
    var cfg = getPopupFallbackConfig();
    var wrapper = document.createElement("a");
    wrapper.href = cfg.clickUrl || "javascript:void(0)";
    wrapper.target = "_blank";
    wrapper.rel = "noopener noreferrer";
    wrapper.style.display = "flex";
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";
    wrapper.style.flexDirection = "column";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "center";
    wrapper.style.textDecoration = "none";
    wrapper.style.background = "#ffffff";
    wrapper.style.color = "#222";
    wrapper.style.fontFamily = "Arial, sans-serif";

    if (cfg.imageUrl) {
      var img = document.createElement("img");
      img.src = cfg.imageUrl;
      img.alt = cfg.title;
      img.style.maxWidth = "100%";
      img.style.maxHeight = "150px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "8px";
      wrapper.appendChild(img);
    }

    var title = document.createElement("div");
    title.textContent = cfg.title;
    title.style.fontSize = "16px";
    title.style.fontWeight = "700";
    title.style.marginTop = "10px";
    wrapper.appendChild(title);

    var desc = document.createElement("div");
    desc.textContent = cfg.description;
    desc.style.fontSize = "12px";
    desc.style.marginTop = "6px";
    desc.style.textAlign = "center";
    desc.style.padding = "0 12px";
    wrapper.appendChild(desc);

    var cta = document.createElement("div");
    cta.textContent = cfg.ctaText;
    cta.style.marginTop = "10px";
    cta.style.padding = "6px 14px";
    cta.style.borderRadius = "6px";
    cta.style.background = "#1677ff";
    cta.style.color = "#fff";
    cta.style.fontSize = "12px";
    wrapper.appendChild(cta);

    popupFallbackBody.innerHTML = "";
    popupFallbackBody.appendChild(wrapper);
    popupFallbackBody.style.display = "block";
  }

  function hidePopupFallback() {
    if (!popupFallbackBody) return;
    popupFallbackBody.innerHTML = "";
    popupFallbackBody.style.display = "none";
  }

  function monitorPopupFillState(popupAd) {
    clearPopupFillCheckTimers();
    popupFillCheckTimer = setInterval(function () {
      if (!popupAd || !popupAd.parentElement) {
        clearPopupFillCheckTimers();
        return;
      }
      var status = popupAd.getAttribute("data-ad-status");
      if (status === "filled") {
        hidePopupFallback();
        clearPopupFillCheckTimers();
        return;
      }
      if (status === "unfilled") {
        renderPopupFallback();
        clearPopupFillCheckTimers();
      }
    }, 250);
    popupFillTimeoutTimer = setTimeout(function () {
      clearPopupFillCheckTimers();
      if (popupAd && popupAd.parentElement) {
        var status = popupAd.getAttribute("data-ad-status");
        if (status !== "filled") renderPopupFallback();
      }
    }, 3000);
  }

  function ensurePopupElements() {
    if (popupOverlay) return;
    popupOverlay = document.createElement("div");
    popupOverlay.id = "sm-popup-ad-overlay";
    popupOverlay.style.position = "fixed";
    popupOverlay.style.inset = "0";
    popupOverlay.style.zIndex = "10000";
    popupOverlay.style.display = "none";
    popupOverlay.style.alignItems = "center";
    popupOverlay.style.justifyContent = "center";
    popupOverlay.style.background = "rgba(255, 255, 255, 0.55)";

    var popupCard = document.createElement("div");
    popupCard.style.position = "relative";
    popupCard.style.width = "320px";
    popupCard.style.minHeight = "270px";
    popupCard.style.padding = "10px";
    popupCard.style.boxSizing = "border-box";
    popupCard.style.borderRadius = "10px";
    popupCard.style.background = "#ffffff";
    popupCard.style.boxShadow = "0 8px 30px rgba(0, 0, 0, 0.2)";
    popupCard.style.display = "flex";
    popupCard.style.alignItems = "center";
    popupCard.style.justifyContent = "center";

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.innerHTML = "&times;";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "0";
    closeBtn.style.right = "0";
    closeBtn.style.width = "32px";
    closeBtn.style.height = "32px";
    closeBtn.style.border = "0";
    closeBtn.style.borderRadius = "16px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.fontSize = "22px";
    closeBtn.style.lineHeight = "32px";
    closeBtn.style.padding = "0";
    closeBtn.style.background = "#f0f0f0";
    closeBtn.style.color = "#333";
    closeBtn.style.transform = "translate(50%, -50%)";
    closeBtn.addEventListener("click", function () {
      hidePopupAd();
    });

    popupAdBody = document.createElement("div");
    popupAdBody.style.width = "300px";
    popupAdBody.style.height = "250px";
    popupAdBody.style.overflow = "hidden";
    popupAdBody.style.background = "#f7f7f7";
    popupAdBody.style.position = "relative";

    popupFallbackBody = document.createElement("div");
    popupFallbackBody.style.position = "absolute";
    popupFallbackBody.style.inset = "0";
    popupFallbackBody.style.display = "none";

    popupCard.appendChild(closeBtn);
    popupCard.appendChild(popupAdBody);
    popupAdBody.appendChild(popupFallbackBody);
    popupOverlay.appendChild(popupCard);
    document.body.appendChild(popupOverlay);
  }

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
    if(window.showCommercialBreakCount < 2) {
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
        name: "stick-merge-commercial",
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
        name: "stick-merge-reward",
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
      var bannerSize = resolveBannerSize(size);
      var banner = document.createElement("ins");
      banner.className = "adsbygoogle";
      banner.style.display = "inline-block";
      banner.style.width = bannerSize.width + "px";
      banner.style.height = bannerSize.height + "px";
      banner.setAttribute("data-ad-client", adClient);
      banner.setAttribute("data-ad-slot", bannerAdSlot);

      bannerContainer.innerHTML = "";
      bannerContainer.style.width = bannerSize.width + "px";
      bannerContainer.style.height = bannerSize.height + "px";
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

  function showPopupAd() {
    return new Promise(function (resolve) {
      ensurePopupElements();
      if (!popupOverlay || !popupAdBody) {
        resolve({});
        return;
      }

      var popupAd = document.createElement("ins");
      popupAd.className = "adsbygoogle";
      popupAd.style.display = "inline-block";
      popupAd.style.width = "300px";
      popupAd.style.height = "250px";
      popupAd.setAttribute("data-ad-client", adClient);
      popupAd.setAttribute("data-ad-slot", popupAdSlot);

      popupAdBody.innerHTML = "";
      popupAdBody.appendChild(popupAd);
      popupAdBody.appendChild(popupFallbackBody);
      hidePopupFallback();
      popupOverlay.style.display = "flex";

      try {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
      } catch (e) {}
      monitorPopupFillState(popupAd);
      resolve({});
    });
  }

  function hidePopupAd() {
    return new Promise(function (resolve) {
      clearPopupFillCheckTimers();
      hidePopupFallback();
      if (popupAdBody) popupAdBody.innerHTML = "";
      if (popupOverlay) popupOverlay.style.display = "none";
      resolve({});
    });
  }

  function handlePokiAdRequest(payload) {
    payload = payload || {};
    if (payload.kind === "commercialBreak") return showCommercialBreak();
    if (payload.kind === "rewardedBreak") return showRewardedBreak();
    if (payload.kind === "displayBanner") return showBanner(payload.size);
    if (payload.kind === "destroyBanner") return hideBanner();
    if (payload.kind === "showPopupAd") return showPopupAd();
    if (payload.kind === "hidePopupAd") return hidePopupAd();
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
