"""Turn rendered frames + per-line audio into an mp4.  Usage: make_preview.py <audio_dir> <ext> <out.mp4>"""
import json, subprocess, sys
ROOT='/Users/shankar/IdeaProjects/Hubie'; audio_dir,ext,out=sys.argv[1:4]
m=json.load(open('/private/tmp/hubie_frames/meta.json'))
inputs=[];filt=[]
for i,l in enumerate(m['lines']):
    inputs+=['-i',f"{audio_dir}/{l['id']}{ext}"]; d=int(l['start']*1000)
    filt.append(f"[{i+1}:a]adelay={d}|{d}[a{i}]")
filt.append(''.join(f'[a{i}]' for i in range(len(m['lines'])))+f"amix=inputs={len(m['lines'])}:normalize=0[aout]")
subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate',str(m['fps']),'-i','/private/tmp/hubie_frames/f%05d.jpg']+inputs+['-filter_complex',';'.join(filt),'-map','0:v','-map','[aout]','-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-c:a','aac','-b:a','160k','-shortest',out],check=True)
print('wrote',out)
