# 部署与移动端分发

「霓虹幸存者」是纯静态网页游戏(零依赖、零构建)。要支持移动端「打开即玩 + 添加到主屏幕 + 离线运行」,只需把整个目录托管到任意 HTTPS 静态空间。下面分场景说明。

---

## 1. 本地局域网快速测试(HTTP,无 PWA)

最快验证手机能否打开的方式 —— 用电脑跑一个静态服务器,手机浏览器访问:

```bash
# 在项目根目录
python3 -m http.server 8000
# 或:npx serve .  /  php -S 0.0.0.0:8000
```

手机浏览器访问 `http://<电脑局域网 IP>:8000`(例如 `http://192.168.1.5:8000`)。

- 同一 Wi-Fi 下即可。电脑防火墙需放行 8000 端口。
- macOS 防火墙会弹窗询问,选「允许」。
- 此模式可玩但 **PWA 离线缓存不可用**(SW 要求 HTTPS 或 localhost);要体验完整 PWA,见下面部署。

> 这就是为什么「拷贝文件夹到手机点 index.html」打不开的根因:iOS/Android 的 `file://` 协议下,`<script>`、`AudioContext`、`localStorage`、`manifest` 等都被严格限制。必须通过 HTTP/HTTPS 才能运行。

---

## 2. 部署到 HTTPS 静态托管(推荐,PWA 完整可用)

任选一个免费托管,推送后自动 HTTPS:

### GitHub Pages(推荐,免费)
```bash
# 在项目根目录
git init && git add -A && git commit -m "init"
git remote add origin git@github.com:<你的用户名>/neon-survivor.git
git branch -M gh-pages && git push -u origin gh-pages
```
仓库 Settings → Pages → Source 选 `gh-pages` 分支,几分钟后访问 `https://<用户名>.github.io/neon-survivor/`。

### Netlify / Vercel / Cloudflare Pages(拖拽即部署)
- Netlify: 打开 https://app.netlify.com/drop ,把整个项目文件夹拖进去,即得 HTTPS URL。
- 三者免费额度均足够个人小游戏。

部署到 HTTPS 后,Service Worker 自动注册,首次访问后所有资源被缓存,「添加到主屏幕」即可离线运行。

---

## 3. 安装到手机主屏幕(PWA)

### iOS(iPhone / iPad)
1. 用 Safari 打开部署后的 HTTPS URL(必须是 Safari,Chrome 不行)。
2. 点底部「分享」图标 → 「添加到主屏幕」→ 「添加」。
3. 主屏幕出现「霓虹幸存者」图标,点开即全屏运行,无 Safari 浏览器栏。
4. 离线可用(SW 缓存)。

### Android
1. 用 Chrome / Edge 打开 URL。
2. 地址栏会出现「安装」按钮(或菜单 → 「添加到主屏幕」/ 「安装应用」)。
3. 安装后从主屏幕启动,全屏沉浸。

### 桌面(可选)
Chrome / Edge 地址栏右侧「安装」图标,可装为桌面应用。

---

## 4. 资源更新流程

代码有更新后,推送/上传到同一地址即可。Service Worker 用版本号 `CACHE = "neon-survivor-v1"`(在 `sw.js` 顶部)。

**改了代码后,用户下次访问会拿到新版(SW activate 时清理旧缓存)**。如果发现用户卡在旧版,把 `sw.js` 里的 `CACHE` 字符串改成 `neon-survivor-v2` 等新版本号即可强制刷新。

---

## 5. 打包成原生 App(可选,需上架/侧载)

如果需要分发 APK / IPA(不通过浏览器),用 [Capacitor](https://capacitorjs.com/) 套 WebView:

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "霓虹幸存者" "com.example.neonsurvivor" --web-dir=.
npx cap add android   # 生成 Android Studio 工程
npx cap add ios       # 生成 Xcode 工程(需 macOS + Xcode)
npx cap sync
npx cap open android  # 或 open ios
```

然后在 Android Studio / Xcode 里编译出 APK / IPA。本项目零依赖纯静态,Capacitor 直接 `--web-dir=.` 指向根目录即可。

---

## 排错速查

| 现象 | 原因 | 处理 |
|---|---|---|
| 手机点 index.html 白屏 | `file://` 限制脚本/音频/localStorage | 用本地服务器或 HTTPS 部署(见 1/2) |
| 「添加到主屏幕」后图标是截图 | iOS 没拿到 apple-touch-icon | 确保用 Safari,且页面已加载完(SV.Icons.apply 已跑) |
| 安装后无离线功能 | SW 未生效(非 HTTPS 或注册失败) | 部署到 HTTPS;Chrome DevTools → Application → Service Workers 检查 |
| 横屏但游戏区被裁 | 浏览器栏未隐藏 | 用 PWA 模式(主屏幕启动)而非浏览器内 |
| 音效不出 | 移动端音频策略 | 首次点击屏幕任意位置即解锁(代码已处理) |
| 切后台回来游戏卡 | 自动暂停已触发(预期) | 点「继续」即可,不会丢进度 |
