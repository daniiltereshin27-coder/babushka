import Globe from 'globe.gl';
import {
  AmbientLight, DirectionalLight, Group, Mesh, SphereGeometry, CylinderGeometry,
  MeshStandardMaterial, MeshPhongMaterial, MeshBasicMaterial, Vector3, LinearToneMapping, RepeatWrapping
} from 'three';
import {makeThreads} from './threads.js';

const maps=[
  [new URL('./assets/knit-color.webp',import.meta.url).href,new URL('./assets/knit-bump.webp',import.meta.url).href],
  [new URL('./assets/knit-color-m.webp',import.meta.url).href,new URL('./assets/knit-bump-m.webp',import.meta.url).href]
];

export function createScene(host,{cities,arcs,mobile,label,onCityClick,ready,failed}) {
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('webgl2',{alpha:true,antialias:true});
  if(!context) throw new Error('WebGL 2 unavailable');
  const globe=new Globe(host,{animateIn:false,rendererConfig:{canvas,context,alpha:true,antialias:true}});
  const renderer=globe.renderer();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.toneMapping=LinearToneMapping;
  renderer.toneMappingExposure=1.9;
  const controls=globe.controls();
  controls.enableZoom=false;
  controls.autoRotateSpeed=.4;
  const limits=()=>{controls.minPolarAngle=Math.PI/3;controls.maxPolarAngle=2*Math.PI/3;};
  const input=new AbortController();
  // A directed view may center a city north of the handheld orbit's latitude limit.
  function aim(lat,lng,duration) {
    controls.minPolarAngle=0;controls.maxPolarAngle=Math.PI;
    globe.pointOfView({lat,lng,altitude:2.2},duration);
  }
  let active=false,animating=false,spinning=false,reduced=false,frame=0,previous=0,age=0,dead=false;
  let selected,hovered,until=0;
  const pins=new Map();
  const amber=new MeshStandardMaterial({color:0xffc745,metalness:.6,roughness:.3,emissive:0x664000});
  const silver=new MeshStandardMaterial({color:0xe0e4eb,metalness:.42,roughness:.32});
  const hot=amber.clone();
  hot.emissive.setHex(0xdd8200);
  const hit=new MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false});
  const radius=globe.getGlobeRadius();
  const shaft=new CylinderGeometry(radius*.0014,radius*.0011,radius*.049,8);
  const pearl=new SphereGeometry(radius*.006,16,12);
  const target=new SphereGeometry(radius*.022,10,8);
  function pin(city) {
    const pinGroup=new Group(), slant=new Group();
    slant.rotation.y=.24;
    const rod=new Mesh(shaft,silver);
    rod.rotation.x=Math.PI/2;rod.position.z=radius*.024;
    const bead=new Mesh(pearl,amber);
    bead.position.z=radius*.049;
    const catchment=new Mesh(target,hit);
    catchment.position.z=bead.position.z;
    slant.add(rod,bead,catchment);pinGroup.add(slant);pins.set(city.name,bead);
    return pinGroup;
  }
  const key=new DirectionalLight(0xffe2b0,.9);
  key.position.set(1,1.4,1.8);
  const rim=new DirectionalLight(0x6e8bff,.3);
  rim.position.set(-2,.3,-.4);
  const wool=new MeshPhongMaterial({shininess:4,specular:0x171623,bumpScale:.16});
  globe.globeMaterial(wool);
  globe.backgroundColor('rgba(0,0,0,0)').globeCurvatureResolution(2)
    .atmosphereColor('#F5B400').atmosphereAltitude(.12)
    .lights([new AmbientLight(0xfff1dc,.6),key,rim])
    .objectThreeObject(pin).objectFacesSurface(true).objectsData(cities.map(city=>({...city})))
    .enablePointerInteraction(false)
    .ringColor(()=>t=>'rgba(255,196,44,'+(1-t)+')')
    .ringMaxRadius(3).ringAltitude(.011).ringPropagationSpeed(2).ringRepeatPeriod(1500);
  globe.onGlobeReady(()=>{if(!dead) ready();});
  function quality() {
    const [color,bump]=maps[Number(mobile.matches)];
    globe.showAtmosphere(!mobile.matches).globeImageUrl(color).bumpImageUrl(bump);
  }
  quality();
  mobile.addEventListener('change',quality);
  const threads=makeThreads(globe,cities,arcs);
  const size=()=>{
    const {width,height}=host.getBoundingClientRect();
    if(width && height) {
      globe.width(Math.round(width)).height(Math.round(height));
      // Fit an entire round ball with a small margin on widescreen and portrait layouts.
      globe.camera().fov=43;
      globe.camera().updateProjectionMatrix();
    }
  };
  const resize=new ResizeObserver(size);resize.observe(host);size();
  aim(45,40,0);
  renderer.domElement.style.touchAction='pan-y';
  const lost=event=>{event.preventDefault();failed();};
  renderer.domElement.addEventListener('webglcontextlost',lost);
  function focusCity(city) {
    selected=city;until=age+6000;
    aim(city.lat,city.lng,reduced?0:1200);
    if(!reduced) threads.focus(city,mobile.matches);
  }
  const surface=new Vector3(),look=new Vector3();
  const keyDirection=new Vector3(1,1.4,1.8),rimDirection=new Vector3(-2,.3,-.4);
  const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  function filterMap(map) {
    if(map && map.wrapS!==RepeatWrapping) {
      map.wrapS=RepeatWrapping;map.anisotropy=anisotropy;map.needsUpdate=true;
    }
  }
  // Screen-space picking gives a small bead a comfortable touch target. It also
  // handles a first tap on devices that never send a preceding mouse hover.
  function cityAt(event) {
    const box=renderer.domElement.getBoundingClientRect();
    const x=event.clientX-box.left,y=event.clientY-box.top;
    let nearest=null,distance=event.pointerType==='touch'?20:10;
    for(const city of cities) {
      surface.copy(globe.getCoords(city.lat,city.lng,.049));
      if(look.copy(globe.camera().position).sub(surface).dot(surface)<=0) continue;
      const point=globe.getScreenCoords(city.lat,city.lng,.049);
      const delta=Math.hypot(point.x-x,point.y-y);
      if(delta<distance) {nearest=city;distance=delta;}
    }
    return nearest;
  }
  const events={signal:input.signal,capture:true};
  const canvasNode=renderer.domElement;
  let down=null,dragged=false;
  canvasNode.addEventListener('pointerdown',event=>{
    down={x:event.clientX,y:event.clientY};dragged=false;
  },events);
  canvasNode.addEventListener('pointermove',event=>{
    if(down && Math.hypot(event.clientX-down.x,event.clientY-down.y)>5) {
      dragged=true;hovered=null;selected=null;limits();
    } else if(!down && event.pointerType==='mouse') hovered=cityAt(event);
  },events);
  canvasNode.addEventListener('pointerleave',()=>{hovered=null;},events);
  canvasNode.addEventListener('pointercancel',()=>{down=null;hovered=null;},events);
  canvasNode.addEventListener('pointerup',event=>{
    const tap=down && !dragged && Math.hypot(event.clientX-down.x,event.clientY-down.y)<=5;
    down=null;
    if(!tap) return;
    const city=cityAt(event);
    if(city) {focusCity(city);onCityClick?.(city);}
    else {selected=null;hovered=null;}
  },events);
  function tick(time) {
    if(!active || dead) return;
    key.position.copy(keyDirection).applyQuaternion(globe.camera().quaternion);
    rim.position.copy(rimDirection).applyQuaternion(globe.camera().quaternion);
    filterMap(wool.map);filterMap(wool.bumpMap);
    const dt=previous?Math.min(100,time-previous):0;
    previous=time;age+=dt;
    if(animating) threads.tick(dt,mobile.matches);
    if(selected && age>until) selected=null;
    const city=hovered||selected;
    for(const [name,bead] of pins) {
      bead.material=name===city?.name?hot:amber;bead.scale.setScalar(name===city?.name?1.6:1);
    }
    controls.autoRotate=spinning && !city;
    label.hidden=true;
    if(city) {
      surface.copy(globe.getCoords(city.lat,city.lng,.05));
      if(look.copy(globe.camera().position).sub(surface).dot(surface)>0) {
        const {x,y}=globe.getScreenCoords(city.lat,city.lng,.055);
        label.textContent=city.name;
        label.style.left=x+'px';label.style.top=y+'px';label.hidden=false;
      }
    }
    frame=requestAnimationFrame(tick);
  }
  return {
    focusCity,
    turn(key) {
      const {lat,lng}=globe.pointOfView();
      const step=9;
      aim(Math.min(30,Math.max(-30,lat+(key==='ArrowUp'?step:key==='ArrowDown'?-step:0))),
        lng+(key==='ArrowRight'?step:key==='ArrowLeft'?-step:0),reduced?0:180);
    },
    setState(visible,playing,reduce,autoRotate=true) {
      if(reduce && !reduced) threads.clear();
      reduced=reduce;animating=playing&&!reduced;spinning=animating&&autoRotate;controls.autoRotate=spinning;
      if(visible===active && visible) return;
      active=visible;
      if(active) {globe.resumeAnimation();previous=0;frame=requestAnimationFrame(tick);}
      else {cancelAnimationFrame(frame);globe.pauseAnimation();}
    },
    destroy() {
      dead=true;active=false;cancelAnimationFrame(frame);resize.disconnect();
      mobile.removeEventListener('change',quality);input.abort();
      renderer.domElement.removeEventListener('webglcontextlost',lost);
      threads.dispose();
      globe._destructor();

      wool.map?.dispose();wool.bumpMap?.dispose();
      [shaft,pearl,target,amber,hot,silver,hit,wool].forEach(item=>item.dispose());

    }
  };
}
