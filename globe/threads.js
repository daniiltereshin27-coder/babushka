import {Curve, Vector3, TubeGeometry, Mesh, MeshStandardMaterial, TextureLoader, RepeatWrapping, SRGBColorSpace} from 'three';

const GROW = 1800;
const HOLD = 2000;
const LIFE = GROW * 2 + HOLD;
const SEGMENTS = 96;
const SIDES = 8;
const ease = t => t*t*(3-2*t);

class AirRoute extends Curve {
  constructor(a,b,radius,alt) {
    super();
    this.a = a.normalize();
    this.b = b.normalize();
    this.angle = this.a.angleTo(this.b);
    this.radius = radius;
    this.alt = alt ?? Math.min(.4,.1+this.angle*.12);
    this.tangent = this.b.clone().addScaledVector(this.a,-this.a.dot(this.b));
    if (this.tangent.lengthSq()<1e-10) {
      this.tangent.crossVectors(this.a, Math.abs(this.a.y)<.9 ? new Vector3(0,1,0) : new Vector3(1,0,0));
    }
    this.tangent.normalize();
  }
  getPoint(t,target = new Vector3()) {
    return target.copy(this.a).multiplyScalar(Math.cos(t*this.angle))
      .addScaledVector(this.tangent,Math.sin(t*this.angle))
      .multiplyScalar(this.radius*(1.007+this.alt*Math.sin(Math.PI*t)));
  }
}

export function makeThreads(globe,cities,arcs) {
  const radius = globe.getGlobeRadius();
  const strand = new TextureLoader().load(new URL('./assets/strand.webp',import.meta.url).href);
  strand.colorSpace = SRGBColorSpace;
  strand.wrapS = RepeatWrapping;
  const material = new MeshStandardMaterial({map:strand,color:0xf5b400,emissive:0x3a2600,roughness:.92});
  const cityByName = new Map(cities.map(city => [city.name,city]));
  const vector = city => new Vector3().copy(globe.getCoords(city.lat,city.lng));
  function route(start,end,alt,order) {
    const curve = new AirRoute(vector(start),vector(end),radius,alt);
    const geometry = new TubeGeometry(curve,SEGMENTS,radius*.0035,SIDES,false);
    const uv = geometry.attributes.uv;
    const repeats = curve.getLength()/(radius*.17);
    for (let i=0;i<uv.count;i++) uv.setX(i,uv.getX(i)*repeats);
    const mesh = new Mesh(geometry,material);
    mesh.visible = false;
    globe.scene().add(mesh);
    return {start,end,order,mesh,begin:0,arrived:false};
  }
  const routes = arcs.filter(a => a.start!==a.end && cityByName.has(a.start) && cityByName.has(a.end))
    .sort((a,b)=>a.order-b.order).map((a,i)=>route(cityByName.get(a.start),cityByName.get(a.end),a.alt,i));
  let clock = 0, next = 0, index = 0, focused;
  let active = [], rings = [];
  function enqueue(r,limit,priority=false) {
    if (active.length>=limit && !priority) return;
    active = active.filter(item=>item!==r);
    if(active.length>=limit) active.shift().mesh.visible=false;
    r.begin=clock; r.arrived=false;
    active.push(r);
  }
  function clearFocused() {
    if (!focused) return;
    active=active.filter(r=>r!==focused);
    focused.mesh.removeFromParent();
    focused.mesh.geometry.dispose();
    focused=null;
  }
  return {
    focus(city,mobile) {
      const moscow=cityByName.get('Москва');
      clearFocused();
      if (moscow && city!==moscow) {
        focused=route(moscow,city,undefined,-1);
        enqueue(focused,mobile?5:Infinity,true);
      }
    },
    clear() {
      active.forEach(r=>{r.mesh.visible=false;});
      active=[]; rings=[]; globe.ringsData([]);
    },
    tick(dt,mobile) {
      clock+=dt;
      const limit=mobile?5:Infinity;
      while(active.length>limit) active.shift().mesh.visible=false;
      active=active.filter(r=>{
        if(clock-r.begin<LIFE) return true;
        r.mesh.visible=false;return false;
      });
      if(routes.length && clock>=next && active.length<limit) {
        enqueue(routes[index],limit);
        index=(index+1)%routes.length;
        next=clock+600;
      }
      const live=rings.filter(r=>r.until>clock);
      let changed=live.length!==rings.length;
      rings=live;
      for(const r of active) {
        const age=clock-r.begin;
        const end=Math.round(SEGMENTS*ease(Math.min(1,age/GROW)));
        const start=Math.round(SEGMENTS*ease(Math.max(0,(age-GROW-HOLD)/GROW)));
        r.mesh.visible=end>start;
        r.mesh.geometry.setDrawRange(start*SIDES*6,(end-start)*SIDES*6);
        if(!r.arrived && age>=GROW) {
          rings.push({...r.end,until:clock+2800});
          r.arrived=true;changed=true;
        }
      }
      if(changed) globe.ringsData(rings);
    },
    dispose() {
      clearFocused();
      for(const r of routes) {r.mesh.removeFromParent(); r.mesh.geometry.dispose();}
      material.dispose(); strand.dispose();
    }
  };
}
