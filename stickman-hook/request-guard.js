/**
 * Request guard for fetch/XHR/beacon.
 */
(function () {
  "use strict";

  var cfg = window.__REQUEST_GUARD_CONFIG__ || {};
  var DEFAULT_BLOCKED = [
    "poki.com",
    "api.gameanalytics.com",
    "leveldata.poki.io"
  ];

  var state = {
    blockedHostSuffixes: Array.isArray(cfg.blockedHostSuffixes) ? cfg.blockedHostSuffixes.slice() : DEFAULT_BLOCKED.slice(),
    middleware: typeof cfg.middleware === "function" ? cfg.middleware : null,
    logAllRequests: !!cfg.logAllRequests
  };

  function toAbsUrl(input) {
    try { return new URL(String(input), location.href).href; } catch (e) { return String(input || ""); }
  }

  function defaultMiddleware(url) {
    if (url.indexOf("blob:") === 0 || url.indexOf("data:") === 0 || url.indexOf("about:") === 0) return true;
    try {
      var hostname = new URL(url, location.href).hostname;
      for (var i = 0; i < state.blockedHostSuffixes.length; i++) {
        var suffix = String(state.blockedHostSuffixes[i] || "").toLowerCase();
        if (!suffix) continue;
        if (hostname === suffix || hostname.slice(-(suffix.length + 1)) === "." + suffix) return false;
      }
      return true;
    } catch (e) {
      return true;
    }
  }

  function shouldAllow(url) {
    var abs = toAbsUrl(url);
    var checker = state.middleware || defaultMiddleware;
    var allowed = true;
    try { allowed = !!checker(abs); } catch (e) {}
    if (state.logAllRequests) console.log("[request-guard]", { url: abs, allowed: allowed });
    if (!allowed && !state.logAllRequests) console.warn("[request-guard] blocked:", abs);
    return allowed;
  }

  var originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (!shouldAllow(url)) return Promise.reject(new Error("request_guard_blocked_fetch"));
      return originalFetch.call(this, input, init);
    };
  }

  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__requestGuardUrl = url;
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (!shouldAllow(this.__requestGuardUrl || "")) {
      this.abort();
      throw new Error("request_guard_blocked_xhr");
    }
    return originalSend.call(this, body);
  };

  if (navigator && typeof navigator.sendBeacon === "function") {
    var originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (!shouldAllow(url || "")) return false;
      return originalBeacon(url, data);
    };
  }

  window.RequestGuard = {
    defaultMiddleware: defaultMiddleware,
    configure: function (nextCfg) {
      if (!nextCfg) return;
      if (Array.isArray(nextCfg.blockedHostSuffixes)) state.blockedHostSuffixes = nextCfg.blockedHostSuffixes.slice();
      if (typeof nextCfg.middleware === "function") state.middleware = nextCfg.middleware;
      if (typeof nextCfg.logAllRequests === "boolean") state.logAllRequests = nextCfg.logAllRequests;
    },
    setMiddleware: function (middleware) {
      state.middleware = typeof middleware === "function" ? middleware : null;
    },
    setBlockedHostSuffixes: function (blockedHostSuffixes) {
      if (Array.isArray(blockedHostSuffixes)) state.blockedHostSuffixes = blockedHostSuffixes.slice();
    },
    getBlockedHostSuffixes: function () {
      return state.blockedHostSuffixes.slice();
    }
  };
})();
