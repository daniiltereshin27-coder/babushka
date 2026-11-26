import {cities as defaultCities,arcs as defaultArcs} from './data/cities.js';

const preview = new URL('./assets/poster.webp',import.meta.url).href;
const fallback = new URL('./assets/globe-fallback.png',import.meta.url).href;

// The small entry and poster work before the WebGL renderer is requested.
export function initKnitGlobe(container, {
  cities=defaultCities, arcs=defaultArcs, autoRotate=true, onCityClick
}={}) {
  container.classList.add('knit-container');
  const mobile=matchMedia('(max-width: 767px)');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const cleanup=new AbortController();
  const opts={signal:cleanup.signal};
  let scene,started=false,visible=false,disposed=false,pendingCity,playing=true;
  const host=document.createElement('div');
  host.className='knit-stage';
  container.append(host);
  let poster=container.querySelector('.knit-poster');
  if(!poster) {
    poster=new Image();poster.className='knit-poster';poster.alt='Вязаный глобус Babushka Exchange';
    poster.src=preview;container.prepend(poster);
  }
  const label=document.createElement('span');
  label.className='knit-label';label.hidden=true;container.append(label);
  const caption=container.closest('figure')?.querySelector('figcaption');
  const button=caption?.querySelector('.play');
  function sync() {
    scene?.setState(visible&&!document.hidden,playing,reduced.matches,autoRotate);
    if(!button) return;
    const text=playing?'Приостановить вращение':'Продолжить вращение';
    button.title=text;button.setAttribute('aria-label',text);
    button.hidden=reduced.matches;
    button.firstElementChild.textContent=playing?'Ⅱ':'▶';
  }
  function showPoster() {
    poster.hidden=false;host.hidden=true;label.hidden=true;
    container.removeAttribute('tabindex');
    if(caption) caption.hidden=true;
  }
  function destroy() {
    if(disposed) return;
    disposed=true;observer.disconnect();cleanup.abort();scene?.destroy();
    showPoster();host.remove();label.remove();
  }
  function fail() {
    destroy();
    poster.src=fallback;
  }
  async function start() {
    try {
      const {createScene}=await import('./scene.js');
      if(disposed) return;
      scene=createScene(host,{cities,arcs,mobile,label,onCityClick,
        ready() {
          if(disposed) return;
          host.hidden=false;poster.hidden=true;container.tabIndex=0;
          if(caption) caption.hidden=false;
          sync();
          if(pendingCity) {scene.focusCity(pendingCity);pendingCity=null;}
        },
        failed:fail
      });
      sync();
    } catch { fail(); }
  }
  const observer=new IntersectionObserver(([entry])=>{
    visible=entry.isIntersecting;
    if(visible && !started) {started=true;void start();}
    sync();
  });
  observer.observe(container);
  reduced.addEventListener('change',sync,opts);
  document.addEventListener('visibilitychange',sync,opts);
  button?.addEventListener('click',()=>{playing=!playing;sync();},opts);
  container.addEventListener('keydown',event=>{
    if(scene && ['ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(event.key)) {
      event.preventDefault();scene.turn(event.key);
    }
  },opts);
  return {
    focusCity(name) {
      const city=cities.find(c=>c.name===name);
      if(!city || disposed) return false;
      if(scene && poster.hidden) scene.focusCity(city); else pendingCity=city;
      return true;
    },
    destroy
  };
}
