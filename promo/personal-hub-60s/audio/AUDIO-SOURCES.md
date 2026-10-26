# Personal Hub 60 秒宣传视频音频

旁白使用 Microsoft Edge 在线 TTS 的标准合成声 `zh-CN-XiaoxiaoNeural`，通过开源 `edge-tts 7.3.1` 调用；不是声音克隆。Microsoft TTS 是在线语音服务，不宣称其模型开源。完整文案、分段时刻和语速见 `narration-script.json`。

配乐为本项目原创程序合成：104 BPM、D 大调，NumPy 生成温和和弦、琶音、低音与轻打击乐。未使用第三方音乐、采样包或受版权约束的旋律素材。旁白出现时，配乐自动降低音量。

工具：Python 3.12、NumPy、edge-tts（LGPL-3.0）、FFmpeg（本机发行版）。这些工具的许可证不改变本项目原创配乐的归属；在线 TTS 使用受服务提供方条款约束。

交付：`narration.wav`、`music.wav`、`mix.wav` 均为 60.000 秒、48 kHz、双声道、16-bit PCM。混音目标约 −16 LUFS，真峰值限制为 −1.2 dBTP。实测见 `audio-report.json`。

复现：先将 `edge-tts==7.3.1` 安装到本目录 `.deps`，执行 `python ../scripts/audio-source.py`。可用环境变量 `FFMPEG` 指定 FFmpeg 可执行文件。`--music-only` 只生成配乐，`--mix-only` 复用已有旁白和配乐重新混音，`--probe` 检查默认语速的分段时长。
