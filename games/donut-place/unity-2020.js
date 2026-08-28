// cg-unity-loader.js
// 由本地 index.html 加载（作为 unity-2020.js），用于离线运行 CrazyGames 的 unity2022 游戏。
// 读取 background.js 注入的 window.__CG_UNITY_CONFIG__（来自壳页 var options.unityConfigOptions），
// 把 CDN 绝对地址改写为本地相对路径，并实例化 Unity WebGL。
(function () {
  "use strict";

  var cfg = window.__CG_UNITY_CONFIG__ || {};
  if (!cfg.codeUrl && !cfg.frameworkUrl && !cfg.loaderUrl) {
    console.error("[cg-dl] unity: 缺少构建配置（codeUrl/frameworkUrl/loaderUrl）");
    return;
  }

  function toLocal(abs) {
    if (!abs) return abs;
    try {
      var u = new URL(abs, location.href);
      var p = u.pathname;
      // 下载器把 Build 目录整体拍平到游戏根（gameBaseUrl = .../Build/），
      // 这里同样去掉 /Build/ 前缀，保证与本地文件路径一致
      var idx = p.lastIndexOf("/Build/");
      if (idx >= 0) return "./" + p.slice(idx + "/Build/".length);
      return "." + p + (u.search || "");
    } catch (e) {
      return abs;
    }
  }

  // 把 CDN 绝对地址改写为本地相对路径
  var build = {
    dataUrl: toLocal(cfg.dataUrl),
    frameworkUrl: toLocal(cfg.frameworkUrl),
    codeUrl: toLocal(cfg.codeUrl),
    streamingAssetsUrl: cfg.streamingAssetsUrl ? toLocal(cfg.streamingAssetsUrl) : undefined,
    companyName: cfg.companyName,
    productName: cfg.productName,
    productVersion: cfg.productVersion,
    // 禁用 UnityCache（IndexedDB），避免部分浏览器因旧/损坏缓存卡住 loading
    cacheControl: function() { return "no-store"; }
  };
  for (var k in cfg) {
    if (!(k in build) && build[k] === undefined) build[k] = cfg[k];
  }

  function getCanvas() {
    var canvas =
      document.querySelector("canvas") ||
      document.getElementById("unity-canvas") ||
      document.getElementById("gameCanvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "unity-canvas";
      var container = document.getElementById("gameContainer") || document.body;
      container.appendChild(canvas);
    }
    return canvas;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("script load failed: " + src)); };
      document.head.appendChild(s);
    });
  }

  function instantiate(canvas) {
    if (typeof window.createUnityInstance !== "function") {
      // 部分模板中 createUnityInstance 定义在 framework 脚本加载之后
      if (build.frameworkUrl) {
        return loadScript(build.frameworkUrl).then(function () {
          return instantiate(canvas);
        });
      }
      throw new Error("createUnityInstance 不可用，且缺少 frameworkUrl");
    }
    return window
      .createUnityInstance(
        canvas,
        build,
        function (progress) {
          console.log("[cg-dl] unity loading progress:", Math.round(progress * 100) + "%");
        }
      )
      .then(function (instance) {
        window.unityInstance = instance;
        console.log("[cg-dl] unity instance ready");
      });
  }

  function start() {
    var canvas = getCanvas();
    var chain;
    // 优先使用真实 loader（若壳页提供了 unityLoaderUrl），否则走本地 framework
    if (cfg.loaderUrl) {
      chain = loadScript(toLocal(cfg.loaderUrl))
        .catch(function (e) {
          console.warn("[cg-dl] unity loader 加载失败，回退 framework:", e.message);
          return instantiate(canvas);
        })
        .then(function () {
          if (typeof window.createUnityInstance === "function") {
            return instantiate(canvas);
          }
        });
    } else {
      chain = instantiate(canvas);
    }
    chain.catch(function (e) {
      console.error("[cg-dl] unity 实例化失败:", e && e.message);
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    start();
  } else {
    window.addEventListener("DOMContentLoaded", start);
  }
})();
