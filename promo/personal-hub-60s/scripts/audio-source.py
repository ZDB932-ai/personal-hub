from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import wave

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / 'audio'
sys.path.insert(0, str(AUDIO / '.deps'))
FFMPEG = os.environ.get('FFMPEG', r'C:\Users\ZDB\.codely-cli\tmp\bin\ffmpeg.exe')
SR = 48000
DURATION = 60.0
N = int(SR * DURATION)
VOICE = 'zh-CN-XiaoxiaoNeural'
SCRIPT = [
    (0.6, 4.8, '想法、任务、资料，总在不同地方来回切换？'),
    (5.5, 10.5, '让 Personal Hub，把它们放进同一个个人工作台。'),
    (11.5, 19.2, '从今天要做的事开始。拆分子任务，安排时间，让每一步都清楚。'),
    (20.5, 27.3, '随手记下灵感，整理备忘录，再把想法变成可以推进的任务。'),
    (28.5, 35.3, '文档、图片和常用资料，集中归档，随时预览。需要的时候，一搜就能找到。'),
    (36.5, 43.2, '账号密码与个人资料，在本地加密保存。让信息有序，也让自己安心。'),
    (44.5, 52.3, '从电脑到手机，用熟悉的方式继续。再选一套喜欢的外观，让工作台更像你。'),
    (53.5, 59.2, 'Personal Hub。让记录接上行动，把生活与工作，慢慢理顺。'),
]


def run(args, **kwargs):
    return subprocess.run([FFMPEG, '-hide_banner', '-nostdin', '-y', *args], check=True, capture_output=True, **kwargs)


def read_audio(path):
    data = run(['-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', str(SR), 'pipe:1']).stdout
    return np.frombuffer(data, dtype='<f4').astype(np.float64)


def write_audio(path, data):
    data = np.asarray(data)
    if data.ndim == 1:
        data = np.stack([data, data], axis=1)
    data = np.rint(np.clip(data, -0.999969, 0.999969) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def trim_silence(data):
    active = np.flatnonzero(np.abs(data) > 0.0012)
    if not len(active):
        raise RuntimeError('TTS produced no audible voice')
    first = max(0, int(active[0] - SR * 0.10))
    last = min(len(data), int(active[-1] + SR * 0.16))
    data = data[first:last].copy()
    fade = min(int(SR * 0.012), len(data) // 2)
    data[:fade] *= np.linspace(0, 1, fade)
    data[-fade:] *= np.linspace(1, 0, fade)
    return data


async def speech(probe_only=False):
    import edge_tts
    AUDIO.mkdir(parents=True, exist_ok=True)
    clips = AUDIO / 'clips'
    clips.mkdir(exist_ok=True)
    results = []
    sem = asyncio.Semaphore(3)

    async def one(index, start, end, text):
        async with sem:
            available = end - start
            rate = 0
            source = clips / f'{index:02d}-source.mp3'
            for attempt in range(4):
                await edge_tts.Communicate(text, VOICE, rate=f'{rate:+d}%', pitch='+0Hz').save(str(source))
                data = trim_silence(read_audio(source))
                seconds = len(data) / SR
                print(f'clip {index} rate {rate:+d}%: {seconds:.3f}s / {available:.3f}s', flush=True)
                if seconds <= available - 0.03 or probe_only:
                    break
                rate = max(rate + 3, math.ceil((1 + rate / 100) * seconds / (available - 0.08) * 100 - 100))
                if rate > 35:
                    raise RuntimeError(f'Clip {index} needs rate {rate}%. Shorten copy instead of rushing voice.')
            if not probe_only and seconds > available:
                raise RuntimeError(f'Clip {index} does not fit window')
            target = clips / f'{index:02d}.wav'
            write_audio(target, data)
            result = {'index': index, 'start': start, 'window_end': end, 'text': text,
                      'voice': VOICE, 'rate_percent': rate, 'duration': seconds,
                      'actual_end': start + seconds, 'path': str(target.relative_to(ROOT))}
            results.append(result)

    await asyncio.gather(*[one(i + 1, *row) for i, row in enumerate(SCRIPT)])
    results.sort(key=lambda row: row['index'])
    (AUDIO / 'narration-script.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    if probe_only:
        return
    voice = np.zeros(N, dtype=np.float64)
    for row in results:
        data = read_audio(ROOT / row['path'])
        pos = int(row['start'] * SR)
        voice[pos:pos + len(data)] += data
    write_audio(AUDIO / 'narration-raw.wav', voice)
    normalize(AUDIO / 'narration-raw.wav', AUDIO / 'narration.wav', -18.0, -2.5)


async def captions():
    import edge_tts
    rows = json.loads((AUDIO / 'narration-script.json').read_text(encoding='utf-8'))
    requested = json.loads((ROOT / 'timeline.json').read_text(encoding='utf-8'))['captions']
    folder = AUDIO / 'boundaries'
    folder.mkdir(exist_ok=True)
    sem = asyncio.Semaphore(3)

    async def boundaries(row):
        async with sem:
            index = row['index']
            source = folder / f'{index:02d}.mp3'
            metadata = folder / f'{index:02d}.jsonl'
            if not source.exists() or not metadata.exists():
                await edge_tts.Communicate(row['text'], VOICE, rate=f'{row["rate_percent"]:+d}%',
                                          boundary='WordBoundary').save(str(source), str(metadata))

    await asyncio.gather(*[boundaries(row) for row in rows])
    result, evidence = [], []

    def plain(text):
        return ''.join(ch.lower() for ch in text if ch.isalnum())

    for row in rows:
        index = row['index']
        old = read_audio(AUDIO / 'clips' / f'{index:02d}-source.mp3')
        new = read_audio(folder / f'{index:02d}.mp3')
        old_active = np.flatnonzero(np.abs(old) > .0012)
        new_active = np.flatnonzero(np.abs(new) > .0012)
        old_trim = max(0, int(old_active[0] - SR * .10)) / SR
        old_a, old_b = old_active[0] / SR, old_active[-1] / SR
        new_a, new_b = new_active[0] / SR, new_active[-1] / SR
        scale = (old_b - old_a) / (new_b - new_a)

        def actual_time(t):
            return row['start'] + old_a + (t - new_a) * scale - old_trim

        metadata = [json.loads(line) for line in (folder / f'{index:02d}.jsonl').read_text(encoding='utf-8').splitlines()]
        chars = []
        for word in metadata:
            text = plain(word['text'])
            for i, char in enumerate(text):
                start = (word['offset'] + word['duration'] * i / len(text)) / 1e7
                end = (word['offset'] + word['duration'] * (i + 1) / len(text)) / 1e7
                chars.append((char, actual_time(start), actual_time(end)))
        spoken = ''.join(char[0] for char in chars)
        assert spoken == plain(row['text']), (index, spoken, row['text'])
        selected = [cap for cap in requested if row['start'] - .01 <= cap[0] < row['window_end']]
        cursor = 0
        for old_start, old_end, text in selected:
            normalized = plain(text)
            assert spoken[cursor:cursor + len(normalized)] == normalized, (index, text, spoken[cursor:])
            first, last = chars[cursor], chars[cursor + len(normalized) - 1]
            start = max(row['start'], first[1] - .08)
            end = min(row['window_end'], last[2] + .16)
            result.append([round(start, 3), round(end, 3), text])
            cursor += len(normalized)
        assert cursor == len(spoken), (index, cursor, len(spoken))
        same_samples = len(old) == len(new) and np.array_equal(old, new)
        evidence.append({'index': index, 'original_source_duration': len(old) / SR,
                         'boundary_source_duration': len(new) / SR,
                         'source_samples_identical': bool(same_samples),
                         'source_correlation': float(np.corrcoef(old, new)[0, 1]) if len(old) == len(new) else None,
                         'source_max_absolute_difference': float(np.max(np.abs(old - new))) if len(old) == len(new) else None,
                         'time_scale': scale, 'original_trim_start_seconds': old_trim,
                         'boundary_records': len(metadata)})
    for left, right in zip(result, result[1:]):
        left[1] = min(left[1], right[0])
    (AUDIO / 'captions.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')

    def stamp(value):
        milliseconds = round(value * 1000)
        hours, remainder = divmod(milliseconds, 3600000)
        minutes, remainder = divmod(remainder, 60000)
        seconds, milliseconds = divmod(remainder, 1000)
        return f'{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}'

    srt = '\n\n'.join(f'{i}\n{stamp(start)} --> {stamp(end)}\n{text}'
                        for i, (start, end, text) in enumerate(result, 1)) + '\n'
    for name in ['subtitles.zh-CN.srt', '旁白字幕.srt']:
        (AUDIO / name).write_text(srt, encoding='utf-8-sig')
    (AUDIO / 'caption-alignment-report.json').write_text(json.dumps({
        'method': 'Microsoft Edge WordBoundary timings at final narration rates; map regenerated source speech interval onto original source; subtract original silence trim; caption lead 80ms and tail 160ms; cap at next caption.',
        'clips': evidence, 'captions': result}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'evidence': evidence, 'captions': result}, ensure_ascii=False, indent=2), flush=True)


def midi(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def music():
    rng = np.random.default_rng(1012026)
    track = np.zeros((N, 2), dtype=np.float64)
    beat = 60 / 104
    bar = beat * 4
    chords = [([50, 57, 61, 64, 69], 38), ([47, 54, 57, 62, 66], 35),
              ([43, 50, 54, 57, 62], 31), ([45, 52, 57, 59, 64], 33)]

    def add(signal, when, gain=1.0, pan=0.0):
        pos = int(round(when * SR))
        if pos >= N or pos < 0:
            return
        size = min(len(signal), N - pos)
        if signal.ndim == 1:
            stereo = np.stack([signal * math.sqrt((1 - pan) / 2), signal * math.sqrt((1 + pan) / 2)], axis=1)
        else:
            stereo = signal
        track[pos:pos + size] += stereo[:size] * gain

    def pluck(note, length=1.0):
        t = np.arange(int(length * SR)) / SR
        f = midi(note)
        env = (1 - np.exp(-t * 280)) * np.exp(-t * 4.7)
        return (np.sin(2 * np.pi * f * t) + .25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 5)
                + .1 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 8)) * env

    def pad(notes, length):
        t = np.arange(int(length * SR)) / SR
        env = np.minimum(t / .8, 1) * np.minimum((length - t) / 1.4, 1)
        result = np.zeros((len(t), 2))
        for j, note in enumerate(notes):
            f = midi(note)
            for channel, cents in enumerate([-.0017, .0017]):
                phase = 2 * np.pi * f * (1 + cents) * t + j * .43
                result[:, channel] += (np.sin(phase) + .16 * np.sin(phase * 2) + .04 * np.sin(phase * 3)) * env / len(notes)
        return result

    for b in range(int(math.ceil(54 / bar))):
        when = b * bar
        notes, root = chords[(b // 2) % 4]
        add(pad(notes, bar + 1.4), when, .16)
        for step in range(8):
            hit = when + step * beat / 2
            note = notes[[1, 3, 4, 2, 1, 4, 3, 2][step]] + 12
            pan = -.40 if step % 2 == 0 else .40
            density = .62 if hit < 5 or 36 < hit < 44 else 1.0
            if hit < 3 and step % 2:
                continue
            arp = pluck(note, 1.2)
            add(arp, hit, .048 * density, pan)
            add(arp, hit + beat * .75, .013 * density, -pan)
            add(arp, hit + beat * 1.5, .006 * density, pan)
        if when > 4:
            for k in range(4):
                hit = when + k * beat
                if hit > 53.7:
                    continue
                t = np.arange(int(beat * .82 * SR)) / SR
                env = (1 - np.exp(-t * 70)) * np.exp(-t * 3.8)
                bass = (np.sin(2 * np.pi * midi(root) * t) + .08 * np.sin(4 * np.pi * midi(root) * t)) * env
                add(bass, hit, .086)
                if not (36 < hit < 44 and k % 2):
                    t = np.arange(int(.23 * SR)) / SR
                    phase = 2 * np.pi * (43 * t + (85 - 43) * .027 * (1 - np.exp(-t / .027)))
                    kick = np.sin(phase) * np.exp(-t * 23) * np.minimum(t * 800, 1)
                    add(kick, hit, .105)
                if k % 2 and hit > 11:
                    t = np.arange(int(.11 * SR)) / SR
                    noise = rng.standard_normal(len(t))
                    high = noise - np.concatenate(([0], noise[:-1]))
                    snare = (high * .26 + np.sin(2 * np.pi * 180 * t) * .2) * np.exp(-t * 38)
                    add(snare, hit, .03, .08)
                if hit > 19 and not 36 < hit < 44:
                    for sub in [0, .5]:
                        t = np.arange(int(.045 * SR)) / SR
                        noise = rng.standard_normal(len(t))
                        tick = (noise - np.concatenate(([0], noise[:-1]))) * np.exp(-t * 100)
                        add(tick, hit + sub * beat, .007, -.28 if sub == 0 else .28)
        if 44 < when < 53:
            for step, note in enumerate([81, 78, 76, 73]):
                add(pluck(note, 1.4), when + step * beat, .025, (-1) ** step * .28)

    add(pad([50, 57, 61, 64, 69, 74], 6.2), 53.5, .22)
    for i, note in enumerate([74, 78, 81, 86]):
        p = pluck(note, 3.2)
        add(p, 53.55 + .11 * i, .055, -.3 + .2 * i)
        add(p, 54.0 + .11 * i, .014, .3 - .2 * i)
    times = np.arange(N) / SR
    master = np.minimum(times / 1.6, 1) * np.minimum((DURATION - times) / 1.1, 1)
    master *= .87 + .13 * np.sin(2 * np.pi * times / (bar * 8)) ** 2
    track *= master[:, None]
    track /= max(1, np.max(np.abs(track)) / .85)
    write_audio(AUDIO / 'music-raw.wav', track)
    normalize(AUDIO / 'music-raw.wav', AUDIO / 'music.wav', -25.5, -5.0)


def loudness(path):
    result = run(['-i', str(path), '-af', 'loudnorm=I=-16:TP=-1:LRA=9:print_format=json', '-f', 'null', '-'])
    raw = result.stderr.decode('utf-8', errors='replace')
    found = re.findall(r'\{\s*"input_i".*?\}', raw, re.S)
    return json.loads(found[-1])


def normalize(source, target, integrated, peak):
    result = run(['-i', str(source), '-af', f'loudnorm=I={integrated}:TP={peak}:LRA=9:print_format=json', '-f', 'null', '-'])
    raw = result.stderr.decode('utf-8', errors='replace')
    measured = json.loads(re.findall(r'\{\s*"input_i".*?\}', raw, re.S)[-1])
    filt = (f'loudnorm=I={integrated}:TP={peak}:LRA=9:measured_I={measured["input_i"]}'
            f':measured_TP={measured["input_tp"]}:measured_LRA={measured["input_lra"]}'
            f':measured_thresh={measured["input_thresh"]}:offset={measured["target_offset"]}:linear=true,'
            f'apad,atrim=duration={DURATION}')
    run(['-i', str(source), '-af', filt, '-ar', str(SR), '-ac', '2', '-c:a', 'pcm_s16le', str(target)])


def mix():
    with wave.open(str(AUDIO / 'narration.wav'), 'rb') as w:
        voice = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').reshape(-1, 2).astype(np.float64) / 32768
    with wave.open(str(AUDIO / 'music.wav'), 'rb') as w:
        bed = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').reshape(-1, 2).astype(np.float64) / 32768
    duck = np.ones(N)
    rows = json.loads((AUDIO / 'narration-script.json').read_text(encoding='utf-8'))
    for row in rows:
        a, b = int(row['start'] * SR), int(row['actual_end'] * SR)
        pre, tail = int(.23 * SR), int(.36 * SR)
        duck[a:b] = .46
        before = max(0, a - pre)
        after = min(N, b + tail)
        duck[before:a] = np.minimum(duck[before:a], np.linspace(1, .46, a - before))
        duck[b:after] = np.minimum(duck[b:after], np.linspace(.46, 1, after - b))
    mix_data = voice + bed * duck[:, None]
    if np.max(np.abs(mix_data)) > .98:
        mix_data *= .98 / np.max(np.abs(mix_data))
    write_audio(AUDIO / 'mix-raw.wav', mix_data)
    normalize(AUDIO / 'mix-raw.wav', AUDIO / 'mix.wav', -16.0, -1.2)
    report = {'duration_seconds': DURATION, 'sample_rate': SR, 'channels': 2,
              'tts': {'library': 'edge-tts', 'version': '7.3.1', 'service': 'Microsoft Edge online TTS',
                      'voice': VOICE, 'note': 'Stock synthetic voice; no cloned or imitated person.'},
              'music': {'author': 'Original procedural composition for Personal Hub promotional video',
                        'method': 'NumPy additive synthesis, deterministic seed 1012026; no samples or third-party music',
                        'tempo_bpm': 104, 'key': 'D major', 'seed': 1012026},
              'tools': {'python': sys.version.split()[0], 'numpy': np.__version__, 'ffmpeg': FFMPEG},
              'clips': rows, 'files': {}}
    for name in ['narration.wav', 'music.wav', 'mix.wav']:
        path = AUDIO / name
        with wave.open(str(path), 'rb') as w:
            samples = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768
            record = {'frames': w.getnframes(), 'sample_rate': w.getframerate(), 'channels': w.getnchannels(),
                      'duration_seconds': w.getnframes() / w.getframerate(),
                      'sample_peak_dbfs': 20 * np.log10(max(1e-10, np.max(np.abs(samples))))}
        record['loudness'] = loudness(path)
        report['files'][name] = record
    (AUDIO / 'audio-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (AUDIO / 'AUDIO-SOURCES.md').write_text('''# Personal Hub 60 秒宣传视频音频

旁白使用 Microsoft Edge 在线 TTS 的标准合成声 `zh-CN-XiaoxiaoNeural`，通过开源 `edge-tts 7.3.1` 调用；不是声音克隆。Microsoft TTS 是在线语音服务，不宣称其模型开源。完整文案、分段时刻和语速见 `narration-script.json`。

配乐为本项目原创程序合成：104 BPM、D 大调，NumPy 生成温和和弦、琶音、低音与轻打击乐。未使用第三方音乐、采样包或受版权约束的旋律素材。旁白出现时，配乐自动降低音量。

工具：Python 3.12、NumPy、edge-tts（LGPL-3.0）、FFmpeg（本机发行版）。这些工具的许可证不改变本项目原创配乐的归属；在线 TTS 使用受服务提供方条款约束。

交付：`narration.wav`、`music.wav`、`mix.wav` 均为 60.000 秒、48 kHz、双声道、16-bit PCM。混音目标约 −16 LUFS，真峰值限制为 −1.2 dBTP。实测见 `audio-report.json`。

复现：先将 `edge-tts==7.3.1` 安装到本目录 `.deps`，执行 `python ../scripts/audio-source.py`。可用环境变量 `FFMPEG` 指定 FFmpeg 可执行文件。`--music-only` 只生成配乐，`--mix-only` 复用已有旁白和配乐重新混音，`--probe` 检查默认语速的分段时长。
''', encoding='utf-8')
    print(json.dumps(report['files'], ensure_ascii=False, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--probe', action='store_true')
    parser.add_argument('--music-only', action='store_true')
    parser.add_argument('--mix-only', action='store_true')
    parser.add_argument('--captions-only', action='store_true')
    args = parser.parse_args()
    AUDIO.mkdir(parents=True, exist_ok=True)
    if args.captions_only:
        asyncio.run(captions())
    elif args.probe:
        asyncio.run(speech(True))
    elif args.music_only:
        music()
    elif args.mix_only:
        mix()
    else:
        asyncio.run(speech())
        music()
        mix()


if __name__ == '__main__':
    main()
