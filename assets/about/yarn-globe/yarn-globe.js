// Страница «О нас»: вязаный глобус с городами-витриной и реальными направлениями из /api/routes.
import * as THREE from './three.module.min.js';

const GLOBE = new URL('./', import.meta.url);
const LAND_URL = new URL('../land.json', GLOBE);
const STITCH_URL = new URL('stitch.png', GLOBE);
const YARN_URL = new URL('yarn.jpeg', GLOBE);
const DENSITY = 110;

// Координаты городов из справочника локаций (название до запятой).
const COORDS = {
  'Москва':[55.7558,37.6173],'Санкт-Петербург':[59.9343,30.3351],'Дубай':[25.2048,55.2708],'Абу-Даби':[24.4539,54.3773],
  'Стамбул':[41.0082,28.9784],'Анталья':[36.8969,30.7133],'Анкара':[39.9334,32.8597],'Алма-Ата':[43.222,76.8512],'Алматы':[43.222,76.8512],
  'Астана':[51.1694,71.4491],'Ташкент':[41.2995,69.2401],'Бишкек':[42.8746,74.5698],'Тбилиси':[41.7151,44.8271],'Батуми':[41.6168,41.6367],
  'Ереван':[40.1792,44.4991],'Баку':[40.4093,49.8671],'Минск':[53.9006,27.559],'Бангкок':[13.7563,100.5018],'Пхукет':[7.8804,98.3923],
  'Паттайя':[12.9236,100.8825],'Денпасар':[-8.6705,115.2126],'Сингапур':[1.3521,103.8198],'Куала-Лумпур':[3.139,101.6869],
  'Джакарта':[-6.2088,106.8456],'Хошимин':[10.8231,106.6297],'Ханой':[21.0278,105.8342],'Гонконг':[22.3193,114.1694],
  'Шанхай':[31.2304,121.4737],'Пекин':[39.9042,116.4074],'Гуанчжоу':[23.1291,113.2644],'Токио':[35.6762,139.6503],'Сеул':[37.5665,126.978],
  'Доха':[25.2854,51.531],'Эр-Рияд':[24.7136,46.6753],'Тель-Авив':[32.0853,34.7818],'Каир':[30.0444,31.2357],'Лимассол':[34.7071,33.0226],
  'Ларнака':[34.9003,33.6232],'Варшава':[52.2297,21.0122],'Берлин':[52.52,13.405],'Прага':[50.0755,14.4378],'Вена':[48.2082,16.3738],
  'Будапешт':[47.4979,19.0402],'Белград':[44.7866,20.4489],'Рим':[41.9028,12.4964],'Милан':[45.4642,9.19],'Мадрид':[40.4168,-3.7038],
  'Барселона':[41.3874,2.1686],'Лиссабон':[38.7223,-9.1393],'Париж':[48.8566,2.3522],'Амстердам':[52.3676,4.9041],'Лондон':[51.5072,-0.1276],
  'Нью-Йорк':[40.7128,-74.006],'Майами':[25.7617,-80.1918],'Лос-Анджелес':[34.0522,-118.2437],'Торонто':[43.6532,-79.3832],
  'Мехико':[19.4326,-99.1332],'Сан-Паулу':[-23.5558,-46.6396],'Буэнос-Айрес':[-34.6037,-58.3816],'Сидней':[-33.8688,151.2093],'Мельбурн':[-37.8136,144.9631]};

// Витрина глобуса: финансовые и туристические центры, разнесённые по карте, чтобы булавки не слипались.
// Первый город — центр, от него и между соседями тянутся нити.
const SHOWCASE = ['Москва','Дубай','Стамбул','Лондон','Нью-Йорк','Майами','Сингапур','Гонконг','Токио',
  'Бангкок','Пхукет','Денпасар','Тбилиси','Алматы','Барселона','Буэнос-Айрес'];
const DISPLAY = {'Денпасар':'Бали'};
// Нити: от Москвы к ключевым центрам и короткие связки между соседями.
const LINKS = [['Москва','Дубай'],['Москва','Стамбул'],['Москва','Лондон'],['Москва','Алматы'],['Москва','Тбилиси'],
  ['Дубай','Сингапур'],['Дубай','Бангкок'],['Лондон','Нью-Йорк'],['Нью-Йорк','Майами'],['Майами','Буэнос-Айрес'],
  ['Сингапур','Денпасар'],['Бангкок','Пхукет'],['Гонконг','Токио'],['Сингапур','Гонконг'],['Лондон','Барселона'],['Стамбул','Дубай']];
const TELEGRAM = 'https://t.me/baulsk';

const stage = document.querySelector('[data-yarn-globe]');
if (stage) loadCities().then(cities => init(stage, cities));

async function loadCities(){
  const byCity=new Map();
  for(const name of SHOWCASE){const c=COORDS[name];if(c)byCity.set(name,{n:DISPLAY[name]||name,key:name,lat:c[0],lon:c[1],route:null})}
  try{
    const res=await fetch('/api/routes');if(!res.ok)throw Error(res.status);
    for(const r of await res.json()){if(!r.city)continue;const name=r.city.split(',')[0].trim();const c=COORDS[name];if(!c)continue;
      const city=byCity.get(name)||{n:DISPLAY[name]||name,key:name,lat:c[0],lon:c[1],route:null};
      if(!city.route)city.route=r;byCity.set(name,city)}
  }catch{/* без направлений глобус остаётся витриной */}
  return [...byCity.values()];
}

/* ---------- вязаная текстура ---------- */
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function loadImg(s){return new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=j;i.src=s})}
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
function landMask(geoms,LW,LH){
  const c=canvas(LW,LH),g=c.getContext('2d',{willReadFrequently:true});g.fillStyle='#000';g.fillRect(0,0,LW,LH);g.fillStyle='#fff';
  const X=l=>(l+180)/360*LW, Y=l=>(90-l)/180*LH;
  for(const gm of geoms){if(!gm||(gm.type!=='Polygon'&&gm.type!=='MultiPolygon'))continue;
    const polys=gm.type==='Polygon'?[gm.coordinates]:gm.coordinates;
    for(const poly of polys){g.beginPath();for(const ring of poly){ring.forEach(([lo,la],i)=>i?g.lineTo(X(lo),Y(la)):g.moveTo(X(lo),Y(la)));g.closePath()}g.fill('evenodd')}}
  return g.getImageData(0,0,LW,LH).data;
}
function kindOf(lon,lat){if(lat<-60)return 2;if(lon>-75&&lon<-10&&lat>59)return 2;if(lon<-30&&lat>12)return 2;if(lon>-25&&lon<45&&lat>36)return 2;return 1}
const COL={0:[40,78,186],1:[245,180,0],2:[239,227,200]};
function tint(img,rgb,k){const c=canvas(img.width,img.height),g=c.getContext('2d');g.drawImage(img,0,0);
  g.globalCompositeOperation='multiply';g.fillStyle='rgb('+rgb.map(v=>Math.min(255,Math.round(v*k))).join(',')+')';g.fillRect(0,0,c.width,c.height);
  g.globalCompositeOperation='destination-in';g.drawImage(img,0,0);return c}
const MW=2048,MH=1024;
function knit(mask,stitch,W,H,cols0){
  const rows=Math.round(cols0*0.58), rnd=rng(7);
  const land=(lon,lat)=>{const x=Math.min(MW-1,Math.max(0,Math.floor((lon+180)/360*MW))),y=Math.min(MH-1,Math.max(0,Math.floor((90-lat)/180*MH)));return mask[(y*MW+x)*4]>127};
  const LEV=[.86,.93,1,1.06];const spr={};for(const k of [0,1,2])spr[k]=LEV.map(l=>tint(stitch,COL[k],l));
  const color=canvas(W,H),cg=color.getContext('2d'),bump=canvas(W,H),bg=bump.getContext('2d');
  bg.fillStyle='#161616';bg.fillRect(0,0,W,H);
  const ch=H/rows, cells=[];
  for(let r=rows-1;r>=0;r--){const lat=90-(r+.5)*180/rows, cols=Math.max(6,Math.round(cols0*Math.cos(lat*Math.PI/180))), cw=W/cols;
    for(let c=0;c<cols;c++){const lon=-180+(c+.5)*360/cols;let hit=0;
      for(const dx of[-.3,0,.3])for(const dy of[-.3,0,.3])hit+=land(lon+dx*360/cols,lat+dy*180/rows);
      let k=hit>=4?kindOf(lon,lat):0;if(lat<-70)k=2;cells.push({r,c,cw,k});
      cg.fillStyle='rgb('+COL[k].map(v=>Math.round(v*.33)).join(',')+')';cg.fillRect(c*cw-1,r*ch-1,cw+2,ch+2)}}
  for(const {r,c,cw,k} of cells){const sw=cw*1.12, sh=ch*1.8, x=(c+.5)*cw, yb=(r+1)*ch+ch*.12, a=(rnd()-.5)*.1, s=spr[k][Math.floor(rnd()*LEV.length)];
    const offs=[0];if(x-sw/2<0)offs.push(W);if(x+sw/2>W)offs.push(-W);
    for(const off of offs)for(const [g,img] of [[cg,s],[bg,stitch]]){g.setTransform(1,0,0,1,x+off,yb);g.rotate(a);g.drawImage(img,-sw/2,-sh,sw,sh)}}
  cg.setTransform(1,0,0,1,0,0);bg.setTransform(1,0,0,1,0,0);
  return {color,bump};
}

function init(stage,CITIES){
  const HUB=0, idx=Object.fromEntries(CITIES.map((c,i)=>[c.key,i]));
  const PAIRS=LINKS.filter(([a,b])=>a in idx&&b in idx).map(([a,b])=>[idx[a],idx[b]]);
  // Города с реальными направлениями, которых нет в витрине, — нитью от центра.
  CITIES.forEach((c,i)=>{if(i&&!PAIRS.some(p=>p.includes(i)))PAIRS.push([HUB,i])});
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loader=document.createElement('div');loader.className='yarn-loader';loader.textContent='Бабушка вяжет глобус…';stage.append(loader);
  const fail=msg=>{loader.textContent=msg;loader.classList.add('yarn-loader--error')};
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})}catch{fail('Этот браузер не умеет показывать 3D-глобус.');return}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  stage.prepend(renderer.domElement);
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(30,1,.1,100);camera.position.set(0,0,4.6);
  scene.add(new THREE.HemisphereLight(0xfff1dc,0x0a1b4d,1.1));
  const key=new THREE.DirectionalLight(0xffe2b0,2.4);key.position.set(3,2.5,4);scene.add(key);
  const rim=new THREE.DirectionalLight(0x7f9cff,1.2);rim.position.set(-4,1,-2.5);scene.add(rim);
  const world=new THREE.Group();scene.add(world);
  const globeMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95,metalness:0,bumpScale:3});
  const globe=new THREE.Mesh(new THREE.SphereGeometry(1,160,120),globeMat);world.add(globe);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.16,64,48),new THREE.ShaderMaterial({side:THREE.BackSide,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,
    vertexShader:'varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 vN;void main(){float i=pow(clamp(.72-dot(vN,vec3(0,0,1.)),0.,1.),3.);gl_FragColor=vec4(1.,.78,.32,1.)*i*.55;}'})));
  const vec=(lat,lon,r=1)=>{const a=lat*Math.PI/180,b=lon*Math.PI/180;return new THREE.Vector3(Math.cos(a)*Math.cos(b)*r,Math.sin(a)*r,-Math.cos(a)*Math.sin(b)*r)};

  const silver=new THREE.MeshStandardMaterial({color:0xdcdcdc,metalness:.9,roughness:.25});
  const goldM=new THREE.MeshStandardMaterial({color:0xf5b400,metalness:.65,roughness:.28,emissive:0x2a1800});
  const heads=[];
  CITIES.forEach((c,i)=>{const n=vec(c.lat,c.lon).normalize();const pin=new THREE.Group();
    const needle=new THREE.Mesh(new THREE.CylinderGeometry(.0035,.0035,.1,8),silver);needle.position.y=.035;
    const head=new THREE.Mesh(new THREE.SphereGeometry(i===HUB?.03:c.route?.025:.021,24,16),goldM);head.position.y=.085;head.userData.i=i;
    pin.add(needle,head);pin.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),n);pin.position.copy(n);world.add(pin);heads.push(head);c.head=head;c.v=n});

  const rings=[];const ringGeo=new THREE.RingGeometry(.03,.037,48);
  function ring(i){const c=CITIES[i];const m=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0xffcf3a,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),c.v);m.position.copy(c.v).multiplyScalar(1.004);world.add(m);rings.push({m,t:0})}

  const RAD=.016,SEG=180,RS=10;const arcs=[];let yarnTex=null;
  function makeArc(a,b,order){const A=CITIES[a].v,B=CITIES[b].v,ang=A.angleTo(B),alt=.1+.42*ang/Math.PI,pts=[];
    for(let k=0;k<=64;k++){const t=k/64,s=Math.sin(ang);const p=A.clone().multiplyScalar(Math.sin((1-t)*ang)/s).add(B.clone().multiplyScalar(Math.sin(t*ang)/s));pts.push(p.normalize().multiplyScalar(1.004+alt*Math.sin(Math.PI*t)))}
    const curve=new THREE.CatmullRomCurve3(pts),geo=new THREE.TubeGeometry(curve,SEG,RAD,RS,false);
    const tex=yarnTex.clone();tex.needsUpdate=true;tex.repeat.set(curve.getLength()/(RAD*2*16.25)*2.2,1);
    const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:tex,color:0xffd451,roughness:.8,metalness:.1,emissive:0x3a2600}));
    geo.setDrawRange(0,0);world.add(mesh);arcs.push({mesh,geo,order,to:b,fired:false})}
  // Нити вяжутся по очереди: одновременно видно 3–4, а не весь клубок.
  const STEP=1.1, PERIOD=Math.max(7.5,PAIRS.length*STEP), DRAW=1.7, HOLD=1.6, FADE=1.2;
  const ease=x=>x<.5?2*x*x:1-(-2*x+2)**2/2;
  function updArcs(t){for(const r of arcs){if(r.extra)continue;const ph=reduce?DRAW+.1:((t-r.order*STEP)%PERIOD+PERIOD)%PERIOD;let a=0,b=0;
    if(ph<DRAW){b=ease(ph/DRAW);r.fired=false}else if(ph<DRAW+HOLD){b=1;if(!r.fired){r.fired=true;if(!reduce){ring(r.to);flash[r.to]=t}}}else if(ph<DRAW+HOLD+FADE){b=1;a=ease((ph-DRAW-HOLD)/FADE)}else{a=b=1}
    const s=Math.floor(a*SEG),e=Math.floor(b*SEG);r.geo.setDrawRange(s*RS*6,Math.max(0,e-s)*RS*6)}}

  const labels=CITIES.map(c=>{const d=document.createElement('div');d.className='yarn-label';d.textContent=c.n;stage.append(d);return d});
  let hover=-1, focusIdx=-1; const flash={};

  Promise.all([loadImg(STITCH_URL.href),loadImg(YARN_URL.href),fetch(LAND_URL).then(r=>{if(!r.ok)throw Error(r.status);return r.json()})]).then(async([stitch,yarn,land])=>{
    yarnTex=new THREE.Texture(yarn);yarnTex.needsUpdate=true;yarnTex.colorSpace=THREE.SRGBColorSpace;yarnTex.wrapS=THREE.RepeatWrapping;
    PAIRS.forEach(([a,b],i)=>makeArc(a,b,i));
    await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,30)));
    const geoms=Array.isArray(land)?land:(land.features?land.features.map(f=>f.geometry):[land]);
    const small=innerWidth<768, W=small?2048:4096, H=W/2;
    const {color,bump}=knit(landMask(geoms,MW,MH),stitch,W,H,small?Math.min(DENSITY,96):DENSITY);
    const map=new THREE.CanvasTexture(color);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=renderer.capabilities.getMaxAnisotropy();
    const bm=new THREE.CanvasTexture(bump);bm.anisotropy=map.anisotropy;
    globeMat.map=map;globeMat.bumpMap=bm;globeMat.needsUpdate=true;loader.remove();
    requestAnimationFrame(()=>renderer.domElement.classList.add('is-ready'));
  }).catch(()=>fail('Не удалось загрузить глобус.'));

  // Стартовый ракурс — на центральный город.
  const start=CITIES[HUB]||{lat:35,lon:40};
  let rotY=-(start.lon+90)*Math.PI/180, rotX=Math.max(-.9,Math.min(.9,start.lat*.75*Math.PI/180)), vy=0, vx=0, spin=!reduce, drag=null, target=null;
  const cnv=renderer.domElement, pointer=new THREE.Vector2(9,9), ray=new THREE.Raycaster();
  // Ближайшая видимая булавка в радиусе ~22px от точки (удобно пальцем).
  const screenPos=new THREE.Vector3(), camDir0=new THREE.Vector3();
  function pickAt(clientX,clientY){const r=cnv.getBoundingClientRect();let best=-1,bd=22;
    world.updateMatrixWorld();camDir0.copy(camera.position).normalize();
    CITIES.forEach((c,i)=>{c.head.getWorldPosition(screenPos);if(screenPos.clone().normalize().dot(camDir0)<.2)return;screenPos.project(camera);
      const d=Math.hypot(r.left+(screenPos.x*.5+.5)*r.width-clientX,r.top+(-screenPos.y*.5+.5)*r.height-clientY);if(d<bd){bd=d;best=i}});
    return best}
  cnv.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:0};cnv.setPointerCapture(e.pointerId);target=null});
  cnv.addEventListener('pointermove',e=>{const r=cnv.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
    if(e.pointerType==='mouse'&&!drag)hover=pickAt(e.clientX,e.clientY);
    if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;drag.moved+=Math.abs(dx)+Math.abs(dy);
    if(drag.moved<6)return;vy=dx*.006;vx=dy*.006;rotY+=vy;rotX=Math.max(-.9,Math.min(.9,rotX+vx))});
  const end=e=>{if(!drag)return;const {moved,sx,sy}=drag;drag=null;if(moved<6){const i=pickAt(sx,sy);if(i>=0)focusCity(i)}};
  cnv.addEventListener('pointerup',end);cnv.addEventListener('pointercancel',end);
  cnv.addEventListener('pointerleave',()=>{pointer.set(9,9);hover=-1});
  stage.tabIndex=0;
  stage.addEventListener('keydown',e=>{const s=.18;
    if(e.key==='ArrowLeft')rotY-=s;else if(e.key==='ArrowRight')rotY+=s;
    else if(e.key==='ArrowUp')rotX=Math.max(-.9,rotX-s);else if(e.key==='ArrowDown')rotX=Math.min(.9,rotX+s);else return;
    e.preventDefault();target=null;vx=vy=0});

  // Карточка «Обмен в городе» со ссылкой в калькулятор.
  const card=document.querySelector('[data-city-card]'), cardName=card?.querySelector('[data-city-name]');
  const cardLabel=card?.querySelector('.city-card__label');
  function showCard(c){if(!card)return;const r=c.route;
    if(r){card.href='/?'+new URLSearchParams({src:r.src,dst:r.dst,city:r.city})+'#exchange';card.removeAttribute('target');card.removeAttribute('rel');
      cardLabel.textContent='Обмен в городе';card.setAttribute('aria-label','Рассчитать обмен в городе '+c.n)}
    else{card.href=TELEGRAM;card.target='_blank';card.rel='noopener noreferrer';
      cardLabel.textContent='Уточнить у менеджера';card.setAttribute('aria-label','Уточнить обмен в городе '+c.n+' у менеджера в Telegram')}
    cardName.textContent=c.n;card.hidden=false;
    card.style.animation='none';void card.offsetWidth;card.style.animation=''}

  let resumeAt=0; // после выбора города вращение продолжается через несколько секунд
  function focusCity(i){focusIdx=i;const c=CITIES[i];showCard(c);resumeAt=clock.elapsedTime+5;
    let ty=-(c.lon+90)*Math.PI/180;while(ty-rotY>Math.PI)ty-=2*Math.PI;while(ty-rotY<-Math.PI)ty+=2*Math.PI;
    target={y:ty,x:Math.max(-.9,Math.min(.9,c.lat*Math.PI/180))};vy=vx=0;
    if(i!==HUB&&yarnTex){arcs.filter(a=>a.extra).forEach(a=>{world.remove(a.mesh);a.geo.dispose()});for(let k=arcs.length-1;k>=0;k--)if(arcs[k].extra)arcs.splice(k,1);
      makeArc(HUB,i,0);const a=arcs[arcs.length-1];a.extra=true;a.start=clock.elapsedTime}
    else ring(i);
    flash[i]=clock.elapsedTime}


  const clock=new THREE.Clock();let visible=true;
  new IntersectionObserver(([en])=>{visible=en.isIntersecting}).observe(stage);
  function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;
    camera.position.z=Math.max(4.45,4.7/(w/h));camera.updateProjectionMatrix()}
  new ResizeObserver(resize).observe(stage);resize();
  const tmp=new THREE.Vector3(),camDir=new THREE.Vector3();
  renderer.setAnimationLoop(()=>{
    if(!visible||document.hidden)return;const dt=Math.min(clock.getDelta(),.05),t=clock.elapsedTime;
    if(target){rotY+=(target.y-rotY)*Math.min(1,dt*3.2);rotX+=(target.x-rotX)*Math.min(1,dt*3.2);if(Math.abs(target.y-rotY)<.002&&Math.abs(target.x-rotX)<.002)target=null}
    else if(!drag){rotY+=vy;rotX=Math.max(-.9,Math.min(.9,rotX+vx));vy*=.94;vx*=.94;if(spin&&t>=resumeAt)rotY+=dt*.12}
    world.rotation.set(rotX,rotY,0,'XYZ');
    if(yarnTex)updArcs(t);
    for(const a of arcs)if(a.extra){const ph=t-a.start;const b=Math.min(1,ease(Math.min(1,ph/DRAW)));a.geo.setDrawRange(0,Math.floor(b*SEG)*RS*6);if(ph>DRAW&&!a.fired){a.fired=true;ring(a.to)}}
    for(let k=rings.length-1;k>=0;k--){const r=rings[k];r.t+=dt;const p=r.t/1.5;r.m.scale.setScalar(1+p*3.2);r.m.material.opacity=1-p;if(p>=1){world.remove(r.m);r.m.material.dispose();rings.splice(k,1)}}
    world.updateMatrixWorld();
    cnv.style.cursor=drag?'grabbing':hover>=0?'pointer':'grab';
    const w=stage.clientWidth,h=stage.clientHeight;camDir.copy(camera.position).normalize();
    CITIES.forEach((c,i)=>{c.head.getWorldPosition(tmp);const front=tmp.clone().normalize().dot(camDir)>.25;
      // Подпись видна только у выбранного города, под курсором и на секунду, когда к городу дотянулась нить.
      const active=i===focusIdx||i===hover, on=front&&(active||Boolean(flash[i]&&t-flash[i]<1.8));tmp.project(camera);
      labels[i].style.transform='translate('+((tmp.x*.5+.5)*w)+'px,'+((-tmp.y*.5+.5)*h)+'px) translate(-50%,-150%)';
      labels[i].classList.toggle('on',on);labels[i].classList.toggle('is-active',active)});
    renderer.render(scene,camera);
  });
}
