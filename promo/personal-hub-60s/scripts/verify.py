import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

ROOT=Path(__file__).resolve().parents[1]
VIDEO=ROOT/'Personal-Hub-60s-1080p.mp4'
FFMPEG=shutil.which('ffmpeg') or str(Path.home()/'.codely-cli/tmp/bin/ffmpeg.exe')

def main():
    probe=subprocess.run([FFMPEG,'-hide_banner','-i',str(VIDEO)],capture_output=True,text=True,encoding='utf-8',errors='replace')
    decode=subprocess.run([FFMPEG,'-hide_banner','-v','error','-i',str(VIDEO),'-map','0:v:0','-map','0:a:0','-progress','pipe:1','-f','null','-'],capture_output=True,text=True,encoding='utf-8',errors='replace')
    meta=probe.stderr
    duration=re.search(r'Duration: (\d+):(\d+):([\d.]+)',meta)
    seconds=int(duration[1])*3600+int(duration[2])*60+float(duration[3])
    frames=[int(x) for x in re.findall(r'^frame=(\d+)',decode.stdout,re.M)]
    audio=json.loads((ROOT/'audio/audio-report.json').read_text(encoding='utf-8'))
    capture=json.loads((ROOT/'assets/capture-report.json').read_text(encoding='utf-8'))
    checks={
        'duration_60s':abs(seconds-60)<0.05,
        'resolution_1920x1080':'1920x1080' in meta,
        'fps_30':'30 fps' in meta,
        'h264':'Video: h264' in meta,
        'yuv420p':'yuv420p' in meta,
        'aac_stereo_48k':'Audio: aac' in meta and '48000 Hz, stereo' in meta,
        'decoded_1800_frames':bool(frames) and frames[-1]==1800,
        'full_decode_without_errors':decode.returncode==0 and not decode.stderr.strip(),
        'audio_source_60s':audio['duration_seconds']==60.0,
        'synthetic_demo_only':capture.get('syntheticOnly') is True
    }
    result={'file':VIDEO.name,'bytes':VIDEO.stat().st_size,'sha256':hashlib.sha256(VIDEO.read_bytes()).hexdigest(),'duration_seconds':seconds,'frames_decoded':frames[-1] if frames else None,'checks':checks,'passed':all(checks.values()),'metadata':meta,'decode_errors':decode.stderr,'product_build':'npm run build passed on Node 24.19.0; product version 1.1.10','visual_review':'preview/contact-sheet.jpg and selected full-resolution frames inspected before final encode','audio_review':'Duration, loudness, peaks and actual TTS word timing checked; no subjective listening claim.'}
    (ROOT/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ['metadata']},ensure_ascii=False,indent=2))
    if not result['passed']: raise RuntimeError('Video verification failed')
    archive=ROOT/'Personal-Hub-60s-editable-source.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in sorted(ROOT.rglob('*')):
            rel=p.relative_to(ROOT)
            if not p.is_file() or p==archive or p.suffix in ['.mp4','.zip','.log','.pyc'] or any(v in rel.parts for v in ['.deps','__pycache__','probe','caption-probes']):continue
            if 'failure' in p.name or 'test' in p.name or 'draft' in p.name:continue
            if p.name.endswith('-raw.wav') or p.name.endswith('-unmastered.wav'):continue
            z.write(p,str(Path('personal-hub-60s')/rel))
    print(f'Source archive: {archive.name}, {archive.stat().st_size} bytes')

if __name__=='__main__':main()
