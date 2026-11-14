import json,sys
from PIL import Image
import numpy as np
R='/Users/shankar/IdeaProjects/Hubie/assets/rig/'
m=json.load(open(R+'manifest.json')); L=m['layers']; F=2
def put(canvas,name):
    e=L[name]; im=Image.open(R+e['file']); canvas.alpha_composite(im,(int(round(e['x']*F)),int(round(e['y']*F))))
def compose(names):
    c=Image.new('RGBA',(2752,1536),(0,255,0,255))
    for n in names: put(c,n)
    return c
rest=['torso','head','mouth_closed','eyes_open_L','eyes_open_R','hat','bowtie','armL_upper','armL_fore','handL_relaxed','armR_upper','armR_fore','handR_relaxed']
c=compose(rest); c.convert('RGB').save(sys.argv[1])
base=Image.open('/Users/shankar/IdeaProjects/Hubie/assets/flow-parts/base.jpg').convert('RGB')
d=np.abs(np.asarray(c.convert('RGB')).astype(int)-np.asarray(base).astype(int)).sum(2)
print('rest-pose pixels differing >120:',(d>120).sum())
Image.fromarray(((d>120)*255).astype('uint8')).resize((1376,768)).save(sys.argv[1].replace('.png','_diff.png'))
