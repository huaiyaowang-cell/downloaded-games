(function() {
  // 抓取真实域名，供下方 env 判定使用（自有 CDN 域名 → "Local" 模式，绕过 SiteLock 域名校验）。
  var _realHost = "";
  try { _realHost = window.location.hostname; } catch (e) {}

  var _oeSetter = null;
  Object.defineProperty(window, "onerror", {
    configurable: true,
    set: function(fn) { _oeSetter = fn; },
    get: function() {
      return function(msg, url, line, col, err) {
        console.error("[cg-dl] onerror:", msg, url, line);
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
      var el = document.querySelector("#" + CSS.escape(_loadingIds[i]) + ":not([data-cg-placeholder])");
      if (el && el.parentElement) {
        el.parentElement.removeChild(el);
        found = true;
      }
    }
    try {
      if (typeof ProgressView !== "undefined"
          && ProgressView.progress
          && ProgressView.progress.parentElement
          && !ProgressView.progress.dataset.cgPlaceholder) {
        ProgressView.progress.parentElement.removeChild(ProgressView.progress);
        found = true;
      }
    } catch (e) {}
    if (found) {
      _loadingGone = true;
      console.log("[cg-dl] loading overlay removed");
    }
  }

  var _hlTimer = setInterval(function() {
    _hideLoading();
    if (_loadingGone) clearInterval(_hlTimer);
  }, 2000);
  setTimeout(function() { clearInterval(_hlTimer); }, 30000);

  function _breakWithCb(cb) {
    if (typeof cb === "function") {
      try { cb(); } catch (e) {}
    }
    return Promise.resolve();
  }
  function _rewardedWithCb(cb) {
    if (typeof cb === "function") {
      try { cb(); } catch (e) {}
    }
    return Promise.resolve(true);
  }

  function _noopProxy(base) {
    return new Proxy(base || {}, {
      get: function(t, p) {
        if (p in t) return t[p];
        if (typeof p === "symbol" || p === "then") return undefined;
        return _pn;
      }
    });
  }

  var _cgGame = _noopProxy({
    loadingStart: function() { console.log("[cg-dl] game.loadingStart"); },
    loadingStop: function() { _hideLoading(); },
    gameplayStart: function() { console.log("[cg-dl] game.gameplayStart"); },
    gameplayStop: function() { console.log("[cg-dl] game.gameplayStop"); },
    // 以下三项被 framework.js 当“值”读取而非调用，必须是真实数据类型：
    // _GetGameSettingsJSONSDK 会 JSON.stringify(settings)，_GetInviteParamsSDK 会判 !== null。
    // 若沿用 Proxy 默认的空函数，JSON.stringify 得到 undefined，后续 lengthBytesUTF8 会抛错。
    settings: { disableChat: false },
    inviteParams: null,
    inviteLink: function() { return ""; }
  });
  var _cgAd = _noopProxy({
    requestAd: function(type, callbacks) {
      // 本地桩：模拟一次“成功跳过”的广告，避免游戏在广告回调处卡住
      // （真实 SDK 在 localhost 拿不到广告会走 adError 并显示占位，离线更无网络）。
      // 只走成功路径：adStarted -> adFinished；切勿同时调用 adError（会让部分游戏回退到占位/卡死）。
      if (callbacks && typeof callbacks === "object") {
        try { callbacks.adStarted && callbacks.adStarted(); } catch (e) {}
        var _fin = callbacks.adFinished;
        if (typeof _fin === "function") {
          setTimeout(function () { try { _fin({ value: true }); } catch (e) {} }, 200);
        }
      }
      return Promise.resolve({ adFinished: true });
    },
    hasAdblock: function() { return Promise.resolve(false); },
    closeAd: _pn
  });
  var _cgBanner = _noopProxy({
    requestBanner: _pp,
    requestResponsiveBanner: _pp,
    clearBanner: _pn
  });
  var _cgUser = _noopProxy({
    getUser: function() { return Promise.resolve(null); },
    showInvite: _pp,
    showAuthPrompt: _pp,
    // _GetSystemInfoSDK 会 JSON.stringify(systemInfo)，同样必须是普通对象
    systemInfo: {
      countryCode: null,
      browser: { name: "chrome", version: "" },
      device: { type: "desktop" },
      os: { name: "", version: "" },
      applicationType: "web"
    }
  });
  var _cgData = _noopProxy({
    getItem: function() { return Promise.resolve(null); },
    setItem: function() { return Promise.resolve(); },
    getStats: function() { return Promise.resolve(null); }
  });
  // SDK.environment 是字符串而非对象；其合法取值必须与 CrazyGames 官方 SDK 的
  // SDKEnvironment 枚举完全匹配（区分大小写）："Live" / "CrazyGames" / "Local" / "Disabled"。
  // 关键点：C# 的 SiteLock.Check() 只有在 Environment == Local 时才跳过域名校验；
  // 之前写成小写 "local" 会被解析成 default(Disabled)，于是仍跑域名校验 → Code 3 锁死。
  // framework.js 的 _GetEnvironmentSDK 直接对它做 lengthBytesUTF8()，且没有 try/catch，
  // 传对象会当场抛错并打断 C# 侧初始化，所以必须是字符串。
  var _cgHost = _realHost;
  // 自有 CDN 域名（rabigame.fun / *.rabigame.fun）按“本地模式”处理：
  // 既绕过 CrazyGames SiteLock 的域名校验（否则 Code 3 把游戏锁死在 loading），
  // 也由本地桩模拟广告/数据接口，行为与本机 localhost 离线调试一致。
  var _cgIsLocal =
    _cgHost === "localhost" || _cgHost === "127.0.0.1" || _cgHost === "" ||
    _cgHost === "rabigame.fun" || _cgHost.endsWith(".rabigame.fun");
  var _cgEnvName = _cgIsLocal ? "Local" : "Disabled";
  console.log("[cg-dbg] host =", JSON.stringify(_cgHost), "env =", JSON.stringify(_cgEnvName));

  var _cgSitelock = _noopProxy({
    // 本地桩：SiteLock 直接返回“已授权”(code 1)，避免游戏因域名不被 CrazyGames 允许而卡死在 loading。
    check: function (cb) {
      console.log("[cg-dbg] sitelock.check(cb=" + typeof cb + ") -> 返回 code:1");
      var _ok = { code: 1, message: "" };
      try { if (typeof cb === "function") cb(_ok); } catch (e) {}
      return Promise.resolve(_ok);
    }
  });

  // C# 侧按属性名（PascalCase）访问 SDK，例如 SDK.Environment / SDK.Sitelock；
  // 只给小写键会导致 C# 读到 undefined → 视为非 local → SiteLock 跑域名校验 → Code 3 锁死。
  // 因此除小写键外，必须提供 PascalCase 别名（含官方 SDK 的拼写 Enviroment）。
  var _cgSdkBase = {
    init: function() { window.CrazyGames_SDK_OK = true; return Promise.resolve(); },
    ad: _cgAd,
    banner: _cgBanner,
    game: _cgGame,
    user: _cgUser,
    data: _cgData,
    sitelock: _cgSitelock,
    environment: _cgEnvName,
    Enviroment: _cgEnvName,
    Ad: _cgAd,
    Banner: _cgBanner,
    Game: _cgGame,
    User: _cgUser,
    Data: _cgData,
    Sitelock: _cgSitelock,
    Environment: _cgEnvName
  };
  // 调试代理：记录 C# 侧访问了 SDK 的哪些属性，定位 SiteLock 走哪条路径（访问了 Enviroment/Environment/sitelock 的哪一个）。
  var _cgSdk = new Proxy(_cgSdkBase, {
    get: function (t, p) {
      if (p in t) {
        var v = t[p];
        console.log("[cg-dbg] SDK." + String(p) + " =>", typeof v === "function" ? "<fn>" : JSON.stringify(v));
        return v;
      }
      if (typeof p === "symbol" || p === "then") return undefined;
      console.log("[cg-dbg] SDK." + String(p) + " => <noop>");
      return _pn;
    }
  });

  var _cgGlobal = _noopProxy({ SDK: _cgSdk, SDK_OK: true });
  // 必须保持可写：Unity 的 framework.js 会联网加载官方 SDK 并对 window.CrazyGames 赋值，
  // 若设为只读会抛 TypeError 使官方 SDK 初始化中断，游戏卡死黑屏。
  try {
    Object.defineProperty(window, "CrazyGames", {
      value: _cgGlobal,
      writable: true,
      configurable: true
    });
  } catch (e) {
    window.CrazyGames = _cgGlobal;
  }
  console.log("[cg-dl] CrazyGames.SDK stub active (v3)");

  // v2 兼容全局 CrazySDK
  var _v2Sdk = _noopProxy({
    init: function(cb) {
      if (typeof cb === "function") { try { cb(); } catch (e) {} }
      return Promise.resolve();
    },
    addEventListener: _pn,
    requestAd: function(type, cb) {
      if (typeof cb === "function") { try { cb(); } catch (e) {} }
      return Promise.resolve();
    },
    showAd: function(cb) {
      if (typeof cb === "function") { try { cb(); } catch (e) {} }
      return Promise.resolve();
    },
    gameplayStart: function() { console.log("[cg-dl] v2 gameplayStart"); },
    gameplayStop: _pn,
    happyTime: _pn,
    user: _cgUser
  });
  try {
    Object.defineProperty(window, "CrazySDK", {
      value: _v2Sdk,
      writable: true,
      configurable: true
    });
  } catch (e) {
    window.CrazySDK = _v2Sdk;
  }

  // Unity 的 framework.js 里硬编码了 document.head.appendChild(<script src=sdk.crazygames.com/...>)，
  // 并且只在该脚本 load 后才调用 SDK.init() 回调 Unity。离线/断网时 load 永不触发，
  // Unity 会一直等待导致黑屏。这里拦截该脚本：不发起网络请求，改为异步补发 load 事件，
  // 让游戏改用本地桩继续初始化。（load 必须异步补发：framework.js 是先 appendChild 再 addEventListener）
  var _cgSdkScriptRe = /sdk\.crazygames\.com|crazygames-sdk-v\d/i;
  function _patchInsert(proto, method) {
    var orig = proto[method];
    proto[method] = function(node) {
      if (node && node.tagName === "SCRIPT" && _cgSdkScriptRe.test(node.src || "")) {
        console.log("[cg-dl] 拦截官方 SDK 脚本，改用本地桩:", node.src);
        node.removeAttribute("src");
        var ret = orig.apply(this, arguments);
        setTimeout(function() {
          try { node.dispatchEvent(new Event("load")); } catch (e) {}
        }, 0);
        return ret;
      }
      return orig.apply(this, arguments);
    };
  }
  _patchInsert(Node.prototype, "appendChild");
  _patchInsert(Node.prototype, "insertBefore");

  var _origGBI = Document.prototype.getElementById;
  Document.prototype.getElementById = function(id) {
    var el = _origGBI.call(this, id);
    if (!el) {
      var sid = (id || "").toLowerCase();
      var isCanvasLike = sid.indexOf("canvas") >= 0 || sid === "gl" || sid === "webgl"
        || sid === "renderer" || sid === "three" || sid === "gl-canvas"
        || sid === "webgl-canvas";
      // 关键修复：canvas 类 ID 不再创建占位元素。
      // 否则 unity-2020.js 的 getCanvas() 会先调 getElementById("unity-canvas")，
      // 拿到这个挂在 body 上的 800x600 占位 canvas，createUnityInstance 便绑定到错误画布，
      // #gameContainer 全屏黑色、游戏画面错位/黑屏。让游戏自行创建真实 canvas。
      if (isCanvasLike) return null;
      el = document.createElement("div");
      el.id = id;
      el.style.display = "none";
      el.dataset.cgPlaceholder = "1";
      if (document.body) document.body.appendChild(el);
    }
    return el;
  };
})();