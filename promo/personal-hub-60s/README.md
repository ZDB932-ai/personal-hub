# Personal Hub · 60 秒产品宣传片

主题：**让记录接上行动。**

成片规格：1920 × 1080，16:9，30 fps，60 秒；H.264 / AAC，中文合成旁白、内嵌字幕、原创配乐。

## 交付内容

- `Personal-Hub-60s-1080p.mp4`：可直接播放和分享的成片。
- `poster.jpg`：视频封面。
- `subtitles.zh-CN.srt`：可编辑中文字幕。
- `timeline.json`：分镜、文案与字幕时间轴。
- `scripts/render.py`：Pillow 动画与 FFmpeg 编码源码。
- `capture-ui.mjs`：真实界面采集脚本，在产品仓库根目录运行。
- `assets/`：真实产品截图与现有品牌图标。
- `audio/`：独立旁白、原创配乐、最终混音与来源记录。
- `scripts/audio-source.py`：可复现的旁白生成、原创合成配乐与混音流程。
- `preview/contact-sheet.jpg`：分镜检查图。
- `verification.json`：最终视频参数与解码检查。

## 镜头顺序

| 时间 | 内容 |
| --- | --- |
| 00–05 | 零散的想法、任务与资料 |
| 05–11 | Personal Hub 品牌与定位 |
| 11–20 | 今天列表、子任务、日历安排 |
| 20–28 | 备忘录、灵感与行动 |
| 28–36 | 资料归档、预览与查找 |
| 36–44 | 密码与个人资料本地加密 |
| 44–53 | 桌面、移动布局与外观风格 |
| 53–60 | 品牌收尾与项目地址 |

## 修改与重新渲染

视频工程与产品代码独立。界面使用当前本地源码运行后的真实截图，所有演示内容均为虚构数据。移动镜头来自浏览器中的响应式界面，不作为 Android 原生功能验收证据。

修改 `timeline.json` 中的文案与字幕，或替换同名截图；画面位置、动效与字体在 `scripts/render.py` 中调整。主要展示标题当前同时位于渲染函数中，改标题时应同步修改该函数。

在 Windows 上安装 Python、Pillow 与 FFmpeg，并确保 `ffmpeg` 在 PATH 中：

```powershell
python -m pip install pillow numpy edge-tts
python scripts/render.py --preview
python scripts/render.py
```

脚本从 Windows Fonts 读取微软雅黑与 Segoe UI，工程未打包字体文件。其他系统需修改脚本字体路径。

现成音频可直接用于重复渲染，无需联网。重新生成旁白需使用 edge-tts 调用 Microsoft Edge 在线语音服务；它使用标准合成声 Xiaoxiao，未克隆或模仿真实人物。重做音频请参阅 `audio/AUDIO-SOURCES.md` 与脚本参数。

`python scripts/render.py --no-subtitles --output Personal-Hub-60s-clean.mp4` 可输出无内嵌字幕的画面版本。每次只运行一个渲染进程；编码成功后才会替换正式输出。

重新拍摄 UI 时，先在产品仓库运行 `npm run build`，然后从产品仓库根目录运行 `node promo/personal-hub-60s/capture-ui.mjs`。脚本依赖产品的 Playwright 包和系统 Edge，在回环地址启动临时静态服务并创建隔离上下文；结束后自动关闭。

## 工具与素材来源

- [FFmpeg](https://ffmpeg.org/)：H.264 / AAC 编码与音频处理。
- [Pillow](https://pillow.readthedocs.io/en/stable/)：图层、文字与逐帧动画。
- [Playwright](https://playwright.dev/)：隔离浏览器中的真实界面采集。
- [NumPy](https://numpy.org/)：原创电子配乐合成。
- [edge-tts](https://github.com/rany2/edge-tts)：在线标准合成语音客户端；语音服务本身不是本地开源模型。
- 品牌图标：项目现有 `assets/icon.png`。
- 界面：当前项目本地工作区，合成账户与虚构任务、文档、账号。
- 音乐：本视频原创程序合成，没有第三方音乐采样。

片中没有展示第三方角色桌宠、外部艺术壁纸、真实账号资料或云同步效果。项目公开入口为 https://github.com/ZDB932-ai/personal-hub ，当前开发界面不等同于某个历史发布包。
