"""Cut Hubie's rig layers out of the Flow images. Coordinates are in 1376x768 'design' space (x2 for the 2752x1536 files)."""
import json, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT='/Users/shankar/IdeaProjects/Hubie'; P=ROOT+'/assets/flow-parts/'; OUT=ROOT+'/assets/rig/'
os.makedirs(OUT,exist_ok=True)
F=2  # design -> pixel factor
W,H=2752,1536

def load(name):
    p=P+name+'.jpg'
    return Image.open(p).convert('RGB') if os.path.exists(p) else None

def key(im):
    a=np.asarray(im).astype(np.float32)
    r,g,b=a[...,0],a[...,1],a[...,2]
    d=g-np.maximum(r,b)
    alpha=1-np.clip((d-25)/130,0,1)
    # despill
    g2=np.where(d>0,np.minimum(g,np.maximum(r,b)+4),g)
    rgb=np.stack([r,g2,b],-1)
    out=np.dstack([rgb,alpha*255]).clip(0,255).astype(np.uint8)
    return Image.fromarray(out,'RGBA')

def poly_mask(pts,feather=0):
    m=Image.new('L',(W,H),0)
    ImageDraw.Draw(m).polygon([(x*F,y*F) for x,y in pts],fill=255)
    if feather: m=m.filter(ImageFilter.GaussianBlur(feather))
    return m

def mul(img,mask):
    a=np.asarray(img).copy().astype(np.float32)
    a[...,3]=a[...,3]*(np.asarray(mask).astype(np.float32)/255)
    return Image.fromarray(a.clip(0,255).astype(np.uint8),'RGBA')

def crop_trim(img,name,manifest,extra=None,pad=2):
    bb=img.getchannel('A').point(lambda v:255 if v>8 else 0).getbbox()
    if not bb: return
    x0,y0,x1,y1=max(bb[0]-pad,0),max(bb[1]-pad,0),min(bb[2]+pad,W),min(bb[3]+pad,H)
    img.crop((x0,y0,x1,y1)).save(OUT+name+'.png')
    e={'file':name+'.png','x':x0/F,'y':y0/F,'w':(x1-x0)/F,'h':(y1-y0)/F}
    if extra: e.update(extra)
    manifest[name]=e

def mirror_pts(pts,cx=688): return [(2*cx-x,y) for x,y in pts]

base=load('base'); nohat=load('nohat')
kb=key(base); kn=key(nohat) if nohat else None
A=np.asarray(kb).astype(np.float32); alpha=A[...,3]
rgb=A[...,:3]
navy=(rgb[...,0]<95)&(rgb[...,1]<105)&(rgb[...,2]<125)
orange=(rgb[...,0]>190)&(rgb[...,1]>90)&(rgb[...,1]<180)&(rgb[...,2]<90)
manifest={'size':[W/F,H/F],'layers':{}}
L=manifest['layers']

# ---- hat ---------------------------------------------------------------
hatbox=poly_mask([(555,10),(840,10),(840,150),(555,150)])
hatm=((navy|orange)&(np.asarray(hatbox)>0))
hatm_img=Image.fromarray((hatm*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
hat=mul(kb,hatm_img)
crop_trim(hat,'hat',L,{'pivot':[690,135]})

# ---- head (hat removed, face as in base) ------------------------------------
headpoly=[(500,40),(880,40),(880,285),(835,285),(820,305),(795,322),(765,334),(730,343),(690,347),(650,343),(615,334),(585,322),(560,305),(545,285),(500,285)]
hm=np.asarray(poly_mask(headpoly,0))>0
lowpoly=[(545,285),(835,285),(822,305),(795,330),(765,350),(730,362),(690,366),(650,362),(615,350),(585,330),(558,305)]
lowm=np.asarray(poly_mask(lowpoly,0))>0
_r,_g,_b=rgb[...,0],rgb[...,1],rgb[...,2]
fur_col=(_r>85)&(_r<205)&(_g>50)&(_g<155)&(_b>25)&(_b<125)&((_r-_b)>38)&(_r<215)
hm=hm|(lowm&fur_col&~navy)
headrgb=kb.copy()
if kn is not None:
    # replace the dilated hat pixels with the hat-less image
    rep=np.asarray(hatm_img)>0
    ha=np.asarray(headrgb).copy(); na=np.asarray(kn)
    ha[rep]=na[rep]
    headrgb=Image.fromarray(ha,'RGBA')
nav_zone=navy&(np.mgrid[0:H,0:W][0]>280*F)
hmask=Image.fromarray(((hm&~nav_zone)*255).astype(np.uint8))
head=mul(headrgb,hmask)
crop_trim(head,'head',L,{'pivot':[690,320]})

# ---- face patches ---------------------------------------------------------
def rr_mask(box,feather=5,radius=14):
    x0,y0,x1,y1=box
    m=Image.new('L',(W,H),0)
    ImageDraw.Draw(m).rounded_rectangle([x0*F,y0*F,x1*F,y1*F],radius=radius*F,fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather*F/2))
MOUTH=(598,236,782,304)
EYEL=(572,182,672,244)
EYER=(704,182,814,244)
faces={'mouth_eh':'mouth_eh','mouth_ah':'mouth_ah','mouth_oh':'mouth_oh','mouth_frown':'mouth_frown','mouth_grin':'mouth_grin','mouth_laugh':'face_laugh_eyesshut'}
for name,src in faces.items():
    im=load(src)
    if im is None: continue
    crop_trim(mul(key(im),rr_mask(MOUTH)),name,L,{'slot':'mouth'})
eyes={'eyes_laugh':'face_laugh_eyesshut','eyes_wide':'eyes_wide','eyes_left':'eyes_left','eyes_right':'eyes_right','eyes_sleepy':'eyes_sleepy'}
for name,src in eyes.items():
    im=load(src)
    if im is None: continue
    k=key(im)
    crop_trim(mul(k,rr_mask(EYEL)),name+'_L',L,{'slot':'eyeL'})
    crop_trim(mul(k,rr_mask(EYER)),name+'_R',L,{'slot':'eyeR'})
# base eyes/mouth patches (so we can return to neutral cleanly)
crop_trim(mul(kb,rr_mask(MOUTH)),'mouth_closed',L,{'slot':'mouth'})
crop_trim(mul(kb,rr_mask(EYEL)),'eyes_open_L',L,{'slot':'eyeL'})
crop_trim(mul(kb,rr_mask(EYER)),'eyes_open_R',L,{'slot':'eyeR'})

# ---- arms ------------------------------------------------------------------
SEAM_L=[(554,320),(548,380),(535,430),(515,465),(503,485),(497,510),(483,543),(492,548)]
OUT_L=[(560,280),(500,290),(430,340),(360,430),(320,520),(320,690),(492,690)]
arm_poly_L=OUT_L+SEAM_L[::-1][:0]  # built explicitly below
def arm_polygon(inset):
    seam=[(x+inset,y) for x,y in SEAM_L]
    # order: top shoulder -> outer edge down -> bottom -> back up the seam
    return [(560,280),(500,290),(430,340),(360,430),(320,520),(320,690),(492+inset,690)]+seam[::-1]+[(554+inset,320)]
SHOULDER={'L':(545,335)}
ELBOW_L=(497,421); WRIST_L=(430,540)
d=np.array([WRIST_L[0]-SHOULDER['L'][0],WRIST_L[1]-SHOULDER['L'][1]],float); d/=np.linalg.norm(d)
yy,xx=np.mgrid[0:H,0:W]
def side_split(E,dvec,over=0):
    return ((xx/F-E[0])*dvec[0]+(yy/F-E[1])*dvec[1])
sp=side_split(ELBOW_L,d)
cuff=(yy/F)>(515+(xx/F-355)*(33/127))   # below cuff edge => hand
hands_src={'relaxed':'base','point':'hand_point','fist':'hand_fist','palm':'hand_palm'}
def build_arm(side):
    mir=(side=='R')
    for hs,src in hands_src.items():
        im=load(src)
        if im is None: continue
        k=key(im)
        poly=arm_polygon(8); nom=arm_polygon(0)
        if mir: poly=mirror_pts(poly); nom=mirror_pts(nom)
        pm=np.asarray(poly_mask(poly))>0
        cu=cuff if not mir else (yy/F)>(515+((2*688-xx/F)-355)*(33/127))
        sps=sp if not mir else side_split((2*688-ELBOW_L[0],ELBOW_L[1]),np.array([-d[0],d[1]]))
        if hs=='relaxed':
            upper=pm&(sps<2)
            fore=pm&(sps>=-10)&~cu
            for nm,m in (('arm%s_upper'%side,upper),('arm%s_fore'%side,fore)):
                crop_trim(mul(k,Image.fromarray((m*255).astype(np.uint8))),nm,L)
        hand=pm&cu
        crop_trim(mul(k,Image.fromarray((hand*255).astype(np.uint8))),'hand%s_%s'%(side,hs),L)
for s in 'LR': build_arm(s)
L['arm_geom']={'shoulderL':list(SHOULDER['L']),'elbowL':list(ELBOW_L),'wristL':list(WRIST_L),
               'shoulderR':[2*688-SHOULDER['L'][0],SHOULDER['L'][1]],'elbowR':[2*688-ELBOW_L[0],ELBOW_L[1]],'wristR':[2*688-WRIST_L[0],WRIST_L[1]]}

# ---- torso (everything else, with neck plug and shoulder caps) -------------
removal=np.zeros((H,W),bool)
for mir in (False,True):
    pts=arm_polygon(0); pts=mirror_pts(pts) if mir else pts
    removal|=np.asarray(poly_mask(pts))>0
removal|=(hm&~nav_zone)   # only remove what the head layer actually keeps
removal|=(np.asarray(hatbox)>0)
tmask=Image.fromarray(((~removal)*255).astype(np.uint8))
torso=mul(kb,tmask)
# neck plug (fur colour) + shoulder caps (jacket colour)
t=ImageDraw.Draw(torso)
fur=tuple(int(v) for v in np.median(np.asarray(base)[int(330*F):int(338*F),int(640*F):int(740*F)].reshape(-1,3),axis=0))
jac=tuple(int(v) for v in np.median(np.asarray(base)[int(500*F):int(560*F),int(600*F):int(780*F)].reshape(-1,3),axis=0))
cx,cy=690,312
plug=[(cx+(x-cx)*0.94,cy+(y-cy)*0.94) for x,y in lowpoly]      # just inside the head's lower outline, so it is always hidden behind the head at rest
t.polygon([(x*F,y*F) for x,y in plug],fill=fur+(255,))
silh=Image.fromarray((alpha>128).astype(np.uint8)*255)
cap=Image.new('L',(W,H),0); cd=ImageDraw.Draw(cap)
for cx,cy in ((548,345),(2*688-548,345)):
    cd.ellipse([(cx-30)*F,(cy-30)*F,(cx+30)*F,(cy+30)*F],fill=255)
cap=Image.fromarray(((np.asarray(cap)>0)&(np.asarray(silh)>0)).astype(np.uint8)*255)
torso.alpha_composite(Image.composite(Image.new('RGBA',(W,H),jac+(255,)),Image.new('RGBA',(W,H),(0,0,0,0)),cap))
crop_trim(torso,'torso',L)
bowbox=poly_mask([(626,338),(672,344),(690,349),(745,341),(759,344),(757,402),(736,407),(716,386),(690,393),(665,386),(642,405),(627,397)])
bowm=(np.asarray(bowbox)>0)&navy
bowm_img=Image.fromarray((bowm*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(3))
bowm_img=Image.fromarray(((np.asarray(bowm_img)>0)&(np.asarray(bowbox)>0)).astype(np.uint8)*255)
crop_trim(mul(kb,bowm_img),'bowtie',L)
manifest['pivots']={'neck':[690,325],'hat':[690,138]}
manifest['slots']={'mouth':list(MOUTH),'eyeL':list(EYEL),'eyeR':list(EYER)}
json.dump(manifest,open(OUT+'manifest.json','w'),indent=1)
print(len(L),'layers written;', sorted(k for k in L if k!='arm_geom'))
