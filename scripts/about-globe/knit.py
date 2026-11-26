"""Project the photographed knit onto the front; continue the unseen surface in matching yarn."""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

root = Path(__file__).resolve().parents[2]
config = json.loads(Path(__file__).with_name("profile.json").read_text())
photo = np.asarray(Image.open(root / "assets/scene-lit.png").convert("RGB"), dtype=np.float32) / 255
width, height = 2048, 1024
land = Image.new("L", (width, height))
draw = ImageDraw.Draw(land)
for feature in json.loads(Path(sys.argv[1]).read_text())["features"]:
    g = feature["geometry"]
    for polygon in g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]:
        for index, ring in enumerate(polygon):
            draw.polygon([((x+180)*width/360, (90-y)*height/180) for x,y in ring], fill=255 if index==0 else 0)
land = np.asarray(land)
y, x = np.mgrid[:height,:width]
lat = (.5-(y+.5)/height)*np.pi
angle = (x+.5)*2*np.pi/width - np.pi - np.radians(config["centralMeridian"])
nx, ny, nz = np.cos(lat)*np.sin(angle), np.sin(lat), np.cos(lat)*np.cos(angle)
top, bottom = config["top"], config["bottom"]
ring_y, ring_r = np.array(config["rings"]).T
ring_lat = np.arcsin(np.clip(1-2*(ring_y-top)/(bottom-top),-1,1))
radius = np.interp(lat, ring_lat[::-1], ring_r[::-1])
py = top + .5*(bottom-top)*(1-ny)
px = config["center"][0] + radius*np.sin(angle)

def sample(x, y):
    ix, iy = x.astype(int), y.astype(int)
    fx, fy = (x-ix)[...,None], (y-iy)[...,None]
    upper = photo[iy,ix]*(1-fx) + photo[iy,ix+1]*fx
    lower = photo[iy+1,ix]*(1-fx) + photo[iy+1,ix+1]*fx
    return upper*(1-fy)+lower*fy

def fade(value):
    t=np.clip(value,0,1)
    return t*t*(3-2*t)

def gain(color, amount):
    return color*amount/(1+color*(amount-1))

# Pixel landmarks use the hero's native resolution. Exclude pins above the knit and
# the loose strand that crosses the lower-left silhouette, even in side views.
front_weight = fade((np.cos(angle)-.19)/.26)*fade((py-740)/12)
strand_top = np.interp(px, [1755,1820,1890,1944,1974,2013,2139],
                            [1050,1052,1067,1056,1054,1083,1085])
front_weight *= fade((strand_top-py)/12)

front = sample(px,py)
key = np.maximum(0,.60*nx+.72*ny+.35*nz)
illum = .58+.51*key+.20*(.5+.5*ny)
front = gain(front,1/illum[...,None])

# Use a swatch from the mid-Atlantic for the unseen loops. Fold at continuous
# boundaries and vary the spacing with latitude like decreases in a knitted ball.
cols = np.maximum(8,2*np.round(53*np.cos(lat)))
phase = (x+.5)/width*cols
rows = (y+.5)/height*49
def mirror(t, size):
    return size-np.abs(t%(2*size)-size)
swatch = sample(1927+mirror(phase*10.6+.5*np.sin(rows*.7),37),
                820+mirror(rows*10.4+.7*np.sin(phase),67))
swatch_luma = swatch @ [.24,.52,.24]
detail = np.clip((swatch_luma/.106)**.81,.32,2)
cell_x = ((np.floor(phase)+.5)/cols*width).astype(int)%width
cell_y = np.minimum(height-1, ((np.floor(rows)+.5)/49*height).astype(int))
cream = land[cell_y,cell_x]>128
# The photographed lower rim is plain blue wool. Let Antarctic stitches end on
# the hidden side of the base rather than bleeding into the restored front edge.
facing = fade((np.cos(angle)+.1)/.5)
land_mix = cream.astype(float)*(1-facing*fade((py-1015)/36))
land_mix *= 1-facing*fade((759-py)/12)
gold = np.clip(.34-.36*ny+.25*np.cos(angle*2.3),0,1)
sand = np.array([.81,.68,.50]) - gold[...,None]*np.array([.04,.15,.26])
navy = np.array([.094,.103,.169])
back = (navy+(sand-navy)*land_mix[...,None]) * detail[...,None]
mixed = back*(1-front_weight[...,None])+front*front_weight[...,None]
out = root/'assets/about'
rgb = Image.fromarray(np.uint8(np.clip(mixed,0,1)*255))
rgb.save(out/'wool.webp',quality=95,method=5)
# Retain only local contrast in the relief; continent colours are dye, not altitude.
lum = rgb.convert('L')
smooth = np.asarray(lum.filter(ImageFilter.GaussianBlur(4)),dtype=float)
relief = np.clip((np.asarray(lum,dtype=float)+8)/(smooth+8)*120,0,255)
Image.fromarray(relief.astype(np.uint8)).save(out/'relief.webp',quality=87,method=5)
