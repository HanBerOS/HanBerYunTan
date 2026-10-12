# 云坛 · 安卓 App 壳（yuntan-app · 网页仓库子目录版）

云坛的安卓 App 采用「壳 + 远程网页」模式：APK 里只装一个 WebView，内容**实时加载网页版**
（`https://hanberos.github.io/HanBerYunTan/`）。好处：

- ✅ 网页改版 = App 自动同步更新，**用户装一次，永远是最新版**，不用重装
- ✅ 干净图标、独立 App 窗口、全屏无浏览器 UI
- ✅ 绕过「vivo 自带浏览器下不了」的问题——直接装 APK 文件

---

## 上传（无需新建仓库，直接放进现有网页仓库）

把本压缩包里的 **两个文件夹** 上传到你现有的网页仓库 `HanBerYunTan` **根目录**：

```
.github/           ← workflow，GitHub 会自动识别构建
yuntan-app/        ← 安卓工程
```

用仓库的 **Add file → Upload files** 分别把 `.github` 和 `yuntan-app` 两个文件夹拖进去，Commit。
（页面地址 `https://hanberos.github.io/HanBerYunTan/`）

## 出 APK

1. 上传后 1~2 分钟，打开仓库 **Actions** 页签 → `Build APK` 工作流自动跑
2. 绿色对勾后点进运行 → 底部 **Artifacts** 下载 `yuntan-apk` → 解压得到 `app-debug.apk`
3. **把 `app-debug.apk` 改名为 `yuntan.apk`**，用 Upload files 传到 `HanBerYunTan` 仓库**根目录**
4. 网页版「安装」按钮 → 安卓用户即可「下载安卓版 APK」：
   `https://hanberos.github.io/HanBerYunTan/yuntan.apk`

## 以后更新

- **改网页功能**：只更新网页仓库的 `index.html`，App 打开即新版，无需重装 APK。
- **改 App 外壳**（图标、名称、指向地址）：改 `yuntan-app/` 后重新上传触发 Actions，
  把新 APK 覆盖网页仓库根目录的 `yuntan.apk` 即可。

## 当前配置

- App 名称：云坛；包名 `com.hanber.yuntan`；版本 6.4.6（versionCode 646）
- 指向：`https://hanberos.github.io/HanBerYunTan/`
- 图标：云坛简洁线描 LOGO（白底 · #C9ECFF 填充 · #6EB5D5 描边 · 中央"坛"字）
