/**
 * Service Worker：同域 404 → 回源到 assets-manifest.json 中的 gameUrl 域名。
 *
 * Unity WebGL 注意：
 *  - .br / .gz 回源时必须保留压缩字节与 Content-Encoding（fetch decompress:false），
 *    否则 loader 会报 "Unable to parse framework.js.br" 或 data 格式错误。
 *  - .wasm.br / .data.br 不能用 no-cors opaque（Unity 需要可读 body）。
 */

"use strict";

const SW_VERSION = "v4";
const LOCAL_INGEST_URL = "http://127.0.0.1:22222/api/sw/fallback-ingest";

let bootPromise = null;
let scopePath = null;
let fallbackBase = null;
let pathMap = null;
let manifestGameName = "";
let manifestGameUrl = "";
const reportedFallbacks = new Set();

function isCompressedAsset(pathOrUrl) {
  return /\.(br|gz)(\?|#|$)/i.test(pathOrUrl);
}

function passthroughResponse(remote) {
  const headers = new Headers(remote.headers);
  return new Response(remote.body, {
    status: remote.status,
    statusText: remote.statusText,
    headers: headers,
  });
}

async function loadManifest(basePath) {
  const res = await fetch(basePath + "assets-manifest.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("manifest http " + res.status);
  const manifest = await res.json();
  manifestGameName = String(manifest && manifest.gameName || "");
  manifestGameUrl = String(manifest && manifest.gameUrl || "");

  if (manifest && manifest.gameUrl) {
    const u = new URL(manifest.gameUrl);
    u.search = "";
    u.hash = "";
    const lastSeg = u.pathname.split("/").pop() || "";
    if (lastSeg.indexOf(".") >= 0) {
      u.pathname = u.pathname.replace(/\/[^/]*$/, "/");
    } else if (!u.pathname.endsWith("/")) {
      u.pathname = u.pathname + "/";
    }
    fallbackBase = u.toString().replace(/\/$/, "");
  }

  pathMap = new Map();
  const files = (manifest && manifest.files) || [];
  for (const f of files) {
    if (f && f.localPath && f.sourceUrl) {
      pathMap.set(f.localPath, f.sourceUrl);
    }
  }

  console.log(
    "[sw " + SW_VERSION + "] manifest loaded, base=" + fallbackBase +
    ", files=" + pathMap.size
  );
}

function ensureBoot() {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    scopePath = new URL(self.registration.scope).pathname;
    try {
      await loadManifest(scopePath);
    } catch (err) {
      console.warn("[sw " + SW_VERSION + "] manifest load failed:", err);
    }
  })();
  return bootPromise;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const p = new URL(self.location.href).pathname.replace(/\/[^/]*$/, "/");
        scopePath = p;
        await loadManifest(p);
      } catch (err) {
        console.warn("[sw " + SW_VERSION + "] install preload failed:", err);
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function computeRelativePath(url) {
  if (!scopePath) return null;
  if (!url.pathname.startsWith(scopePath)) return null;
  return url.pathname.slice(scopePath.length);
}

function computeFallbackUrl(rel, search) {
  if (pathMap && pathMap.has(rel)) {
    return pathMap.get(rel);
  }
  if (fallbackBase) {
    return fallbackBase + "/" + rel + (search || "");
  }
  return null;
}

function isLocalPreview() {
  return self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";
}

function inferRelPrefix() {
  return String(scopePath || "")
    .replace(/^\/+|\/+$/g, "");
}

async function reportFallbackIngest(rel, fallbackUrl) {
  if (!isLocalPreview()) {
    return;
  }
  const relPrefix = inferRelPrefix();
  if (!relPrefix || !rel || !fallbackUrl) return;

  const key = relPrefix + "\0" + rel;
  if (reportedFallbacks.has(key)) return;
  reportedFallbacks.add(key);

  console.log("[sw " + SW_VERSION + "] ingest -> " + LOCAL_INGEST_URL + " : " + rel);
  try {
    const res = await fetch(LOCAL_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        relPrefix,
        gameName: manifestGameName || relPrefix.split("/").filter(Boolean).pop() || "",
        pageUrl: self.registration.scope,
        gameUrl: manifestGameUrl || fallbackBase || "",
        referer: manifestGameUrl || fallbackBase || "",
        sourceUrl: fallbackUrl,
        relPath: rel,
        overwrite: true
      })
    });
    if (!res.ok) {
      reportedFallbacks.delete(key);
      console.warn("[sw " + SW_VERSION + "] ingest http " + res.status + " for " + rel);
      return;
    }
    let data = null;
    try { data = await res.json(); } catch (_) { /* ignore */ }
    if (data && data.ok) {
      console.log(
        "[sw " + SW_VERSION + "] ingest ok: " + rel +
        " -> " + (data.absPath || "(unknown)") +
        " (" + (data.bytes || 0) + "B)"
      );
    } else {
      reportedFallbacks.delete(key);
      console.warn("[sw " + SW_VERSION + "] ingest server reported failure:", rel, data);
    }
  } catch (e) {
    reportedFallbacks.delete(key);
    console.warn("[sw " + SW_VERSION + "] ingest network error:", rel, e && e.message || e);
  }
}

async function fetchFallback(fallbackUrl, rel) {
  const keepCompressed = isCompressedAsset(rel) || isCompressedAsset(fallbackUrl);
  const init = {
    credentials: "omit",
    mode: "cors",
    cache: "default",
  };
  if (keepCompressed) {
    init.decompress = false;
  }

  const remote = await fetch(fallbackUrl, init);
  if (!remote || !remote.ok) {
    return remote;
  }
  return passthroughResponse(remote);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith(handle(req, url, event));
});

async function handle(req, url, event) {
  await ensureBoot();

  if (scopePath && url.pathname === scopePath + "assets-manifest.json") {
    return fetch(req);
  }

  let localRes = null;
  try {
    localRes = await fetch(req);
  } catch (e) {
    // continue to fallback
  }

  if (localRes && localRes.ok) return localRes;
  if (localRes && localRes.status !== 404) return localRes;

  const rel = computeRelativePath(url);
  if (!rel) return localRes || Response.error();

  const fallbackUrl = computeFallbackUrl(rel, url.search);
  if (!fallbackUrl) return localRes || Response.error();

  console.warn(
    "[sw " + SW_VERSION + "] " +
    (localRes ? "404" : "neterr") + " -> fallback: " + rel + " -> " + fallbackUrl
  );

  try {
    const remote = await fetchFallback(fallbackUrl, rel);
    if (remote && remote.ok) {
      event.waitUntil(reportFallbackIngest(rel, fallbackUrl));
      return remote;
    }
  } catch (e) {
    console.warn("[sw " + SW_VERSION + "] cors fallback failed:", rel, e);
  }

  if (!isCompressedAsset(rel) && !/\.(wasm|data|js|bundle|json)(\?|#|$)/i.test(rel)) {
    try {
      const opaque = await fetch(fallbackUrl, {
        credentials: "omit",
        mode: "no-cors",
        cache: "default",
      });
      event.waitUntil(reportFallbackIngest(rel, fallbackUrl));
      return opaque;
    } catch (e) {
      // fall through
    }
  }

  return localRes || new Response(
    "[sw " + SW_VERSION + "] fallback failed: " + rel,
    { status: 502, statusText: "SW Fallback Failed" }
  );
}
