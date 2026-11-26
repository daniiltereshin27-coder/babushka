import { createCanvas, loadImage } from '@napi-rs/canvas';
import { geoContains, geoPath, geoEquirectangular } from 'd3-geo';
import { feature } from 'topojson-client';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const assets = new URL('../assets/', import.meta.url);
const require = createRequire(import.meta.url);
const atlas = JSON.parse(await readFile(require.resolve('world-atlas/land-110m.json')));
const polygons = feature(atlas, atlas.objects.land).features.flatMap(f => f.geometry.coordinates);
const dyes = [[20,40,107], [245,180,0], [239,227,200]];
function makeRandom(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// Identify connected mainland polygons by interior coordinates; islands get cream yarn.
function mainland(polygon) {
  return [[38,55], [19,3], [-100,42], [-56,-13], [-170,66]].some(p => geoContains(polygon,p));
}
function makePattern(cols, rows) {
  const scale = 4;
  const mask = createCanvas(cols*scale,cols*scale/2);
  const ctx = mask.getContext('2d');
  const project = geoEquirectangular().scale(mask.width/(2*Math.PI)).translate([mask.width/2,mask.height/2]);
  const path = geoPath(project,ctx);
  for (const coordinates of polygons) {
    const polygon = {type:'Polygon', coordinates};
    ctx.beginPath(); path(polygon);
    ctx.fillStyle = mainland(polygon) ? '#ffffff' : '#888888';
    ctx.fill();
  }
  const {data} = ctx.getImageData(0,0,mask.width,mask.height);
  return Array.from({length:cols*rows}, (_,i) => {
    const x=(i%cols)*scale+2,y=Math.floor((Math.floor(i/cols)+.5)*mask.height/rows);
    const k=4*(y*mask.width+x);
    return data[k+3]<128 ? 0 : data[k]>190 ? 1 : 2;
  });
}
async function trimmed(file, convertBlack=false) {
  const img=await loadImage(await readFile(new URL(file,assets)));
  const original=createCanvas(img.width,img.height), ctx=original.getContext('2d');
  ctx.drawImage(img,0,0);
  const pixels=ctx.getImageData(0,0,img.width,img.height), bytes=pixels.data;
  if (convertBlack && bytes[3]>245 && bytes[(img.width>>1)*4+3]>245) {
    for(let i=0;i<bytes.length;i+=4) bytes[i+3]=Math.min(255,Math.max(0,(bytes[i]-18)*3));
    ctx.putImageData(pixels,0,0);
  }
  let x0=img.width,y0=img.height,x1=0,y1=0;
  for(let y=0;y<img.height;y++) for(let x=0;x<img.width;x++) {
    if(bytes[(y*img.width+x)*4+3]<24) continue;
    x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
  }
  const tile=createCanvas(x1-x0+1,y1-y0+1);
  tile.getContext('2d').drawImage(original,-x0,-y0);
  return tile;
}
const stitch=await trimmed('stitch.png');
function stamp(width,height,dye,brightness) {
  const tile=createCanvas(Math.ceil(width*2),Math.ceil(height*2));
  const ctx=tile.getContext('2d');
  ctx.imageSmoothingQuality='high';ctx.drawImage(stitch,0,0,tile.width,tile.height);
  const image=ctx.getImageData(0,0,tile.width,tile.height);
  for(let k=0;k<image.data.length;k+=4) {
    const luma=(image.data[k]*.299+image.data[k+1]*.587+image.data[k+2]*.114)/255;
    for(let c=0;c<3;c++) image.data[k+c]=Math.min(255,luma*dye[c]*brightness);
  }
  ctx.putImageData(image,0,0);return tile;
}
async function bake(width,height,cols,rows,suffix) {
  const color=createCanvas(width,height), bump=createCanvas(width,height);
  const c=color.getContext('2d'), b=bump.getContext('2d');
  const cw=width/cols,ch=height/rows,sw=cw*1.04,sh=ch*1.15;
  const stamps=dyes.map(dye=>Array.from({length:13},(_,i)=>stamp(sw,sh,dye,.94+i*.01)));
  const relief=stamp(sw,sh,[255,255,255],1);
  const pattern=makePattern(cols,rows),rand=makeRandom(20261126);
  for(let r=0;r<rows;r++) for(let j=0;j<cols;j++) {
    c.fillStyle='rgb('+dyes[pattern[r*cols+j]].map(n=>Math.round(n*.45)).join(',')+')';
    c.fillRect(Math.floor(j*cw),Math.floor(r*ch),Math.ceil(cw)+1,Math.ceil(ch)+1);
  }
  b.fillStyle='#000';b.fillRect(0,0,width,height);
  for(let r=rows-1;r>=0;r--) for(let j=0;j<cols;j++) {
    const x=(j+.5)*cw,y=(r+.5)*ch, angle=(rand()*6-3)*Math.PI/180;
    const tile=stamps[pattern[r*cols+j]][Math.floor(rand()*13)];
    const cosine=Math.cos(angle),sine=Math.sin(angle);
    for(const offset of j===0?[0,width]:j===cols-1?[0,-width]:[0]) {
      for(const ctx of [c,b]) {
        ctx.setTransform(cosine,sine,-sine,cosine,x+offset,y);
        ctx.drawImage(ctx===c?tile:relief,-sw/2,-sh/2,sw,sh);
      }
    }
  }
  await writeFile(new URL('knit-color'+suffix+'.webp',assets),await color.encode('webp',85));
  await writeFile(new URL('knit-bump'+suffix+'.webp',assets),await bump.encode('webp',85));
  if(!suffix) {
    const crop=createCanvas(1024,1024);
    crop.getContext('2d').drawImage(color,1810,210,1024,1024,0,0,1024,1024);
    await writeFile(new URL('europe-africa.png',assets),await crop.encode('png'));
  }
}
await bake(4096,2048,240,140,'');
await bake(2048,1024,160,94,'-m');
// The opaque core wraps around the tube; the source's transparent margins would cut it lengthwise.
const yarn=await trimmed('yarn.png',true);
const strand=createCanvas(768,64);
strand.getContext('2d').drawImage(yarn,0,yarn.height*.39,yarn.width,yarn.height*.22,0,0,768,64);
await writeFile(new URL('strand.webp',assets),await strand.encode('webp',93));

const fallback=await loadImage(await readFile(new URL('globe-fallback.png',assets)));
const preview=createCanvas(640,Math.round(640*fallback.height/fallback.width));
preview.getContext('2d').drawImage(fallback,0,0,preview.width,preview.height);
await writeFile(new URL('poster.webp',assets),await preview.encode('webp',82));
