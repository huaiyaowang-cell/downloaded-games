/**
 * AdSense 横幅自动刷新（仅真实广告，不出静态兜底，且刷新期间不空白）。
 *
 * 策略：
 * 1. 初始：页面内联的 <ins class="adsbygoogle"> 由 AdSense 正常填充，显示真实广告。
 * 2. 填充成功后，按 refreshSequence 顺序每隔 refreshDelayMs 刷新一次：
 *    - "adsense"  → 新建一个 AdSense 单元并尝试填充；新广告「填充成功」才替换旧广告，
 *                   否则保留旧广告（永不空白）。这实现了横幅随时间变化且始终有真实广告。
 *    - "fallback" → 仅当配置了 fallbackUrl 时显示兜底（本游戏不配置，故不会走此分支）。
 *    序列取完后停止刷新。
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

  function hasFallbackUrl(slotConfig) {
    return !!(slotConfig && slotConfig.fallbackUrl && String(slotConfig.fallbackUrl).trim() !== "");
  }

  function showFallback(container, slotConfig, adMeta) {
    if (!hasFallbackUrl(slotConfig)) return;
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

  function buildNewIns(adMeta, slotConfig) {
    var width = (adMeta && adMeta.width) || slotConfig.width || 320;
    var height = (adMeta && adMeta.height) || slotConfig.height || 50;
    var client = (adMeta && adMeta.client) || slotConfig.adClient || "";
    var slot = (adMeta && adMeta.slot) || slotConfig.adSlot || "";
    var el = document.createElement("ins");
    el.className = "adsbygoogle";
    el.style.display = "inline-block";
    el.style.width = width + "px";
    el.style.height = height + "px";
    if (client) el.setAttribute("data-ad-client", client);
    if (slot) el.setAttribute("data-ad-slot", slot);
    return el;
  }

  function bindSlot(slotConfig, cfg, allowedIdSet) {
    if (!slotConfig || !slotConfig.containerId) return;
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
    var swapTimer = null;
    var settled = false;
    var currentIns = resolveAdUnit(container, allowedIdSet);
    var adMeta = currentIns ? captureAdMeta(currentIns, slotConfig) : null;

    function clearPoll() {
      if (pollTimer != null) { clearInterval(pollTimer); pollTimer = null; }
    }
    function clearRefresh() {
      if (refreshTimer != null) { clearTimeout(refreshTimer); refreshTimer = null; }
    }
    function clearSwap() {
      if (swapTimer != null) { clearTimeout(swapTimer); swapTimer = null; }
    }
    function clearAll() { clearPoll(); clearRefresh(); clearSwap(); }
    function stopAll() { settled = true; clearAll(); }

    // 刷新一次 AdSense：保留旧广告，尝试加载新广告，只有新广告填充成功才替换。
    function refreshAdSense(done) {
      if (!currentIns) {
        try { (global.adsbygoogle = global.adsbygoogle || []).push({}); } catch (e) {}
        done();
        return;
      }
      var oldIns = currentIns;
      var newIns = buildNewIns(adMeta, slotConfig);
      container.appendChild(newIns);
      oldIns.style.display = "none";
      try { (global.adsbygoogle = global.adsbygoogle || []).push({}); } catch (e) {}

      var resolved = false;
      var watchTimer = setInterval(function () {
        if (settled || resolved) { clearInterval(watchTimer); return; }
        if (!isSdkDone(newIns)) return;
        if (isFilled(newIns)) {
          resolved = true;
          clearInterval(watchTimer);
          if (oldIns.parentNode) oldIns.parentNode.removeChild(oldIns);
          currentIns = newIns;
          adMeta = captureAdMeta(newIns, slotConfig);
          done();
        } else if (isUnfilled(newIns)) {
          resolved = true;
          clearInterval(watchTimer);
          if (newIns.parentNode) newIns.parentNode.removeChild(newIns);
          oldIns.style.display = "inline-block";
          currentIns = oldIns;
          done();
        }
      }, checkIntervalMs);

      // 超时保护：长时间无定论则恢复旧广告，避免空白
      swapTimer = setTimeout(function () {
        if (resolved) return;
        resolved = true;
        clearInterval(watchTimer);
        if (newIns.parentNode) newIns.parentNode.removeChild(newIns);
        oldIns.style.display = "inline-block";
        currentIns = oldIns;
        done();
      }, Math.max(refreshDelayMs, 15000));
    }

    function scheduleNext() {
      clearRefresh();
      if (settled) return;
      if (sequenceIndex >= refreshSequence.length) { stopAll(); return; }
      refreshTimer = setTimeout(doNextRefreshOrStop, refreshDelayMs);
    }

    function doNextRefreshOrStop() {
      if (settled) return;
      if (sequenceIndex >= refreshSequence.length) { stopAll(); return; }
      var type = normalizeRefreshType(refreshSequence[sequenceIndex]);
      sequenceIndex += 1;
      if (type === TYPE_FALLBACK) {
        if (hasFallbackUrl(slotConfig)) showFallback(container, slotConfig, adMeta);
        scheduleNext();
      } else if (type === TYPE_ADSENSE) {
        refreshAdSense(scheduleNext);
      } else {
        scheduleNext();
      }
    }

    function onFilled() {
      clearPoll();
      if (sequenceIndex >= refreshSequence.length) { stopAll(); return; }
      scheduleNext();
    }

    function onUnfilled() {
      // 初始即未填充：有兜底则显示，否则保留现状（与原生行为一致，可能短暂空白）
      if (hasFallbackUrl(slotConfig)) showFallback(container, slotConfig, adMeta);
      stopAll();
    }

    function startFillWatch() {
      clearPoll();
      pollTimer = setInterval(function () {
        if (settled) { clearPoll(); return; }
        var u = currentIns || resolveAdUnit(container, allowedIdSet);
        if (!u) return;
        if (!isSdkDone(u)) return;
        if (!adMeta) adMeta = captureAdMeta(u, slotConfig);
        if (isFilled(u)) { onFilled(); return; }
        if (isUnfilled(u)) { onUnfilled(u); }
      }, checkIntervalMs);
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
