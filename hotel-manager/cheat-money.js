/**
 * My Perfect Hotel — 控制台加钞 / 刷奖励
 * 用法（F12 控制台）: farmMoney(10) 或 addMoney(1000000)
 */
(function () {
  "use strict";

  var DEFAULT_AMOUNT = 999999;

  function unity() {
    return window.unityGame || null;
  }

  function send(go, method, param) {
    var u = unity();
    if (!u || typeof u.SendMessage !== "function") return false;
    if (!go || !method) return false;
    try {
      if (param === undefined || param === null) u.SendMessage(go, method);
      else u.SendMessage(go, method, String(param));
      return true;
    } catch (e) {
      console.warn("[mph-cheat] SendMessage 异常:", go, method, e);
      return false;
    }
  }

  function waitUnity(maxMs, stepMs) {
    maxMs = maxMs == null ? 180000 : maxMs;
    stepMs = stepMs == null ? 250 : stepMs;
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function tick() {
        var u = unity();
        if (u) return resolve(u);
        if (Date.now() - t0 >= maxMs) return resolve(null);
        setTimeout(tick, stepMs);
      })();
    });
  }

  function runRewardedOnce() {
    if (typeof window.rewardedBreak === "function") {
      try {
        window.rewardedBreak();
        return Promise.resolve(true);
      } catch (e) {
        console.warn("[mph-cheat] window.rewardedBreak 失败:", e);
      }
    }
    if (window.PokiSDK && typeof PokiSDK.rewardedBreak === "function") {
      return PokiSDK.rewardedBreak().then(function (ok) {
        var bridge = window.pokiBridge;
        if (ok && unity() && bridge) {
          send(bridge, "rewardedBreakCompleted", "true");
        }
        return !!ok;
      });
    }
    return Promise.resolve(false);
  }

  // 直接通知 Unity「广告看完」—— 最稳
  window.giveReward = function () {
    var bridge = window.pokiBridge;
    var u = unity();
    if (!u) {
      console.warn("[mph-cheat] Unity 未就绪");
      return false;
    }
    if (bridge && send(bridge, "rewardedBreakCompleted", "true")) {
      console.log("[mph-cheat] giveReward →", bridge + ".rewardedBreakCompleted(true)");
      return true;
    }
    runRewardedOnce();
    console.log("[mph-cheat] giveReward → 已走 rewardedBreak 流程");
    return true;
  };

  window.farmMoney = function (times) {
    times = Math.max(1, Math.min(Number(times) || 10, 100));
    var chain = Promise.resolve();
    var i;
    for (i = 0; i < times; i++) {
      chain = chain.then(function () {
        return runRewardedOnce();
      });
    }
    return chain.then(function () {
      console.log("[mph-cheat] farmMoney 已完成 " + times + " 次奖励触发");
      return true;
    });
  };

  var MONEY_TARGETS = [
    { go: "GameSession8", method: "WithdrawMoney" },
    { go: "GameSession8", method: "CollectMoney" },
    { go: "GameSession", method: "WithdrawMoney" },
    { go: "GameSession", method: "CollectMoney" },
    { go: "HotelDebugTestHelper", method: "DropFixedMoney" },
    { go: "HotelDebug2", method: "DropFixedMoney" },
  ];

  var AMOUNT_TARGETS = [
    { go: "Wallet", method: "Accrue" },
    { go: "GameSession8", method: "Accrue" },
    { go: "GameSession", method: "Accrue" },
    { go: "GameData", method: "TryFillRemoteBalance" },
  ];

  function runMoneyCheat(amount) {
    var amt = String(Math.floor(Number(amount) || DEFAULT_AMOUNT));
    if (!unity()) {
      console.warn("[mph-cheat] Unity 尚未加载，请进入酒店后再试");
      return false;
    }

    var hit = 0;
    var i;
    for (i = 0; i < AMOUNT_TARGETS.length; i++) {
      var t = AMOUNT_TARGETS[i];
      if (t.method === "TryFillRemoteBalance") {
        if (send(t.go, t.method)) hit++;
      } else if (send(t.go, t.method, amt)) hit++;
    }
    for (i = 0; i < MONEY_TARGETS.length; i++) {
      if (send(MONEY_TARGETS[i].go, MONEY_TARGETS[i].method)) hit++;
    }

    console.log(
      "[mph-cheat] addMoney(" +
        amt +
        ") 已尝试 " +
        hit +
        " 个 SendMessage（Unity 找不到对象时会静默失败）"
    );
    console.log("[mph-cheat] 若钞票未变，请用 farmMoney(10) 或 giveReward()");
    return hit > 0;
  }

  window.addMoney = function (amount) {
    if (!unity()) {
      return waitUnity().then(function (u) {
        if (!u) {
          console.warn("[mph-cheat] 等待 Unity 超时");
          return false;
        }
        return runMoneyCheat(amount);
      });
    }
    return Promise.resolve(runMoneyCheat(amount));
  };

  window.mphAddMoney = window.addMoney;

  window.mphStatus = function () {
    var u = unity();
    console.log("[mph-cheat] 状态:", {
      unityGame: !!u,
      pokiBridge: window.pokiBridge || "(未初始化，进游戏后才有)",
      rewardedBreak: typeof window.rewardedBreak,
      PokiSDK: !!window.PokiSDK,
    });
    return !!u;
  };

  function tryHashMoney() {
    var hash = location.hash || "";
    var m = hash.match(/(?:^#|[?&])(?:money|addMoney)=(\d+)/i);
    if (!m) return;
    waitUnity().then(function (u) {
      if (u) addMoney(parseInt(m[1], 10));
    });
  }

  function patchCreateUnityInstance() {
    if (typeof window.createUnityInstance !== "function") return false;
    if (window.createUnityInstance.__mphCheatPatched) return true;
    var origCreate = window.createUnityInstance;
    window.createUnityInstance = function () {
      return origCreate.apply(this, arguments).then(function (instance) {
        window.unityGame = instance;
        console.log(
          "[mph-cheat] Unity 已就绪。推荐: farmMoney(10) | giveReward() | mphStatus()"
        );
        return instance;
      });
    };
    window.createUnityInstance.__mphCheatPatched = true;
    return true;
  }

  if (!patchCreateUnityInstance()) {
    var patchTimer = setInterval(function () {
      if (patchCreateUnityInstance()) clearInterval(patchTimer);
    }, 50);
    setTimeout(function () {
      clearInterval(patchTimer);
    }, 60000);
  }

  tryHashMoney();
  window.addEventListener("hashchange", tryHashMoney);

  console.log(
    "[mph-cheat] 已加载。推荐: farmMoney(10) | giveReward() | mphStatus() | addMoney(1000000)"
  );
})();
