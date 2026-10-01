#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Torn-paper edge masks for the page sheet (src/index.css, "Background").

Prints the six --tear-* custom properties (face / fiber / shadow x left /
right). Paste the output over the block of the same name in src/index.css.

Each mask is a 24 x 720 SVG tile: x = 0 is the sheet's outer edge and the
paper is the filled side of a wandering line. The line is built from sine
terms with whole-number periods per tile, so tiles repeat down the page
without a seam. Change SEED for a different tear; the shapes are otherwise
deterministic.

  python3 scripts/torn-edge.py
"""
import math, random, urllib.parse
W, H, STEP = 24, 720, 4
SEED = 20261001
random.seed(SEED)
def periodic(n_terms, amp_decay, base_freq):
    terms=[(base_freq*k, random.uniform(0,2*math.pi), amp_decay**i) for i,k in enumerate(range(1,n_terms+1))]
    s=sum(a for _,_,a in terms)
    return lambda y: sum(a*math.sin(2*math.pi*f*y/H+p) for f,p,a in terms)/s
coarse=periodic(6,0.62,2)      # slow wander of the tear line
mid=periodic(10,0.8,9)         # bites along the edge
ys=list(range(0,H+1,STEP))
jit=[random.uniform(-1,1) for _ in ys]; jit[-1]=jit[0]
fjit=[random.uniform(0,1)**1.5 for _ in ys]; fjit[-1]=fjit[0]
def face_x(i,y): return 12.5 + 4.6*coarse(y) + 2.8*mid(y) + 1.2*jit[i]
face=[face_x(i,y) for i,y in enumerate(ys)]
# fibre rim: sits outside the face edge by a ragged 1-4.5 units
fiber=[f - (1.0 + 4.2*fjit[i]) for i,f in enumerate(face)]
# shadow: just outside the fibres, blurred in the SVG
shadow=[min(f,fb) - 0.6 for f,fb in zip(face,fiber)]
def path(xs, dy):
    pts=' '.join(f'{x:.1f} {y+dy}' for x,y in zip(xs,ys))
    return f'M{W},{dy} L{pts} L{W},{H+dy} Z'
def svg(xs, blur=0, mirror=False):
    # draw the tile three times (above/at/below) so blur stays seamless
    d=' '.join(path(xs,dy) for dy in ((-H,0,H) if blur else (0,)))
    g=f'<g transform="translate({W} 0) scale(-1 1)">' if mirror else '<g>'
    flt=f'<filter id="b" x="-50%" y="-5%" width="200%" height="110%"><feGaussianBlur stdDeviation="{blur}"/></filter>' if blur else ''
    fa=' filter="url(#b)"' if blur else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="none">'
            f'{flt}{g}<path fill="#000" d="{d}"{fa}/></g></svg>')
def uri(s): return 'url("data:image/svg+xml,' + urllib.parse.quote(s, safe=' =:/,".-') .replace('"',"'") + '")'
out=[]
for name,xs,blur in (('face',face,0),('fiber',fiber,0),('shadow',shadow,1.6)):
    for side,mir in (('l',False),('r',True)):
        out.append(f'  --tear-{name}-{side}: {uri(svg(xs,blur,mir))};')
print("\n".join(out))
