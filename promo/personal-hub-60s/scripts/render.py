import argparse
import functools
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import time
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'timeline.json').read_text(encoding='utf-8'))
W, H = CONFIG['width'], CONFIG['height']
FPS = CONFIG['fps']
ASSETS = ROOT / 'assets'
P = {'body': '#f7f6f2', 'surface': '#fffefa', 'surface2': '#f3f1eb', 'line': '#e4e0d7', 't1': '#252825', 't2': '#3e4640', 't3': '#626c62', 'primary': '#427d72', 'dark': '#0b0f14', 'darkline': '#242e3a', 'light': '#f1f5f9', 'mint': '#8cc8b5'}
FONTS = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'

def ease(x):
    x = max(0, min(1, x))
    return 1 - (1-x)**3

def smooth(x):
    x = max(0, min(1, x))
    return x*x*(3-2*x)

def lerp(a, b, x):
    return a + (b-a)*x

@functools.lru_cache(maxsize=100)
def font(size, bold=False, english=False):
    name = ('segoeuib.ttf' if bold else 'segoeui.ttf') if english else ('msyhbd.ttc' if bold else 'msyh.ttc')
    return ImageFont.truetype(str(FONTS / name), int(size))

@functools.lru_cache(maxsize=500)
def glyph(text, size, color, bold=False, english=False):
    f = font(size, bold, english)
    bbox = f.getbbox(text)
    out = Image.new('RGBA', (int(f.getlength(text))+8, bbox[3]-bbox[1]+12))
    ImageDraw.Draw(out).text((4, 4-bbox[1]), text, font=f, fill=color)
    return out

def label(im, text, x, y, size=30, color=None, bold=False, english=False, opacity=1, anchor='left'):
    layer = glyph(text, size, color or P['t1'], bold, english)
    if anchor == 'center': x -= layer.width/2
    if anchor == 'right': x -= layer.width
    if opacity < 1:
        layer = layer.copy()
        layer.putalpha(layer.getchannel('A').point(lambda a: int(a*max(0, opacity))))
    im.alpha_composite(layer, (round(x), round(y)))

def animate_text(im, text, x, y, local, delay, size=76, color=None, bold=True, english=False):
    p = ease((local-delay)/0.8)
    label(im, text, x, y+36*(1-p), size, color, bold, english, p)

def pill(im, text, x, y, dark=False, size=23, active=False):
    f = font(size)
    width = int(f.getlength(text))+44
    fill = P['primary'] if active else (P['darkline'] if dark else P['surface2'])
    color = P['surface'] if active else (P['mint'] if dark else P['primary'])
    ImageDraw.Draw(im).rounded_rectangle((x,y,x+width,y+52), radius=8, fill=fill)
    label(im,text,x+19,y+11,size,color)
    return width

@functools.lru_cache(maxsize=30)
def picture(name):
    return Image.open(ASSETS / name).convert('RGBA')

@functools.lru_cache(maxsize=140)
def framed(name, width, phone=False):
    src = picture(name)
    width = round(width)
    if phone:
        border=9
        h = round((width-2*border)*src.height/src.width)
        out=Image.new('RGBA',(width,h+2*border))
        d=ImageDraw.Draw(out)
        d.rounded_rectangle((0,0,width-1,h+17),radius=34,fill=P['dark'],outline=P['darkline'],width=2)
        tile=src.resize((width-2*border,h),Image.Resampling.LANCZOS)
        mask=Image.new('L',tile.size); ImageDraw.Draw(mask).rounded_rectangle((0,0,tile.width,tile.height),radius=26,fill=255)
        out.paste(tile,(border,border),mask)
        return out
    h = round(src.height*width/src.width)
    out=Image.new('RGBA',(width+4,h+44))
    d=ImageDraw.Draw(out)
    d.rounded_rectangle((0,0,width+3,h+43),radius=12,fill=P['surface'],outline=P['line'],width=2)
    for i in range(3): d.ellipse((18+i*16,17,24+i*16,23),fill=P['line'])
    label(out,'PERSONAL HUB',80,11,14,P['t3'],True,True)
    label(out,'演示工作台',width-20,10,14,P['t3'],anchor='right')
    tile=src.resize((width,h),Image.Resampling.LANCZOS)
    out.alpha_composite(tile,(2,42))
    return out

def screen(im,name,x,y,width,local=2,delay=0,phone=False,drift=0):
    p=ease((local-delay)/0.9)
    panel=framed(name,round(width),phone)
    if p<1:
        panel=panel.copy(); panel.putalpha(panel.getchannel('A').point(lambda a:int(a*p)))
    im.alpha_composite(panel,(round(x),round(y+55*(1-p)+drift)))

def base(dark=False):
    return Image.new('RGBA',(W,H),P['dark'] if dark else P['body'])

def top(im,chapter,dark=False):
    col=P['light'] if dark else P['t1']
    line=P['darkline'] if dark else P['line']
    icon=picture('brand-icon.png').resize((36,36),Image.Resampling.LANCZOS)
    im.alpha_composite(icon,(92,56))
    label(im,'Personal Hub',140,58,25,col,True,True)
    label(im,chapter,W-94,60,22,P['mint'] if dark else P['primary'],anchor='right')
    ImageDraw.Draw(im).line((96,119,W-96,119),fill=line,width=1)

def footer(im,t,dark=False):
    line=P['darkline'] if dark else P['line']
    col=P['mint'] if dark else P['primary']
    d=ImageDraw.Draw(im)
    d.line((96,1044,W-96,1044),fill=line,width=2)
    d.line((96,1044,96+(W-192)*t/60,1044),fill=col,width=3)

def opening(local):
    im=base()
    top(im,'让日常，少一点来回')
    label(im,'把散落的信息，慢慢归拢。',960,215,34,P['t3'],anchor='center')
    cards=[('想法','闪过的灵感',140),('任务','今天的下一步',735),('资料','需要时找得到',1330)]
    d=ImageDraw.Draw(im)
    p=ease((local-0.15)/1.05)
    for i,(title,sub,x) in enumerate(cards):
        y=340+24*math.sin(local*0.7+i)*min(1,local/2)+80*(1-ease((local-i*0.18)/0.8))
        d.rounded_rectangle((x,y,x+450,y+250),radius=12,fill=P['surface'],outline=P['line'],width=2)
        label(im,f'0{i+1}',x+30,y+26,22,P['primary'],True,True)
        label(im,title,x+31,y+77,72,P['t1'],True)
        label(im,sub,x+34,y+183,25,P['t3'])
        if i<2:
            ax=x+487
            d.line((ax,y+125,ax+60*p,y+125),fill=P['primary'],width=3)
            d.line((ax+46*p,y+116,ax+60*p,y+125,ax+46*p,y+134),fill=P['primary'],width=3)
    animate_text(im,'总在来回切换？',574,725,local,1.0,88)
    return im

def brand(local):
    im=base(); top(im,'一个个人工作台')
    animate_text(im,'Personal Hub',104,213,local,0.05,62,P['primary'],True,True)
    animate_text(im,'让记录',101,326,local,0.2,106)
    animate_text(im,'接上行动。',101,464,local,0.4,106)
    label(im,'本地优先的个人工作台',110,642,32,P['t3'])
    pill(im,'任务 · 灵感 · 资料 · 密码',110,716,size=24)
    screen(im,'today.png',760,216,1060,local,0.25,drift=-10*smooth(local/6))
    return im

def plan(local):
    im=base(); top(im,'01 / 安排今天')
    animate_text(im,'今天，',91,264,local,0.05,78)
    animate_text(im,'先做',91,368,local,0.2,78)
    animate_text(im,'重要的事。',91,472,local,0.35,78,P['primary'])
    label(im,'把下一步，放进今天。',96,638,28,P['t3'])
    pill(im,'子任务',96,715,size=23)
    pill(im,'时间安排',96,781,size=23)
    stage='today.png' if local<4.5 else 'calendar.png'
    screen(im,stage,610,175,1200,local,0.2)
    if 4.5<=local<4.85:
        prev=framed('today.png',1200).copy()
        prev.putalpha(prev.getchannel('A').point(lambda a:int(a*(1-smooth((local-4.5)/0.35)))))
        im.alpha_composite(prev,(610,175))
    return im

def capture(local):
    im=base(); top(im,'02 / 留住灵感')
    animate_text(im,'灵感出现，',94,265,local,0.1,80)
    animate_text(im,'随手收下。',94,378,local,0.3,80,P['primary'])
    label(im,'先记下来，不必立刻安排。',100,518,30,P['t3'])
    for i,text in enumerate(['随手记录','整理备忘录','转为任务']):
        p=ease((local-0.7-i*0.4)/0.7)
        y=624+i*76
        ImageDraw.Draw(im).ellipse((102,y+6,136,y+40),outline=P['primary'],width=2)
        label(im,str(i+1),113,y+10,17,P['primary'],True,True)
        label(im,text,155+16*(1-p),y+7,28,P['t2'],opacity=p)
    screen(im,'memos.png',695,220,1120,local,0.3,drift=-12*smooth(local/8))
    return im

def library(local):
    im=base(); top(im,'03 / 找到所需')
    animate_text(im,'需要的资料，',94,270,local,0.1,73)
    animate_text(im,'随手可得。',94,374,local,0.3,73,P['primary'])
    label(im,'集中归档 · 随时预览',101,511,29,P['t3'])
    for i,text in enumerate(['文档','图片','文本','音视频']):
        pill(im,text,100+(i%2)*160,616+(i//2)*70,size=24)
    label(im,'让查找，更从容。',101,818,30,P['t2'])
    stage='docs.png' if local<3.2 else 'docs-preview.png'
    screen(im,stage,665,200,1150,local,0.25,drift=-10*smooth(local/8))
    if 3.2<=local<3.42:
        prev=framed('docs.png',1150).copy()
        prev.putalpha(prev.getchannel('A').point(lambda a:int(a*(1-smooth((local-3.2)/0.22)))))
        im.alpha_composite(prev,(665,round(200-10*smooth(local/8))))
    return im

def privacy(local):
    im=base(True); top(im,'04 / 安心保管',True)
    d=ImageDraw.Draw(im)
    x,y=108,208
    d.arc((x+27,y,x+103,y+91),180,360,fill=P['mint'],width=7)
    d.rounded_rectangle((x+7,y+50,x+123,y+143),radius=12,outline=P['mint'],width=5)
    d.ellipse((x+56,y+78,x+74,y+96),fill=P['mint'])
    d.line((x+65,y+93,x+65,y+115),fill=P['mint'],width=5)
    animate_text(im,'重要信息，',96,393,local,0.1,79,P['light'])
    animate_text(im,'由你掌握。',96,506,local,0.3,79,P['mint'])
    label(im,'本地加密保存',104,654,32,P['light'])
    pill(im,'账号密码',105,727,True,size=24)
    pill(im,'个人资料',278,727,True,size=24)
    label(im,'信息有序，心里有底。',105,840,28,P['mint'])
    screen(im,'vault.png',732,222,1080,local,0.2,drift=-10*smooth(local/8))
    return im

def personalize(local):
    im=base(); top(im,'05 / 你的节奏')
    if local<4.3:
        animate_text(im,'熟悉的工作台，随身继续。',100,162,local,0.1,70)
        pill(im,'Windows',108,266,size=22)
        pill(im,'Android',292,266,size=22)
        pill(im,'Web',467,266,size=22)
        screen(im,'today.png',108,340,950,local,0.15)
        screen(im,'mobile.png',1410,187,335,local,0.4,True)
        label(im,'桌面工作区',108,994,22,P['primary'])
    else:
        u=local-4.3
        animate_text(im,'喜欢的样子，由你定义。',100,167,u,0,72)
        label(im,'换一种外观，找到自己的工作氛围。',108,281,31,P['t3'])
        for i,(name,word) in enumerate([('today.png','清爽日常'),('style-dark.png','深色专注'),('style-editorial.png','编辑美学')]):
            x=100+i*590
            screen(im,name,x,412,540,u,0.12*i)
            label(im,word,x+270,825,29,P['primary'],anchor='center')
    return im

def closing(local):
    im=base(); d=ImageDraw.Draw(im)
    d.line((96,119,W-96,119),fill=P['line'],width=1)
    icon=picture('brand-icon.png').resize((148,148),Image.Resampling.LANCZOS)
    im.alpha_composite(icon,(886,166))
    label(im,'Personal Hub',960,353,88,P['t1'],True,True,anchor='center')
    label(im,'让记录接上行动。',960,492,74,P['primary'],True,anchor='center')
    label(im,'把生活与工作，慢慢理顺。',960,606,34,P['t3'],anchor='center')
    label(im,'Windows   ·   Android   ·   Web',960,712,27,P['t2'],False,True,anchor='center')
    d.rounded_rectangle((478,795,1442,877),radius=12,fill=P['primary'])
    label(im,CONFIG['cta'],960,816,33,P['surface'],True,True,anchor='center')
    label(im,'开源个人工作台  /  探索更多',960,910,23,P['t3'],anchor='center')
    return im

RENDERERS={'opening':opening,'brand':brand,'plan':plan,'capture':capture,'library':library,'privacy':privacy,'personalize':personalize,'closing':closing}

def frame(t, subtitles=True):
    scenes=CONFIG['scenes']
    i=max(i for i,s in enumerate(scenes) if s['start']<=t)
    s=scenes[i]; local=t-s['start']
    im=RENDERERS[s['id']](local)
    if i and local<0.4:
        prev=scenes[i-1]
        old=RENDERERS[prev['id']](prev['end']-prev['start'])
        im=Image.blend(old,im,smooth(local/0.4))
    dark=s['id']=='privacy'
    if subtitles:
        for start,end,text in CONFIG['captions']:
            if start<=t<end:
                g=glyph(text,30,P['surface'])
                x=(W-g.width)//2
                overlay=Image.new('RGBA',(W,H))
                ImageDraw.Draw(overlay).rounded_rectangle((x-26,970,x+g.width+26,1030),radius=8,fill=(11,15,20,232))
                overlay.alpha_composite(g,(x,981))
                im=Image.alpha_composite(im,overlay)
                break
    footer(im,t,dark)
    return im.convert('RGB')

def srt_time(t):
    ms=round(t*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'

def make_previews():
    target=ROOT/'preview'; target.mkdir(exist_ok=True)
    moments=[2.8,8.0,13.5,17.6,23.5,31.5,39.0,46.5,50.5,56.5]
    sheet=Image.new('RGB',(1440,405*5),P['body'])
    for i,t in enumerate(moments):
        image=frame(t)
        image.save(target/f'{t:04.1f}s.jpg',quality=92)
        tile=image.resize((720,405),Image.Resampling.LANCZOS)
        ImageDraw.Draw(tile).text((8,8),f'{t:.1f}s',font=font(18,True,True),fill=P['primary'])
        sheet.paste(tile,((i%2)*720,(i//2)*405))
    sheet.save(target/'contact-sheet.jpg',quality=94)
    frame(56.5,False).save(ROOT/'poster.jpg',quality=96)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--preview',action='store_true')
    parser.add_argument('--no-subtitles',action='store_true')
    parser.add_argument('--output',default='Personal-Hub-60s-1080p.mp4')
    args=parser.parse_args()
    srt='\n\n'.join(f'{i+1}\n{srt_time(a)} --> {srt_time(b)}\n{text}' for i,(a,b,text) in enumerate(CONFIG['captions']))+'\n'
    (ROOT/'subtitles.zh-CN.srt').write_text(srt,encoding='utf-8-sig')
    make_previews()
    if args.preview:
        print('Previews rendered',flush=True); return
    ffmpeg=shutil.which('ffmpeg') or str(Path.home()/'.codely-cli/tmp/bin/ffmpeg.exe')
    audio=ROOT/'audio/mix.wav'
    if not audio.exists(): raise FileNotFoundError(audio)
    temporary=ROOT/(Path(args.output).stem+'.rendering.mp4')
    cmd=[ffmpeg,'-y','-hide_banner','-loglevel','warning','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-i',str(audio),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-r',str(FPS),'-c:a','aac','-b:a','256k','-ar','48000','-t','60','-movflags','+faststart','-metadata','title=Personal Hub - 让记录接上行动','-metadata','comment=Actual app captures with synthetic demonstration data; original synthesized music; synthetic Mandarin narration.',str(temporary)]
    start=time.time()
    with (ROOT/'render.log').open('w',encoding='utf-8') as log:
        proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log)
        try:
            for i in range(60*FPS):
                proc.stdin.write(frame(i/FPS,not args.no_subtitles).tobytes())
                if i%(5*FPS)==0: print(f'{i//FPS:02}/60 seconds rendered; elapsed {time.time()-start:.1f}s',flush=True)
            proc.stdin.close()
            code=proc.wait()
            if code: raise RuntimeError(f'FFmpeg exited {code}; see render.log')
        except Exception:
            proc.kill(); raise
    temporary.replace(ROOT/args.output)
    print(f'Finished: {args.output}; {time.time()-start:.1f}s',flush=True)

if __name__=='__main__': main()
