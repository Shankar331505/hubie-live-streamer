import sys
from PIL import Image, ImageDraw
def grid(src,box,out,step=20,scale=2):
    # box in 1376-space; src is 2752 wide -> factor 2
    im=Image.open(src).convert('RGB'); f=im.size[0]/1376
    x0,y0,x1,y1=box
    c=im.crop((int(x0*f),int(y0*f),int(x1*f),int(y1*f)))
    c=c.resize(((x1-x0)*scale,(y1-y0)*scale))
    d=ImageDraw.Draw(c)
    for x in range((x0//step+1)*step,x1,step):
        X=(x-x0)*scale; d.line([(X,0),(X,c.size[1])],fill=(255,0,0) if x%100==0 else (255,255,255),width=1); d.text((X+2,2),str(x),fill=(255,255,0))
    for y in range((y0//step+1)*step,y1,step):
        Y=(y-y0)*scale; d.line([(0,Y),(c.size[0],Y)],fill=(255,0,0) if y%100==0 else (255,255,255),width=1); d.text((2,Y+2),str(y),fill=(255,255,0))
    c.save(out)
if __name__=='__main__':
    a=sys.argv; grid(a[1],tuple(map(int,a[2].split(','))),a[3],int(a[4]) if len(a)>4 else 20,int(a[5]) if len(a)>5 else 2)
