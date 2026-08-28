// cg-master-loader-shim.js
// CrazyGames 的 html5 入口 HTML 通常是自包含的（直接来自 *.game-files.crazygames.com），
// 不像 Poki 那样依赖独立的 master-loader 编排脚本。
// 若本地 index.html 仍引用了 ./master-loader.js，本 shim 作为无害占位，
// 真正的初始化由 crazygames-sdk-stub.js（注入 window.CrazyGames.SDK）与游戏自身脚本完成。
(function () {
  "use strict";
  console.log("[cg-dl] master-loader shim loaded (no-op)");
})();
