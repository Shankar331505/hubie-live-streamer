"""Generate Hubie's lines with ElevenLabs, WITH per-character timestamps (for exact lip-sync).
Usage: .venv/bin/python tools/gen_eleven.py [lines.json] [outdir]
Reads ELEVENLABS_API_KEY (and optional ELEVENLABS_VOICE_ID / ELEVENLABS_MODEL) from ./.env. Never prints the key."""
import json, os, sys, base64, ssl, urllib.request, urllib.error
try:
    import certifi; CTX=ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX=None
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def env():
    d={}
    p=os.path.join(ROOT,'.env')
    if os.path.exists(p):
        for line in open(p):
            line=line.strip()
            if line and not line.startswith('#') and '=' in line:
                k,v=line.split('=',1); d[k.strip()]=v.strip().strip('"').strip("'")
    d.update({k:v for k,v in os.environ.items() if k.startswith('ELEVENLABS')})
    return d
E=env()
KEY=E.get('ELEVENLABS_API_KEY')
if not KEY: sys.exit('ELEVENLABS_API_KEY missing: put it in .env (see .env.example)')
VOICE=E.get('ELEVENLABS_VOICE_ID','wiF43F1vngB3iRFsbWhJ')      # "Nathaniel": crisp RP male, dry wit
MODEL=E.get('ELEVENLABS_MODEL','eleven_v4')   # final choice: eleven_v4, default voice settings (what the user approved)
lines=json.load(open(sys.argv[1] if len(sys.argv)>1 else os.path.join(ROOT,'rig/demo/lines.json')))
out=sys.argv[2] if len(sys.argv)>2 else os.path.join(ROOT,'rig/demo_el')
os.makedirs(out,exist_ok=True)
for l in lines:
    payload={'text':l['text'],'model_id':MODEL}
    if E.get('ELEVENLABS_STABILITY'): payload['voice_settings']={'stability':float(E['ELEVENLABS_STABILITY']),'similarity_boost':0.8}   # optional override; default = ElevenLabs defaults
    body=json.dumps(payload).encode()
    req=urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128',data=body,
        headers={'xi-api-key':KEY,'Content-Type':'application/json'})
    try: r=json.load(urllib.request.urlopen(req,timeout=120,context=CTX))
    except urllib.error.HTTPError as e: sys.exit(f"{l['id']}: HTTP {e.code} {e.read()[:200]!r}")
    open(f"{out}/{l['id']}.mp3",'wb').write(base64.b64decode(r['audio_base64']))
    a=r.get('alignment') or r.get('normalized_alignment')
    json.dump({'chars':a['characters'],'starts':a['character_start_times_seconds'],'ends':a['character_end_times_seconds']},open(f"{out}/{l['id']}.json",'w'))
    print('ok',l['id'],len(l['text']),'chars')
