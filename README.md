<div align="center">
  <img src="./src/renderer/src/assets/readex-logo.png" width="112" height="112" alt="Readex logo" />
  <h1>Readex</h1>
  <p>A local-first, portable ebook reader for Windows.</p>
  <p>
    <a href="#english">English</a>
    ·
    <a href="#chinese">简体中文</a>
    ·
    <a href="./LICENSE">License</a>
    ·
    <a href="./DESIGN.md">Technical Design</a>
    ·
    <a href="https://linux.do/">友情链接：LINUX DO</a>
  </p>
</div>

<a id="english"></a>

## English

Readex is a local-first ebook reader for Windows. It requires no sign-in and does not include accounts or cloud sync. Books, workspaces, reading progress, settings, highlights, annotations, and bookmarks are stored in the `data/personal` directory next to the application. Except for online text-to-speech, the core reading workflow works offline. Readex supports DRM-free EPUB, MOBI/KF8, text-based PDF, and TXT files, with highlights, notes, bookmarks, auto-scroll, and text-to-speech.

Author: Xiaoyao.Hao

### Features

- Supports DRM-free EPUB, MOBI/KF8, text-based PDF, and TXT.
- Multi-select or drag-and-drop import, SHA-256 deduplication, and automatic metadata and cover extraction.
- Each book has an independent workspace; open order, current book, and reading position are restored after restarting.
- EPUB continuous scrolling, MOBI/TXT chapter flow, and a PDF Canvas with a text selection layer.
- Table of contents, chapter progress, in-book search, reading position restoration, and a unified annotation model across formats.
- Four-color highlights, comments, bookmarks, copy, and a text context menu; notes support location, deletion, and Markdown export.
- Dark, light, eye-care, and custom themes, with adjustable font, font size, line height, paragraph spacing, letter spacing, and content width.
- Precision scrolling, smooth scrolling, small adjustments, and constant-speed auto-scroll from level 1 to 100.
- Online text-to-speech for TXT, MOBI/KF8, and EPUB, with voice, speed, volume, current-sentence highlighting, and caching.
- A non-always-on-top frameless floating reader that supports dragging from content or borders, text selection, minimization, and closing.
- Native Windows window controls, full screen, window snapping, multi-book workspaces, and a portable data directory.
- ZIP backup for `personal`, directory access, path copying, and safe clearing.

### Quick Start

Development environment:

```powershell
pnpm install
pnpm dev
```

Local verification:

```powershell
pnpm typecheck
pnpm test
pnpm build
```


#### Import and Read

Import books through the File menu, `Ctrl+O`, the import button, or by dragging ebooks into the window. Imported books appear in the library on the left. Click a book to create or restore its independent workspace.

#### Annotations and Notes

After selecting text, use the floating toolbar or context menu to add four-color highlights, comments, copies, and bookmarks. In the note editor, press `Enter` to save and `Ctrl+Enter` or `Shift+Enter` to insert a new line.

#### Auto-Scroll and Text-to-Speech

The controls on the right side of the reading area provide precision scrolling, auto-scroll, and text-to-speech. Auto-scroll supports speeds from 1 to 100 with color indicators. Text-to-speech supports TXT, MOBI/KF8, and EPUB and starts from the first sentence in the current viewport. PDF and scanned OCR content are not currently supported.

#### Floating Reader

The "Floating Reader" action in the reading toolbar hides the main window and opens a separate frameless window. The floating reader is not always on top. You can drag it from empty areas outside the text or from the left, right, and bottom borders, and a native drag strip is available inside the top edge. Text selection takes priority over window dragging. The top-right corner provides minimize and close buttons, while the right side provides controls to return to the main interface, scroll, and use text-to-speech.

#### Back Up Personal Data

Open Personal Data Management from the File menu to view the path and size, back up `personal` as a ZIP file, open the directory, copy the path, or safely clear it. Clearing only affects `personal`; it does not delete the original ebooks selected before import or the rebuildable `cache`.

### Data and Privacy

On first launch, the portable edition creates the following structure next to `Readex.exe`:

```text
data/
  personal/               # Books, settings, workspaces, progress, and notes; copy this directory when migrating
    settings.json
    library.json
    books/<bookId>/
      source.epub|mobi|pdf|txt
      metadata.json
      annotations.json
      reading-state.json
  cache/                  # Parsed content and TTS audio; safe to rebuild
    import/
    parsed/<bookId>/
    tts/
```

Core reading data is stored only on the local machine. When online text-to-speech is enabled, the sentence currently being synthesized is sent to the Microsoft Edge online speech service. Book files, notes, and the complete library are not uploaded. Packaged renderer windows block HTTP, HTTPS, and WebSocket requests by default; network access is performed only by the main-process text-to-speech service.

### Packaging

```powershell
pnpm dist:green   # Recommended: green directory ZIP, fastest startup
pnpm dist         # Single-file Portable EXE, easier to carry
pnpm dist:dir     # Uncompressed win-unpacked directory
pnpm dist:signed  # Validate the signing environment and build the Portable EXE and ZIP
```

Main output files:

```text
release/Readex-0.1.0.exe

```

You can also double-click `build-share-zip.bat` to create a lightweight share ZIP. The script builds the application, trims language packs, excludes personal data, creates the archive, and calculates its SHA-256 hash.


### Known Limitations

- Readex does not bypass Kindle, Adobe, or publisher DRM.
- `.azw3` is not an officially supported format in the file picker.
- Scanned PDFs have no OCR, so text selection, search, annotation, and text-to-speech are unavailable.
- Readex currently has no accounts, cloud sync, multi-device sync, automatic updates, or reading statistics.
- Global search covers notes only and does not include a full-text index across all books.
- Online text-to-speech depends on the network and the Microsoft Edge online speech service.

### License

Readex is source-available under the PolyForm Noncommercial License 1.0.0. You may use, modify, and distribute the software only for noncommercial purposes. Commercial use requires prior written permission from the copyright holder. This is not an OSI-approved open source license.

### Related Links

- [License](./LICENSE): PolyForm Noncommercial License 1.0.0.
- [Technical Design](./DESIGN.md): architecture, data contracts, internal logic, performance optimization, troubleshooting, and maintenance conventions.
- [LINUX DO](https://linux.do/): friend link.

---

<a id="chinese"></a>

## 简体中文

Readex 是一个面向 Windows 的本地优先电子书阅读器。应用不登录、不接入账号或云同步；图书、工作区、阅读进度、设置、高亮、批注和书签都保存在程序旁的 `data/personal` 目录。除在线听书外，核心阅读流程可以离线使用。支持无 DRM 的 EPUB、MOBI/KF8、文本型 PDF 和 TXT，并提供高亮、笔记、书签、自动滚动与听书等完整阅读能力。

作者：Xiaoyao.Hao

## 功能概览

- 支持无 DRM 的 EPUB、MOBI/KF8、文本型 PDF 和 TXT。
- 多选或拖放导入，使用 SHA-256 去重，自动提取元数据与封面。
- 每本书拥有独立工作区，重启后恢复打开顺序、当前书籍和阅读位置。
- EPUB 连续滚动、MOBI/TXT 章节流、PDF Canvas 与文本选择层。
- 目录、章节进度、当前书搜索、阅读位置恢复和多格式统一标注模型。
- 四色高亮、评论、书签、复制和文本右键菜单；笔记支持定位、删除和 Markdown 导出。
- 深色、明亮、护眼和自定义主题，可调字体、字号、行距、段距、字距和内容宽度。
- 精细滚动、平滑滚动、上下微调，以及 1 至 100 级匀速自动滚动。
- TXT、MOBI/KF8、EPUB 在线听书，支持音色、语速、音量、当前句高亮和缓存。
- 非置顶无边框浮框阅读，支持内容与边框拖动、文本选择、最小化和关闭。
- Windows 原生窗口控制、全屏、贴边、多书工作区和便携数据目录。
- `personal` 支持 ZIP 备份、目录定位、路径复制和安全清空。

## 许可证

Readex 采用 PolyForm Noncommercial License 1.0.0 进行源码公开。允许个人学习及其他非商业用途下的使用、修改和分发；任何商业用途均须事先取得版权持有人的书面许可。该协议不属于 OSI 认可的开源协议。

## 相关链接

- [许可证](./LICENSE)：PolyForm Noncommercial License 1.0.0。
- [技术设计](./DESIGN.md)：架构、数据契约、内部逻辑、性能优化、故障排查和维护约定。
- [LINUX DO](https://linux.do/)：友情链接。


### 导入与阅读

通过文件菜单、`Ctrl+O`、导入按钮，或直接把电子书拖进窗口。导入后的图书会进入左侧书库，点击即可创建或恢复独立工作区。

### 标注与笔记

选中正文后可使用浮动工具或右键菜单添加四色高亮、评论、复制和书签。笔记编辑器使用 `Enter` 保存，`Ctrl+Enter` 或 `Shift+Enter` 换行。

### 自动滚动与听书

阅读区右侧提供精细滚动、自动滚动和听书控件。自动滚动支持 1 至 100 级速度和颜色提示；听书支持 TXT、MOBI/KF8、EPUB，并从当前视口第一句开始。PDF 和扫描版 OCR 暂不支持听书。

### 浮框阅读

阅读工具栏的“浮框阅读”会隐藏主窗口并打开独立无边框窗口。浮框不是系统置顶窗口；正文外空白区和左右、底部边框可拖动，顶部内侧提供原生拖动带。正文选区优先于窗口拖动，右上角保留最小化和关闭按钮，右侧可返回主界面或控制滚动和听书。

### 备份个人资料

从文件菜单打开“个人资料管理”，可以查看路径和占用、备份为 ZIP、打开目录、复制路径或安全清空。清空只处理 `personal`，不会删除导入前的原始电子书或可重建的 `cache`。

## 数据与隐私

便携版首次启动后会在 `Readex.exe` 同目录创建：

```text
data/
  personal/               # 图书、设置、工作区、进度、笔记，迁移时复制此目录
    settings.json
    library.json
    books/<bookId>/
      source.epub|mobi|pdf|txt
      metadata.json
      annotations.json
      reading-state.json
  cache/                  # 解析结果和听书音频，可安全重建
    import/
    parsed/<bookId>/
    tts/
```

核心阅读数据只保存在本机。启用在线听书时，当前朗读句子会发送给 Microsoft Edge 在线语音服务；图书文件、笔记和完整书库不会上传。打包版渲染窗口默认阻止 HTTP、HTTPS 和 WebSocket 请求，网络访问仅由主进程听书服务完成。

## 打包

```powershell
pnpm dist:green   # 推荐：绿色目录 ZIP，启动最快
pnpm dist         # 单文件 Portable EXE，便于携带
pnpm dist:dir     # 未压缩 win-unpacked 目录
pnpm dist:signed  # 校验签名环境并生成 Portable EXE 和 ZIP
```

主要输出：

```text
release/Readex-0.1.0.zip
release/Readex-0.1.0.exe
```

也可以双击 `build-share-zip.bat` 生成轻量分享 ZIP。该脚本会完成构建、语言包裁剪、排除个人数据、压缩和 SHA-256 计算。

## 已知限制

- 不绕过 Kindle、Adobe 或出版社 DRM。
- `.azw3` 不是文件选择器中的正式支持格式。
- 扫描版 PDF 没有 OCR，不能选择文字、搜索、标注或听书。
- 当前没有账号、云同步、多设备同步、自动更新和阅读统计。
- 全局搜索只覆盖笔记，不包含跨书正文全文索引。
- 在线听书依赖网络和 Microsoft Edge 在线语音服务。

更完整的实现与维护说明见 [技术设计](./DESIGN.md)。
