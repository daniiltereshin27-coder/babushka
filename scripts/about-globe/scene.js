// Build with esbuild scene.js --bundle --minify --format=esm; dependencies: three@0.187.0, three-globe@2.45.6 (MIT).
import * as THREE from 'three';
import ThreeGlobe from 'three-globe';

// Illustrative connections from the Aceternity GitHub Globe example.
const routes = [
 [1,-19.885592,-43.951191,-22.9068,-43.1729,.1], [1,28.6139,77.209,3.139,101.6869,.2],
 [1,-19.885592,-43.951191,-1.303396,36.852443,.5], [2,1.3521,103.8198,35.6762,139.6503,.2],
 [2,51.5072,-.1276,3.139,101.6869,.3], [2,-15.785493,-47.909029,36.162809,-115.119411,.3],
 [3,-33.8688,151.2093,22.3193,114.1694,.3], [3,21.3099,-157.8581,40.7128,-74.006,.3],
 [3,-6.2088,106.8456,51.5072,-.1276,.3], [4,11.986597,8.571831,-15.595412,-56.05918,.5],
 [4,-34.6037,-58.3816,22.3193,114.1694,.7], [4,51.5072,-.1276,48.8566,-2.3522,.1],
 [5,14.5995,120.9842,51.5072,-.1276,.3], [5,1.3521,103.8198,-33.8688,151.2093,.2],
 [5,34.0522,-118.2437,48.8566,-2.3522,.2], [6,-15.432563,28.315853,1.094136,-63.34546,.7],
 [6,37.5665,126.978,35.6762,139.6503,.1], [6,22.3193,114.1694,51.5072,-.1276,.3],
 [7,-19.885592,-43.951191,-15.595412,-56.05918,.1], [7,48.8566,-2.3522,52.52,13.405,.1],
 [7,52.52,13.405,34.0522,-118.2437,.2], [8,-8.833221,13.264837,-33.936138,18.436529,.2],
 [8,49.2827,-123.1207,52.3676,4.9041,.2], [8,1.3521,103.8198,40.7128,-74.006,.5],
 [9,51.5072,-.1276,34.0522,-118.2437,.2], [9,22.3193,114.1694,-22.9068,-43.1729,.7],
 [9,1.3521,103.8198,-34.6037,-58.3816,.5], [10,-22.9068,-43.1729,28.6139,77.209,.7],
 [10,34.0522,-118.2437,31.2304,121.4737,.3], [10,-6.2088,106.8456,52.3676,4.9041,.3],
 [11,41.9028,12.4964,34.0522,-118.2437,.2], [11,-6.2088,106.8456,31.2304,121.4737,.2],
 [11,22.3193,114.1694,1.3521,103.8198,.2], [12,34.0522,-118.2437,37.7749,-122.4194,.1],
 [12,35.6762,139.6503,22.3193,114.1694,.2], [12,22.3193,114.1694,34.0522,-118.2437,.3],
 [13,52.52,13.405,22.3193,114.1694,.3], [13,11.986597,8.571831,35.6762,139.6503,.3],
 [13,-22.9068,-43.1729,-34.6037,-58.3816,.1], [14,-33.936138,18.436529,21.395643,39.883798,.3]
];

const canvas = document.querySelector('canvas');
const display = canvas.parentElement;
const poster = display.querySelector('.poster');
const caption = document.querySelector('figcaption');
const play = caption.querySelector('button');

async function mountGlobe() {
  const renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true, powerPreference:'low-power'});
  renderer.setClearColor(0, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  const scene = new THREE.Scene(), rig = new THREE.Group();
  scene.add(rig);
  const response = await fetch('/assets/about/land.json');
  if (!response.ok) throw new Error('Cannot load globe geography');
  const land = await response.json();
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 1800);
  camera.position.z = 305;
  camera.updateMatrixWorld();

  const globe = new ThreeGlobe({animateIn: false, waitForGlobeReady: false});
  const material = globe.globeMaterial();
  material.color.set('#322418');
  material.emissive.set('#25180f');
  material.emissiveIntensity = 0.35;
  material.shininess = 0.9;

  const palette = ['#f5b400', '#e9c089', '#f7efe3'];
  const arcs = routes.map(([order, startLat, startLng, endLat, endLng, arcAlt], i) => ({
    order, startLat, startLng, endLat, endLng, arcAlt, color: palette[i % palette.length],
  }));
  const endpoints = new Map();
  for (const arc of arcs) {
    for (const [lat, lng] of [[arc.startLat, arc.startLng], [arc.endLat, arc.endLng]]) {
      endpoints.set(lat + ',' + lng, {lat, lng, color: arc.color});
    }
  }
  const points = Array.from(endpoints.values());
  globe.hexPolygonsData(land).hexPolygonGeoJsonGeometry(shape => shape)
    .hexPolygonResolution(3).hexPolygonMargin(0.7).hexPolygonColor(() => '#f1cf9c')
    .showAtmosphere(true).atmosphereColor('#af8655').atmosphereAltitude(0.1)
    .arcsData(arcs).arcAltitude('arcAlt').arcColor('color').arcStroke(0.3)
    .arcDashLength(0.9).arcDashInitialGap(arc => arc.order % 4 === 2 ? -0.12 : arc.order - 8.4).arcDashGap(15).arcDashAnimateTime(1000)
    .arcsTransitionDuration(0)
    .pointsData(points).pointColor('color').pointAltitude(0).pointRadius(2).pointsMerge(true)
    .ringColor(() => t => 'rgba(245,180,0,' + (1 - t) + ')')
    .ringMaxRadius(3).ringPropagationSpeed(3).ringRepeatPeriod(900);
  rig.add(globe);
  const key = new THREE.DirectionalLight(0xfff3df, 1.2);
  key.position.set(-400, 100, 400);
  const top = new THREE.DirectionalLight(0xffddb0, 1);
  top.position.set(-200, 500, 200);
  scene.add(new THREE.AmbientLight(0xffdfb9, 0.7), key, top);

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let rotating = !motion.matches, visible = true, frame = 0, previous = 0;
  let pointer = null, moving = false, startX = 0, startY = 0, lon = -0.35, lat = 0.26;
  let nextRingChange = 0;
  function draw(time) {
    frame = 0;
    if(document.hidden || !visible || renderer.getContext().isContextLost()) return;
    if(rotating && pointer === null && previous) lon += Math.min(time-previous,60)*.000075;
    previous=time;
    rig.rotation.set(lat,lon,0,'YXZ');
    if (rotating && time >= nextRingChange) {
      globe.ringsData(points.filter(() => Math.random() < 0.5));
      nextRingChange = time + 2000;
    }
    renderer.render(scene,camera);
    if(rotating && pointer===null) frame=requestAnimationFrame(draw);
  }
  function refresh(){if(!frame) frame=requestAnimationFrame(draw);}
  function syncAnimation() {
    if (rotating && visible && !document.hidden && !renderer.getContext().isContextLost()) {
      globe.resumeAnimation();
    } else {
      globe.pauseAnimation();
    }
    previous = 0;
    refresh();
  }
  function playback(on) {
    rotating=on;
    syncAnimation();
    play.setAttribute('aria-label',on?'Приостановить вращение':'Включить вращение');
    play.title=play.getAttribute('aria-label');
    play.firstElementChild.textContent=on?'Ⅱ':'▶';
    refresh();
  }
  function resize(){
    const {width,height}=display.getBoundingClientRect();
    renderer.setSize(width,height,false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();refresh();
  }
  function tilt(delta){lat=THREE.MathUtils.clamp(lat+delta,-1.05,1.05);}
  canvas.addEventListener('pointerdown',e=>{
    if(pointer!==null || e.button!==0)return;
    pointer=e.pointerId;moving=false;startX=e.clientX;startY=e.clientY;
    canvas.setPointerCapture(pointer);
  });
  canvas.addEventListener('pointermove',e=>{
    if(e.pointerId!==pointer)return;
    const dx=e.clientX-startX, dy=e.clientY-startY;
    if(!moving && Math.abs(dx)+Math.abs(dy)<4)return;
    moving=true;lon+=dx*.009;tilt(dy*.0065);
    startX=e.clientX;startY=e.clientY;refresh();
  });
  function release(e){if(e.pointerId===pointer){pointer=null;previous=0;refresh();}}
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,release);
  canvas.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();
    if(e.key==='ArrowLeft')lon-=.18;
    if(e.key==='ArrowRight')lon+=.18;
    if(e.key==='ArrowUp')tilt(-.14);
    if(e.key==='ArrowDown')tilt(.14);
    refresh();
  });
  play.onclick=()=>playback(!rotating);
  motion.addEventListener('change',()=>playback(!motion.matches));
  new ResizeObserver(resize).observe(display);
  new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;syncAnimation();}).observe(display);
  document.addEventListener('visibilitychange',syncAnimation);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();globe.pauseAnimation();showPoster();});
  canvas.addEventListener('webglcontextrestored',()=>{showScene();syncAnimation();});
  function showScene(){canvas.hidden=false;canvas.tabIndex=0;caption.hidden=false;poster.hidden=true;}
  rig.rotation.set(lat,lon,0,'YXZ');
  resize();playback(rotating);renderer.render(scene,camera);showScene();
}
function showPoster(){poster.hidden=false;canvas.hidden=true;canvas.tabIndex=-1;caption.hidden=true;}
mountGlobe().catch(showPoster);
