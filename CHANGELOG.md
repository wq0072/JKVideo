# Changelog

所有重要更新都记录在此文件中。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

---

## [1.0.12] - 2026-03-25

### 新增
- **UP主信息**：视频详情页博主名称下方展示粉丝数和视频数（`getUploaderStat` → `/x/web-interface/card`）
- **视频相关推荐**：详情页推荐列表改为基于当前视频（`getVideoRelated` → `/x/web-interface/archive/related`），不再与首页 feed 共用

### 修复
- **直播全屏退出暂停**：全屏改用 `position:absolute` 覆盖，Video 组件始终在同一棵 React 树中，不再因 Modal 切换导致重建暂停；退出全屏时直播自动暂停
- **直播画质选中**：`changeQuality` 强制用请求的 `qn` 覆盖服务端协商值，画质面板高亮与用户选择一致
- **直播画质过滤**：过滤 `qn > 10000` 的选项（杜比/4K），最高仅展示原画
- **推荐视频导航**：点击推荐列表改用 `router.replace`，避免详情页无限堆叠

### 优化
- **直播画质面板**：改为居中 Modal 弹出框
- **视频详情 Tab**：按钮向左靠齐，移除均分宽度
- **评论排序按钮**：统一为实心背景风格（`#f0f0f0` → `#00AEEC`），与直播分区 Tab 一致
- **设置页按钮**：外观/流量选项按钮统一为实心背景风格

## [1.0.11] - 2026-03-24

### 新增
- **暗黑模式**：全局主题系统（`utils/theme.ts`），支持亮色 / 暗色一键切换，覆盖所有页面和组件
- **节流模式**：设置页新增流量节省开关，开启后使用低画质封面、首页视频不自动播放、视频默认 360p 画质
- **本地二维码生成**：登录二维码改用 `react-native-qrcode-svg` 本地渲染，移除对 `api.qrserver.com` 的外部依赖，提升可靠性

### 修复
- **SeasonSection 背景色**：合集组件背景色与父容器不一致，现跟随主题色 (`theme.card`) 正确显示
- **推荐列表 Loading 状态**：空列表加载中未显示 spinner（`ListEmptyComponent` 条件逻辑反转）
- **合集滚动定位偏移**：`getItemLayout` offset 计算未计入卡片间距（`gap: 10`），导致 `scrollToIndex` 定位不准
- **推荐视频卡片双边框**：相邻推荐视频卡片之间出现双分割线

## [1.0.0] — 2026-03-20

### 首个正式版本

#### 视频播放
- DASH 完整播放：Bilibili DASH 接口 → `buildDashMpdUri()` 生成本地 MPD → ExoPlayer 原生解码
- 支持多清晰度切换（360P / 480P / 720P / 1080P / 1080P+ / 4K）
- BigVideoCard 首页内联 DASH 静音自动播放，支持水平手势快进、进度条/缓冲条
- 全局迷你播放器（MiniPlayer），切换页面后底部浮层续播
- WebView 降级方案（NativeVideoPlayer），兼容 Expo Go 环境

#### 直播
- 直播 Tab 顶部显示关注主播在线状态
- 双列直播卡片网格 + 横向分区筛选
- 热门列表中穿插直播推荐卡片
- LivePlayer 支持 HLS 多画质切换
- 直播弹幕 WebSocket 实时接收，舰长标记 + 礼物计数

#### 弹幕系统
- 视频弹幕：XML 全量拉取 + 时间轴同步 drip 渲染
- DanmakuOverlay 飘屏覆盖层（5 车道滚动）
- DanmakuList 支持实时直播模式（保留最近 500 条）

#### 搜索 & 内容
- 视频关键词搜索 + 分页加载
- 视频详情：简介 / 评论 / 弹幕 三 Tab
- 推荐视频流（无限滚动）
- 评论列表（热评 / 最新排序切换）

#### 账号 & 设置
- 扫码登录（二维码 + 2s 轮询 + SESSDATA 自动提取）
- 登录态持久化（AsyncStorage）
- 封面图清晰度设置（高清 / 普通，节省流量）

#### 下载 & 分享
- 多清晰度视频后台下载
- 下载管理页（播放、删除已下载视频）
- 局域网 HTTP 服务器，生成 QR 码分享，同 Wi-Fi 设备扫码直接播放

#### 跨平台
- Android、iOS、Web 三端支持
- Expo Go 扫码快速运行（UI 预览模式）
- Dev Build 完整功能（DASH 原生播放）
