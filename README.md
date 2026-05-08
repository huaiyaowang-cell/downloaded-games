# 游戏资源发布命令手册

这份文档给新人快速说明 `downloaded-games` 项目中的常用命令（游戏资源上传、离线包生成与上传）。

## 执行目录

以下命令都在 `downloaded-games` 目录执行：

```bash
cd /Users/neptune/Downloads/downloaded-games
```

## 先准备配置

编辑 `conf.rabigame.yaml`，至少保证这几项正确：

- `BUCKET`: 例如 `rabigame`
- `GC_KEY`: GCP service account 信息（JSON 对象或 JSON 文件路径）
- `BUCKET_TARGET`: 例如 `r_game`
- `UPLOAD_INCLUDE_FOLDERS`: 本次要上传的游戏目录
- `UPLOAD_EXCLUDE_FOLDERS`: 上传时要排除的目录
- `UPLOAD_INCLUDE_FILES` / `UPLOAD_EXCLUDE_FILES`: 上传文件名白/黑名单（glob）
- `OFFLINE_INCLUDE_FOLDERS`: 本次要生成离线包的游戏目录
- `OFFLINE_UPLOAD_TIMEOUT_SEC` / `OFFLINE_UPLOAD_RETRIES` / `OFFLINE_UPLOAD_CHUNK_SIZE_MB`: 大离线包上传优化参数

说明：`upload_root_folders_to_bucket.py` 中不再写死具体游戏目录，项目级配置都放在 `conf.rabigame.yaml`。

## 配置示例

### 示例 1：上传单个游戏目录

```yaml
BUCKET_TARGET: r_game
UPLOAD_INCLUDE_FOLDERS:
  - drive-mad
UPLOAD_INCLUDE_FILES: []
UPLOAD_EXCLUDE_FILES: []
```

### 示例 2：上传嵌套路径游戏目录

```yaml
BUCKET_TARGET: r_game
UPLOAD_INCLUDE_FOLDERS:
  - admob_ads/Blocky_Puzzle
```

会上传到：
`r_game/admob_ads/Blocky_Puzzle/...`

### 示例 3：只上传指定类型文件

```yaml
UPLOAD_INCLUDE_FOLDERS:
  - color-pencil-run-test
UPLOAD_INCLUDE_FILES:
  - "*.html"
  - "*.js"
  - "*.wasm.br"
UPLOAD_EXCLUDE_FILES:
  - "*.map"
```

### 示例 4：离线包独立游戏列表

```yaml
OFFLINE_INCLUDE_FOLDERS:
  - happy-glass
  - drive-mad
```

离线包命令会优先使用 `OFFLINE_INCLUDE_FOLDERS`，不配时才回退到 `UPLOAD_INCLUDE_FOLDERS`。

### 示例 5：大离线包上传优化

```yaml
OFFLINE_UPLOAD_TIMEOUT_SEC: 1800
OFFLINE_UPLOAD_RETRIES: 6
OFFLINE_UPLOAD_CHUNK_SIZE_MB: 16
```

适合几十 MB 或更大的 zip，网络波动时更稳。

## 命令说明

### 依赖安装

```bash
npm run upload:bucket:deps
```

安装 Python 依赖（`google-cloud-storage`、`pyyaml`）。

### 线上资源上传（正式）

```bash
npm run upload:bucket
```

把游戏资源上传到 `BUCKET_TARGET`，例如 `r_game/<game>/...`。

### 线上资源上传（dev 环境）

```bash
npm run upload:bucket-dev
```

上传到 dev 前缀，自动把 `BUCKET_TARGET` 变为 `<BUCKET_TARGET>/dev`，例如 `r_game/dev/<game>/...`。

### 上传预览（不真正上传）

```bash
npm run upload:bucket:dry
```

只打印待上传文件列表，适合上线前检查。

### 仅重试上次失败文件

```bash
npm run upload:bucket:retry-failed
```

按每个游戏目录中的失败日志重传，避免全量重复上传。

### 只生成离线包（zip）

```bash
npm run offline:build
```

按配置的游戏列表生成离线包，输出到：
`a-offline-game-zip/<game_name>/<game_name>-<hash>.zip`

### 只上传离线包

```bash
npm run offline:upload
```

上传已存在离线包（每个游戏目录取最新 zip）。

### 生成并上传离线包

```bash
npm run offline:build-upload
```

先生成再上传。上传结束会打印：

- 离线包 CDN 地址
- Storage 源地址
- CDN 游戏入口地址（`.../<BUCKET_TARGET>/<game>/index.html`）

## 新人推荐流程

1. 配好 `conf.rabigame.yaml`
2. 先跑 `npm run upload:bucket:dry` 做预览
3. 跑 `npm run upload:bucket` 或 `npm run upload:bucket-dev`
4. 需要离线包时跑 `npm run offline:build-upload`
5. 如果上传中断或失败，优先用 `npm run upload:bucket:retry-failed`
