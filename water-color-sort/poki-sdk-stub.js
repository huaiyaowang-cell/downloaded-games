(function() {
  var _oeSetter = null;
  Object.defineProperty(window, "onerror", {
    configurable: true,
    set: function(fn) { _oeSetter = fn; },
    get: function() {
      return function(msg, url, line, col, err) {
        console.error("[poki-dl] onerror:", msg, url, line);
        return true;
      };
    }
  });

  var _pn = function() {};
  var _pp = function() { return Promise.resolve(); };

  var _loadingGone = false;
  var _loadingIds = [
    "loading-screen-container", "loader", "loading", "progress-container",
    "defold-progress", "unity-loading-bar", "application-splash-wrapper"
  ];

  function _hideLoading() {
    if (_loadingGone) return;
    var found = false;
    for (var i = 0; i < _loadingIds.length; i++) {
      var el = document.querySelector("#" + CSS.escape(_loadingIds[i]) + ":not([data-poki-placeholder])");
      if (el && el.parentElement) {
        el.parentElement.removeChild(el);
        found = true;
      }
    }
    try {
      if (typeof ProgressView !== "undefined"
          && ProgressView.progress
          && ProgressView.progress.parentElement
          && !ProgressView.progress.dataset.pokiPlaceholder) {
        ProgressView.progress.parentElement.removeChild(ProgressView.progress);
        found = true;
      }
    } catch (e) {}
    if (found) {
      _loadingGone = true;
      console.log("[poki-dl] loading overlay removed");
    }
  }

  var _hlTimer = setInterval(function() {
    _hideLoading();
    if (_loadingGone) clearInterval(_hlTimer);
  }, 2000);
  setTimeout(function() { clearInterval(_hlTimer); }, 30000);

  /** 与 count-war 能力对齐；不 freeze、可覆盖 globalThis.PokiSDK，供 Cocos 内 PokiPlatform 包装器安装。 */
  var _pokiStub = {
    init: function() {
      window.PokiSDK_OK = true;
      return Promise.resolve();
    },
    gameplayStart: _pn,
    gameplayStop: _pn,
    rewardBreak: function() {
      return this.rewardedBreak();
    },
    commercialBreak: function() {
      console.log("commercialBreak");
      return Promise.resolve(true);
    },
    rewardedBreak: function() {
      console.log("rewardedBreak");
      return Promise.resolve(true);
    },
    displayAd: function() { console.log("displayAd"); },
    destroyAd: function() { console.log("destroyAd"); },
    setDebug: _pn,
    getURLParam: function() { return ""; },
    shareableURL: function() { return Promise.resolve(""); },
    isAdBlocked: function() { return false; },
    gameLoadingStart: _pn,
    gameLoadingFinished: _hideLoading,
    gameLoadingProgress: _pn,
    gameInteractive: _hideLoading,
    customEvent: _pn,
    happyTime: _pn,
    logError: _pn,
    roundStart: _pn,
    roundEnd: _pn,
    muteAd: _pn,
    sendHighscore: _pn,
    togglePlayerAdvertisingConsent: _pn,
    disableDOMChangeObservation: _pn,
    measure: _pn,
    measureTime: _pn
  };
  try {
    Object.defineProperty(window, "PokiSDK", {
      value: _pokiStub,
      writable: true,
      configurable: true
    });
  } catch (e) {
    window.PokiSDK = _pokiStub;
  }
  console.log("[poki-dl] PokiSDK stub active（count-war 同款字段；iframe 内由 poki-ad-bridge-client 覆盖 commercialBreak / rewardedBreak）");

  var _origGBI = Document.prototype.getElementById;
  Document.prototype.getElementById = function(id) {
    var el = _origGBI.call(this, id);
    if (!el) {
      var sid = (id || "").toLowerCase();
      if (sid === "splash") {
        return null;
      }
      var isCanvasLike = sid.indexOf("canvas") >= 0 || sid === "gl" || sid === "webgl"
        || sid === "renderer" || sid === "three" || sid === "gl-canvas"
        || sid === "webgl-canvas";
      el = document.createElement(isCanvasLike ? "canvas" : "div");
      el.id = id;
      if (!isCanvasLike) el.style.display = "none";
      if (isCanvasLike) { el.width = 800; el.height = 600; el.style.display = "block"; }
      el.dataset.pokiPlaceholder = "1";
      if (document.body) document.body.appendChild(el);
    }
    return el;
  };
})();
