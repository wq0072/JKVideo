# reactBilibiliApp — 项目架构与技术要点

## 项目概述
仿 B 站 React Native 客户端，使用 Expo SDK 55 + expo-router，调用 Bilibili 官方 Web API 获取热门视频、直播、视频详情、弹幕、评论、搜索及扫码登录。

## 技术栈
| 层 | 技术 |
|---|---|
| 框架 | React Native 0.83 + Expo SDK 55 |
| 路由 | expo-router v4（文件系统路由，Stack 导航） |
| 状态管理 | Zustand |
| 网络请求 | Axios |
| 本地存储 | @react-native-async-storage/async-storage |
| 视频播放（详情页/直播） | react-native-video（DASH/HLS/MP4）|
| 视频播放（首页 BigCard） | react-native-video（DASH MPD，内联自动播放） |
| 视频播放（WebView 降级） | react-native-webview（NativeVideoPlayer） |
| 页面滑动 | react-native-pager-view（首页热门/直播 Tab） |
| 图标 | @expo/vector-icons（Ionicons） |

## 目录结构
```
app/
  _layout.tsx          # 根布局：Stack 导航 + 启动时恢复登录态/下载列表/设置
                       # 全局挂载 <MiniPlayer />
  index.tsx            # 首页：PagerView 切换热门/直播；绝对定位悬浮导航栏
  video/
    _layout.tsx        # Stack 导航（无头部）
    [bvid].tsx         # 视频详情页（播放 + 简介/评论/弹幕 三 Tab + 推荐视频 + 下载）
  live/
    _layout.tsx        # Stack 导航（无头部）
    [roomId].tsx       # 直播详情页（HLS/FLV 播放 + 简介/弹幕 Tab）
  search.tsx           # 搜索页（关键词搜索视频）
  downloads.tsx        # 下载管理页（已下载视频列表）
  settings.tsx         # 设置页（封面图清晰度 + 退出登录）

components/
  VideoCard.tsx        # 双列视频卡片（封面、标题、UP主、播放量）；读 settingsStore 决定图片质量
  BigVideoCard.tsx     # 全宽视频卡片（首页热门精选），内联 react-native-video 自动播放，
                       # 支持静音/取消静音、水平滑动快进、进度条/缓冲条
  LiveCard.tsx         # 直播房间卡片（封面、主播、在线人数、直播状态脉冲点）
  LivePulse.tsx        # 直播红点动画组件
  VideoPlayer.tsx      # 视频播放器入口：web → <video>，native → react-native-video (DASH/MP4)
                       # 支持多清晰度切换
  NativeVideoPlayer.tsx# WebView 内嵌 HTML5 video，JS 注入 src（降级方案）
  LivePlayer.tsx       # 直播播放器（react-native-video HLS，多画质切换）
  DanmakuList.tsx      # 弹幕列表面板（视频/直播通用）；支持逐行逐帧 drip 渲染、
                       # 舰长标记、礼物计数、实时直播弹幕追加
  DanmakuOverlay.tsx   # 悬浮弹幕层（飘屏弹幕，用于视频播放器覆盖层）
  MiniPlayer.tsx       # 全局迷你播放器（底部悬浮，切页后继续播放）
  CommentItem.tsx      # 评论条目
  LoginModal.tsx       # 扫码登录 Modal（底部弹出）
  DownloadSheet.tsx    # 下载选择面板（选清晰度后触发下载）
  DownloadProgressBtn.tsx # 导航栏下载进度按钮（显示正在下载数量）

hooks/
  useVideoList.ts      # 热门视频 + 首页直播轮播分页加载（下拉刷新、上拉加载更多）
  useLiveList.ts       # 直播列表分页加载（按分区过滤）
  useVideoDetail.ts    # 视频详情 + 获取播放流 URL（支持多清晰度 DASH/MP4）
  useLiveDetail.ts     # 直播间详情 + HLS/FLV 流地址（支持画质切换）
  useLiveDanmaku.ts    # 直播弹幕 WebSocket 实时接收
  useComments.ts       # 评论分页加载（热评/最新排序）
  useRelatedVideos.ts  # 推荐视频流（视频详情页简介 Tab 下方）
  useSearch.ts         # 搜索钩子（分页加载搜索结果）
  useDownload.ts       # 下载任务管理

services/
  bilibili.ts          # 所有 API 请求（axios 实例 + Cookie 拦截器）
  types.ts             # 数据类型定义

store/
  authStore.ts         # Zustand 登录状态（sessdata/uid/username/face + 持久化）
  downloadStore.ts     # Zustand 下载任务列表（持久化）
  settingsStore.ts     # Zustand 用户设置（coverQuality: 'hd'|'normal' + 持久化）
  videoStore.ts        # Zustand 当前播放视频状态（供 MiniPlayer 使用）

utils/
  format.ts            # formatCount / formatDuration / formatTime
  imageUrl.ts          # proxyImageUrl（Web 代理绕防盗链）/ coverImageUrl（清晰度参数）
  dash.ts              # buildDashMpdUri（将 B 站 DASH 接口数据转换为 MPD 文件 URI）
  danmaku.ts           # danmakuColorToCss（弹幕颜色转换）
```

## 路由结构
- `/` → 首页（Stack 根页面，PagerView 热门/直播 Tab）
- `/video/[bvid]` → 视频详情（Stack push，slide_from_right 动画）
- `/live/[roomId]` → 直播详情（Stack push，slide_from_right 动画）
- `/search` → 搜索页（Stack push）
- `/downloads` → 下载管理（Stack push）
- `/settings` → 设置（Stack push，已登录时从头像按钮进入）

## 首页结构（index.tsx）
- **PagerView** 容纳热门列表（page 0）和直播列表（page 1），`scrollEnabled: false`
- **绝对定位悬浮导航栏**：Header（头像/搜索框/下载按钮）+ Tab 行（热门/直播），随内容滚动收起
- **热门列表**：`toListRows()` 将视频分为 `big`（全宽 BigVideoCard）、`live`（直播推荐）、`pair`（双列 VideoCard）三种行类型
- **直播列表**：横向分区过滤 ScrollView + 双列 LiveCard 网格，支持按分区 ID 切换
- 点击已激活 Tab 会滚动到顶并刷新数据

## BigVideoCard 内联视频（components/BigVideoCard.tsx）
- 使用 `react-native-video` 直接播放 DASH（fnval=16，buildDashMpdUri 转 MPD）
- 可见时自动播放（静音），不可见时暂停并恢复封面
- 水平滑动手势（PanResponder）实现快进/快退，显示时间标签
- 进度条 + 缓冲条；静音/取消静音按钮
- 封面图质量受 `settingsStore.coverQuality` 控制

## Bilibili API 关键点

### axios 实例（services/bilibili.ts）
- 统一携带 `Referer: https://www.bilibili.com`、`User-Agent`（模拟 Chrome）
- 请求拦截器自动注入 Cookie：`buvid3`（随机生成并持久化）+ `SESSDATA`（登录后）

### 主要接口
| 函数 | 接口 | 说明 |
|---|---|---|
| `getPopularVideos(pn)` | `/x/web-interface/popular` | 热门视频，每页 20 条 |
| `getVideoDetail(bvid)` | `/x/web-interface/view` | 视频详情（含 ugc_season 合集） |
| `getPlayUrl(bvid, cid, fnval)` | `/x/player/playurl` | 获取播放流（fnval=16 DASH，fnval=0 MP4） |
| `getRecommendFeed(idx)` | `/x/web-interface/index/top/rcmd` | 推荐视频流（详情页下方） |
| `getComments(aid, pn, sort)` | `/x/v2/reply` | 评论列表（sort=2 热评，sort=0 最新） |
| `getDanmaku(cid)` | `/x/v1/dm/list.so` | 弹幕列表（XML 格式，返回 DanmakuItem[]） |
| `getLiveRoomList(areaId, page)` | live 域名 | 直播列表（按分区） |
| `getLiveDetail(roomId)` | live 域名 | 直播间详情 + 主播信息 |
| `getLiveStream(roomId, qn)` | live 域名 | HLS/FLV 直播流地址 |
| `searchVideos(keyword, pn)` | `/x/web-interface/search/all/v2` | 视频搜索 |
| `generateQRCode()` | passport 域名 | 生成登录二维码 |
| `pollQRCode(key)` | passport 域名 | 轮询扫码状态（2s 间隔） |

### 播放流参数（重要）
```ts
// DASH（react-native-video，dev build / 生产包）
params: { bvid, cid, qn: 112, fnval: 16, platform: 'pc' }
// → 返回 dash 字段，需 buildDashMpdUri 转为本地 MPD

// MP4（WebView 降级 / Expo Go）
params: { bvid, cid, qn: 64, fnval: 0, platform: 'html5' }
// → 返回 durl[0].url (MP4)
```
- `fnval: 16` → DASH，`dash.video[]` + `dash.audio[]`，由 `buildDashMpdUri` 生成 MPD
- `fnval: 0` + `platform: 'html5'` → MP4（`durl[0].url`）
- `fnval: 1` → FLV，不可用（HTML5/WebView 不支持）
- `qn: 112` = 1080P+，`qn: 80` = 1080P，`qn: 64` = 720P，未登录时 B 站可能降级

## 视频播放架构

### 视频详情页（VideoPlayer）
```
VideoPlayer
  ├── web (Platform.OS === 'web') → 原生 <video> 标签
  └── native → react-native-video (DASH MPD / MP4)
               支持多清晰度切换、弹幕覆盖层（DanmakuOverlay）
               降级：NativeVideoPlayer (WebView + JS 注入)
```

### 首页 BigVideoCard
```
BigVideoCard
  └── react-native-video（DASH MPD，静音自动播放）
      + PanResponder 手势快进
      + 封面 Animated.View 淡出过渡
```

### 直播（LivePlayer）
```
LivePlayer
  └── react-native-video（HLS m3u8 流）
      支持画质切换（触发重新获取流地址）
```

## 弹幕系统
- **视频弹幕**：`getDanmaku(cid)` 获取全量弹幕，按时间戳 drip 渲染到 `DanmakuList`
- **直播弹幕**：`useLiveDanmaku(roomId)` 通过 WebSocket 实时接收，支持礼物计数（giftCounts）
- **弹幕覆盖**：`DanmakuOverlay` 悬浮于播放器之上，飘屏滚动
- DanmakuList 支持 `isLive` 模式（实时追加新弹幕，保留最近 500 条）

## 下载功能
- `DownloadSheet`：选择清晰度后调用 `useDownload` 触发后台下载
- `downloadStore`：持久化下载任务列表（进度、状态、本地路径）
- `DownloadProgressBtn`：导航栏图标，显示正在下载的任务数量
- `downloads.tsx`：下载管理页，列出已完成/进行中任务，支持播放和删除

## 登录流程
1. 未登录时右上角头像图标 → 弹出 `LoginModal`；已登录时跳转 `/settings`
2. 调用 `generateQRCode()` 获取 `qrcode_key` + 二维码 URL
3. 用 `https://api.qrserver.com` 渲染二维码图片（第三方服务）
4. 每 2s 轮询 `pollQRCode`，`code === 0` 时从响应 Header `set-cookie` 提取 `SESSDATA`
5. `useAuthStore.login()` 将 `SESSDATA` 写入 AsyncStorage 并更新 Zustand 状态
6. 启动时 `_layout.tsx` 调用 `restore()` 恢复登录态、下载列表、设置

## 设置（settings.tsx / settingsStore）
- `coverQuality: 'hd' | 'normal'`：控制封面图清晰度
  - `hd`：原始 URL，不加参数
  - `normal`：追加 `@320w_180h_1c.webp` 缩略图参数，节省流量
- VideoCard 和 BigVideoCard 均从 `settingsStore` 读取此值
- 退出登录功能（调用 `authStore.logout()`）

## imageUrl 工具
```ts
proxyImageUrl(url)    // Web 端转本地代理 localhost:3001/bilibili-img/...（绕防盗链）
                      // Native 端将 http:// 强制改为 https://
coverImageUrl(url, quality)  // 在 proxyImageUrl 基础上附加清晰度参数
```

## 主题色
- 主色：`#00AEEC`（B 站蓝）
- 文字主色：`#212121`
- 次要文字：`#999`
- 背景：`#f4f4f4`（列表）/ `#fff`（卡片）
- 危险色（退出登录等）：`#ff4757`

## 开发注意事项

### 运行方式
- Dev Build（推荐）：`expo run:android`，支持 react-native-video（DASH/HLS）
- Expo Go：`expo start` 扫码，react-native-video 可用但部分编解码受限，降级用 WebView 方案

### 常见问题
- **视频无法播放**：检查 `fnval`；DASH 需确认 `buildDashMpdUri` 生成的 MPD 合法
- **API 403**：`buvid3` Cookie 或 `SESSDATA` 失效，清除 AsyncStorage 重试
- **评论为空**：B 站部分视频评论区关闭，`replies` 字段为 null 属正常
- **二维码过期**：`pollQRCode` 返回 `code === 86038`，关闭 Modal 重新打开即可
- **直播无法播放**：确认 HLS URL 有效；部分直播间仅提供 FLV，需选 FLV 流
- **封面加载慢**：在设置中切换为「普通」清晰度可减小图片体积

### 扩展方向
- 动态流：需更高权限 Cookie（`bili_jct` CSRF Token）
- 投稿/点赞/收藏：需登录态 + CSRF
- 离线弹幕导出：DanmakuItem 已有完整数据结构
