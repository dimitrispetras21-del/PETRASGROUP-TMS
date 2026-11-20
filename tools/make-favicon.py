"""Regenerate the tab icons from logo.png: python3 tools/make-favicon.py

Why a script: the icons are a derived copy of the emblem in logo.png (white on
the sidebar navy #0B1929, so it reads on light and dark tab strips; the full
logo is unreadable at 16-32px). If logo.png changes, run this and bump the
?v= of the icon links in app.html, index.html and print.html.
"""
import os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = Image.open(os.path.join(ROOT,'logo.png')).convert('RGBA')
# emblem bounding box: find dark pixels in left region
px = src.load(); W,H = src.size
xs=[];ys=[]
for y in range(H):
    for x in range(0, 235):
        r,g,b,a = px[x,y]
        if a>100 and r<120: xs.append(x); ys.append(y)
box=(min(xs),min(ys),max(xs)+1,max(ys)+1); print('emblem box',box)
em = src.crop(box)
# alpha mask from darkness -> white glyph
mask = Image.new('L', em.size, 0); mp=mask.load(); ep=em.load()
for y in range(em.size[1]):
    for x in range(em.size[0]):
        r,g,b,a = ep[x,y]; mp[x,y] = int(a*(255-min(r,g,b))/255)
def make(size, name, radius_ratio=0.22, pad_ratio=0.16):
    S=size*4
    base = Image.new('RGBA',(S,S),(0,0,0,0))
    d=ImageDraw.Draw(base); d.rounded_rectangle([0,0,S-1,S-1], radius=int(S*radius_ratio), fill=(11,25,41,255))
    inner=int(S*(1-2*pad_ratio)); ew,eh=em.size; sc=inner/max(ew,eh)
    m=mask.resize((max(1,int(ew*sc)),max(1,int(eh*sc))), Image.LANCZOS)
    white=Image.new('RGBA',m.size,(255,255,255,255))
    base.paste(white,((S-m.size[0])//2,(S-m.size[1])//2),m)
    base.resize((size,size),Image.LANCZOS).save(name)
make(32,os.path.join(ROOT,'favicon-32.png'))
make(180,os.path.join(ROOT,'apple-touch-icon.png'),radius_ratio=0.0,pad_ratio=0.18)
