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
    "splash", "defold-progress", "unity-loading-bar", "application-splash-wrapper"
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

  var _pokiStubBase = {
    init: function() {
      window.PokiSDK_OK = true;
      return Promise.resolve();
    },
    gameplayStart: _pn,
    gameplayStop: _pn,
    commercialBreak: () => {
      console.log('commercialBreak')
      return Promise.resolve(true);
    },
    rewardedBreak: function() { 
      console.log('rewardedBreak')
      return Promise.resolve(true); 
    },
    displayAd: _pn,
    destroyAd: _pn,
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
    disableDOMChangeObservation: _pn
  };
  var _missingLog = Object.create(null);
  var _pokiStub = new Proxy(_pokiStubBase, {
    get: function(target, prop) {
      if (prop in target) return target[prop];
      if (!_missingLog[prop]) {
        _missingLog[prop] = 1;
        console.warn("[poki-dl] missing PokiSDK method stubbed:", String(prop));
      }
      // Unknown APIs are treated as noop functions to avoid startup crashes
      return _pn;
    },
    set: function(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });

  // Keep PokiSDK replaceable: some builds patch/instrument SDK at runtime.
  try {
    Object.defineProperty(window, "PokiSDK", {
      value: _pokiStub,
      writable: true,
      configurable: true
    });
  } catch (e) {
    window.PokiSDK = _pokiStub;
  }
  console.log("[poki-dl] PokiSDK stub active (proxy)");

  // Log network failures with URL to identify missing/off-origin assets.
  try {
    var _origFetch = window.fetch;
    if (typeof _origFetch === "function") {
      window.fetch = function(input, init) {
        var url = typeof input === "string" ? input : (input && input.url) || String(input);
        return _origFetch.call(this, input, init).then(function(resp) {
          if (!resp || !resp.ok) {
            console.error("[poki-dl] fetch bad response:", url, resp && resp.status);
          }
          return resp;
        }).catch(function(err) {
          console.error("[poki-dl] fetch failed:", url, err);
          throw err;
        });
      };
    }
  } catch (e) {}

  try {
    var _open = XMLHttpRequest.prototype.open;
    var _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
      this.__pokiUrl = url;
      return _open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
      this.addEventListener("error", function() {
        console.error("[poki-dl] xhr failed:", this.__pokiUrl);
      });
      this.addEventListener("load", function() {
        if (this.status >= 400 || this.status === 0) {
          console.error("[poki-dl] xhr bad response:", this.__pokiUrl, this.status);
        }
      });
      return _send.apply(this, arguments);
    };
  } catch (e) {}

  var _origGBI = Document.prototype.getElementById;
  Document.prototype.getElementById = function(id) {
    var el = _origGBI.call(this, id);
    if (!el) {
      var sid = (id || "").toLowerCase();
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