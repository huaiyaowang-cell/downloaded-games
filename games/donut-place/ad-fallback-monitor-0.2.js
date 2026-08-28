/**
 * AdSense 广告位填充检测 + 兜底 / 定时刷新。
 *
 * 策略：
 * 1. 未填充 → 立即显示兜底广告
 * 2. 填充成功 → 等待 refreshDelayMs 后，按 refreshSequence 顺序取下一项刷新：
 *    - "fallback" → 刷成兜底
 *    - "adsense"  → 重建 Google AdSense 单元并重新检测填充
 *    序列取完后不再刷新
 *
 * 页面配置（在引入本脚本前设置）：
 *   window.AD_FALLBACK_CONFIG = { ... }
 */
(function (global) {
  "use strict";

  var TYPE_FALLBACK = "fallback";
  var TYPE_ADSENSE = "adsense";

  var DEFAULT_CONFIG = {
    checkIntervalMs: 500,
    /** 填充成功后，到下一次刷新的等待时间（毫秒） */
    refreshDelayMs: 2 * 60 * 1000,
    /**
     * 刷新序列。每次触发刷新按顺序取一项：
     * "fallback" | "adsense"
     * 取完后停止刷新。
     */
    refreshSequence: [],
    /**
     * 允许检测的容器 id 白名单。
     * 只会在这些容器内查找 ins.adsbygoogle，不做全局查询。
     */
    containerIds: [],
    slots: []
  };

  var UNFILLED_STATUSES = {
    unfilled: true,
    "unfill-optimized": true
  };

  function mergeConfig(pageConfig) {
    var cfg = {};
    var src = pageConfig || {};
    cfg.checkIntervalMs = src.checkIntervalMs != null
      ? src.checkIntervalMs
      : DEFAULT_CONFIG.checkIntervalMs;
    cfg.refreshDelayMs = src.refreshDelayMs != null
      ? src.refreshDelayMs
      : DEFAULT_CONFIG.refreshDelayMs;
    cfg.refreshSequence = Array.isArray(src.refreshSequence)
      ? src.refreshSequence.slice()
      : DEFAULT_CONFIG.refreshSequence.slice();
    cfg.containerIds = Array.isArray(src.containerIds)
      ? src.containerIds.slice()
      : DEFAULT_CONFIG.containerIds.slice();
    cfg.slots = Array.isArray(src.slots) ? src.slots : DEFAULT_CONFIG.slots;
    return cfg;
  }

  function parsePx(value) {
    var n = parseInt(value, 10);
    return isNaN(n) ? 0 : n;
  }

  function buildContainerIdSet(containerIds) {
    var set = Object.create(null);
    if (!Array.isArray(containerIds)) return set;
    for (var i = 0; i < containerIds.length; i++) {
      var id = containerIds[i];
      if (id != null && id !== "") {
        set[String(id)] = true;
      }
    }
    return set;
  }

  function isAllowedContainer(container, allowedIdSet) {
    if (!container || !container.id) return false;
    return !!allowedIdSet[container.id];
  }

  /** 仅在指定容器内查找 AdSense 单元，绝不做 document 全局查询 */
  function resolveAdUnit(container, allowedIdSet) {
    if (!container || !isAllowedContainer(container, allowedIdSet)) return null;
    return container.querySelector("ins.adsbygoogle");
  }

  function resolveSize(slotConfig, adUnit, container) {
    var width = slotConfig.width;
    var height = slotConfig.height;

    if ((!width || !height) && adUnit) {
      width = width || parsePx(adUnit.style.width) || adUnit.offsetWidth;
      height = height || parsePx(adUnit.style.height) || adUnit.offsetHeight;
    }

    if ((!width || !height) && container) {
      width = width || container.offsetWidth;
      height = height || container.offsetHeight;
    }

    return {
      width: width || 320,
      height: height || 50
    };
  }

  function captureAdMeta(adUnit, slotConfig) {
    var size = resolveSize(slotConfig, adUnit, null);
    return {
      client: (adUnit && adUnit.getAttribute("data-ad-client")) || slotConfig.adClient || "",
      slot: (adUnit && adUnit.getAttribute("data-ad-slot")) || slotConfig.adSlot || "",
      width: size.width,
      height: size.height
    };
  }

  function isSdkDone(adUnit) {
    return adUnit.getAttribute("data-adsbygoogle-status") === "done";
  }

  function isFilled(adUnit) {
    return adUnit.getAttribute("data-ad-status") === "filled";
  }

  function isUnfilled(adUnit) {
    var status = adUnit.getAttribute("data-ad-status");
    return !!(status && UNFILLED_STATUSES[status]);
  }

  function normalizeRefreshType(value) {
    if (value == null) return "";
    var type = String(value).toLowerCase().trim();
    if (type === TYPE_FALLBACK || type === "兜底") return TYPE_FALLBACK;
    if (
      type === TYPE_ADSENSE ||
      type === "google" ||
      type === "google-adsense" ||
      type === "google_adsense" ||
      type === "adsbygoogle"
    ) {
      return TYPE_ADSENSE;
    }
    return type;
  }

  function showFallback(container, slotConfig, adMeta) {
    var size = {
      width: (adMeta && adMeta.width) || slotConfig.width || 320,
      height: (adMeta && adMeta.height) || slotConfig.height || 50
    };
    var iframe = document.createElement("iframe");
    iframe.src = slotConfig.fallbackUrl;
    iframe.width = String(size.width);
    iframe.height = String(size.height);
    iframe.style.width = size.width + "px";
    iframe.style.height = size.height + "px";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("title", "fallback-ad-" + (slotConfig.containerId || "slot"));
    container.innerHTML = "";
    container.appendChild(iframe);
  }

  function rebuildAdSense(container, slotConfig, adMeta) {
    var width = (adMeta && adMeta.width) || slotConfig.width || 320;
    var height = (adMeta && adMeta.height) || slotConfig.height || 50;
    var client = (adMeta && adMeta.client) || slotConfig.adClient || "";
    var slot = (adMeta && adMeta.slot) || slotConfig.adSlot || "";

    container.innerHTML = "";

    var adElement = document.createElement("ins");
    adElement.className = "adsbygoogle";
    adElement.style.display = "inline-block";
    adElement.style.width = width + "px";
    adElement.style.height = height + "px";
    if (client) adElement.setAttribute("data-ad-client", client);
    if (slot) adElement.setAttribute("data-ad-slot", slot);
    container.appendChild(adElement);

    try {
      (global.adsbygoogle = global.adsbygoogle || []).push({});
    } catch (e) {}

    return adElement;
  }

  function bindSlot(slotConfig, cfg, allowedIdSet) {
    if (!slotConfig || !slotConfig.containerId || !slotConfig.fallbackUrl) return;
    if (!allowedIdSet[slotConfig.containerId]) return;

    var container = document.getElementById(slotConfig.containerId);
    if (!container || !isAllowedContainer(container, allowedIdSet)) return;

    var checkIntervalMs = cfg.checkIntervalMs || 500;
    var refreshDelayMs = cfg.refreshDelayMs != null ? cfg.refreshDelayMs : 2 * 60 * 1000;
    var refreshSequence = Array.isArray(cfg.refreshSequence)
      ? cfg.refreshSequence.slice()
      : [];
    var sequenceIndex = 0;
    var pollTimer = null;
    var refreshTimer = null;
    var adMeta = null;
    var settled = false;

    function clearPoll() {
      if (pollTimer != null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function clearRefresh() {
      if (refreshTimer != null) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    }

    function stopAll() {
      settled = true;
      clearPoll();
      clearRefresh();
    }

    function takeNextRefreshType() {
      if (sequenceIndex >= refreshSequence.length) return null;
      var type = normalizeRefreshType(refreshSequence[sequenceIndex]);
      sequenceIndex += 1;
      return type;
    }

    function scheduleNextRefresh() {
      clearRefresh();
      if (sequenceIndex >= refreshSequence.length) {
        stopAll();
        return;
      }

      refreshTimer = setTimeout(function () {
        refreshTimer = null;
        if (settled) return;

        var type = takeNextRefreshType();
        if (!type) {
          stopAll();
          return;
        }

        if (type === TYPE_FALLBACK) {
          clearPoll();
          showFallback(container, slotConfig, adMeta);
          // 序列未取完则继续按间隔刷新下一项；取完才停
          if (sequenceIndex >= refreshSequence.length) {
            stopAll();
          } else {
            scheduleNextRefresh();
          }
          return;
        }

        if (type === TYPE_ADSENSE) {
          rebuildAdSense(container, slotConfig, adMeta);
          startFillWatch();
          return;
        }

        // 未知类型：跳过并尝试下一项
        scheduleNextRefresh();
      }, refreshDelayMs);
    }

    function onFilled() {
      clearPoll();
      if (sequenceIndex >= refreshSequence.length) {
        stopAll();
        return;
      }
      scheduleNextRefresh();
    }

    function onUnfilled(adUnit) {
      if (!adMeta) {
        adMeta = captureAdMeta(adUnit, slotConfig);
      }
      showFallback(container, slotConfig, adMeta);
      stopAll();
    }

    function startFillWatch() {
      clearPoll();
      pollTimer = setInterval(function () {
        if (settled) {
          clearPoll();
          return;
        }

        var adUnit = resolveAdUnit(container, allowedIdSet);
        if (!adUnit) return;
        if (!isSdkDone(adUnit)) return;

        if (!adMeta) {
          adMeta = captureAdMeta(adUnit, slotConfig);
        }

        if (isFilled(adUnit)) {
          onFilled();
          return;
        }

        if (isUnfilled(adUnit)) {
          onUnfilled(adUnit);
        }
      }, checkIntervalMs);
    }

    var initialUnit = resolveAdUnit(container, allowedIdSet);
    if (initialUnit) {
      adMeta = captureAdMeta(initialUnit, slotConfig);
    }

    startFillWatch();
  }

  function findSlotConfig(slots, containerId) {
    for (var i = 0; i < slots.length; i++) {
      if (slots[i] && slots[i].containerId === containerId) {
        return slots[i];
      }
    }
    return null;
  }

  function start(config) {
    var cfg = mergeConfig(config || global.AD_FALLBACK_CONFIG);
    var slots = cfg.slots || [];
    var containerIds = cfg.containerIds && cfg.containerIds.length
      ? cfg.containerIds
      : slots.map(function (slot) {
          return slot && slot.containerId;
        }).filter(Boolean);
    var allowedIdSet = buildContainerIdSet(containerIds);

    for (var i = 0; i < containerIds.length; i++) {
      var containerId = containerIds[i];
      if (!containerId || !allowedIdSet[containerId]) continue;
      var slotConfig = findSlotConfig(slots, containerId);
      if (!slotConfig) continue;
      bindSlot(slotConfig, cfg, allowedIdSet);
    }
    return cfg;
  }

  function boot() {
    start(global.AD_FALLBACK_CONFIG);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.AdFallbackMonitor = {
    defaults: DEFAULT_CONFIG,
    start: start
  };
})(typeof window !== "undefined" ? window : this);
