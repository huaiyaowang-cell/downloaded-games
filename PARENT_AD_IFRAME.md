# 父页广告 + iframe 游戏（广告代理方案）

## 目的

把**真实广告**（Google AdSense、`adBreak` 插屏/激励等）放在**顶层页面**加载；**游戏引擎与资源**放在 **iframe 子页面**里运行。游戏内通过 Poki SDK 触发的广告请求，经 **postMessage** 交给父页执行，避免在 iframe 内重复加载广告脚本或受跨域/展示策略限制。本仓库内常称为「父页面广告代理」或「广告桥接」。

## 页面分工

| 页面 | 典型文件名 | 职责 |
|------|------------|------|
| **父页** | `index.html` | 引入 AdSense、`adBreak`（`adConfig`）、横幅位；布局（顶/底广告条 + 中间游戏区）；加载 **`poki-ad-bridge-parent.js`**，监听子页发来的 `poki_ad_request` 并回传 `poki_ad_response`。 |
| **游戏页** | `game.html` | 仅承载游戏：先加载 **`poki-sdk-stub.js`**（本地假 Poki / 兼容接口），再加载 **`poki-ad-bridge-client.js`**（覆盖 `PokiSDK.commercialBreak` / `rewardedBreak`），最后加载游戏主脚本。 |

父页用 `<iframe src="game.html" …>` 嵌入游戏页。

## 消息与调用链（简述）

1. 游戏调用 `PokiSDK.commercialBreak()` / `rewardedBreak()`。
2. **Client**（iframe 内）发现存在 `window.parent` 且与自身不同源或同源父页，则 **不**直接播广告，改为 `postMessage` 发送 `{ type: "poki_ad_request", requestId, payload }`。
3. **Parent**（顶层）收到后调用 `window.adBreak({ … })`，在 `adBreakDone` 等回调里 `postMessage` 回复 `{ type: "poki_ad_response", requestId, ok, result }`。
4. Client 将 Promise resolve/reject，游戏逻辑继续。

若 **非 iframe**（例如直接打开 `game.html`），client 会跳过桥接，仍走 **stub** 内的本地逻辑（通常无真实广告或立即 resolve）。

## 本仓库可参考目录（`poki-ad-bridge` 方案）

以下目录均在**父页** `index.html` 引入 **`poki-ad-bridge-parent.js`**，**子页**为 **`game.html`**（iframe 嵌入），子页内为 `poki-sdk-stub.js` → `poki-ad-bridge-client.js` → 游戏主脚本。实现细节（iframe id、广告位 ID、`adBreak` 命名）因游戏略有差异。

| 目录 | 说明 |
|------|------|
| [blumgi-slime](./blumgi-slime/) | Construct；父页 `bgsGameFrame` |
| [bullet-bros](./bullet-bros/) | 同上结构 |
| [flip-bros](./flip-bros/) | 同上结构 |
| [draw-to-smash-logic-puzzle](./draw-to-smash-logic-puzzle/) | 同上结构 |
| [shape-fold-html5](./shape-fold-html5/) | OpenFL；另有 [README-LOCAL.md](./shape-fold-html5/README-LOCAL.md)（含 `request-guard` 说明） |
| [Blocky_Puzzle](./Blocky_Puzzle/) | 父页额外加载 `ads_analytics.js` |
| [puffy_cat](./puffy_cat/) | 与 Blocky_Puzzle 同属一类 miniplay 风格 |

任选其一对照即可，**[blumgi-slime](./blumgi-slime/)** 可作为最小阅读路径：父页 [index.html](./blumgi-slime/index.html)，子页 [game.html](./blumgi-slime/game.html)。

## 与 `download-mini-games` 的对应关系

小游戏的「壳 + 游戏页」与上述一致；具体实现见 **`../download-mini-games/`** 下的 [PARENT_AD_IFRAME.md](../download-mini-games/PARENT_AD_IFRAME.md)。例如 **jelly-boom** 使用父页 `index.html` + iframe 指向 `game.0.0.1.html`；若 **egg-adventure** 拆成父壳 `index.html` + 子页 `game.html`，文件角色与本文相同。

## 调试提示

- 只调游戏逻辑时可直接打开 **`game.html`**：广告走 stub，不经过父页。
- 看广告相关网络请求时，在开发者工具里把上下文切到 **顶层 (top)**，因为 AdSense / `adBreak` 在父页发起；子 iframe 内的 `request-guard` 钩子主要看到游戏资源请求。

## 相关文件命名（常见）

- `poki-sdk-stub.js` — iframe 内 Poki API 占位/兼容。
- `poki-ad-bridge-client.js` — 子页，转发广告请求。
- `poki-ad-bridge-parent.js` — 父页，执行 `adBreak` 并回复。
- `request-guard.js` — 可选；父页与子页均可早期引入以统一过滤/记录请求。

**`download-mini-games`** 里同一职责可能命名为 **`mg_ad_sdk_parent.js`** / **`mg_ad_sdk_client.js`**（见 [jelly-boom](../download-mini-games/jelly-boom/)）。
