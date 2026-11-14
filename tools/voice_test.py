"""Generate one line with several models/settings so they can be compared by ear. Reads the key from .env, never prints it."""
import json, os, sys, base64, ssl, urllib.request, urllib.error, certifi
ROOT='/Users/shankar/IdeaProjects/Hubie'
d={}
for l in open(ROOT+'/.env'):
    l=l.strip()
    if l and not l.startswith('#') and '=' in l:
        k,v=l.split('=',1); d[k.strip()]=v.strip()
KEY=d['ELEVENLABS_API_KEY']; VOICE=d.get('ELEVENLABS_VOICE_ID','wiF43F1vngB3iRFsbWhJ')
CTX=ssl.create_default_context(cafile=certifi.where())
TEXT="Well, well... welcome to the stream, everybody. I'm Hubie, and tonight it's demo mode only. No real money. Just good vibes."
tests={
 'v3_natural':{'model_id':'eleven_v3','voice_settings':{'stability':0.5,'similarity_boost':0.8}},
 'v3_creative':{'model_id':'eleven_v3','voice_settings':{'stability':0.0,'similarity_boost':0.8}},
 'v4_natural':{'model_id':'eleven_v4','voice_settings':{'stability':0.5,'similarity_boost':0.8}},
}
os.makedirs(ROOT+'/previews/voice_tests',exist_ok=True)
for name,cfg in tests.items():
    body=dict(cfg); body['text']=TEXT
    req=urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128',data=json.dumps(body).encode(),
        headers={'xi-api-key':KEY,'Content-Type':'application/json'})
    try:
        r=json.load(urllib.request.urlopen(req,timeout=120,context=CTX))
        open(f'{ROOT}/previews/voice_tests/{name}.mp3','wb').write(base64.b64decode(r['audio_base64']))
        a=r.get('alignment') or {}
        print('ok',name,'timestamps:',bool(a.get('characters')))
    except urllib.error.HTTPError as e:
        print('FAIL',name,e.code,e.read()[:160].decode('utf8','replace'))
