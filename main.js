'use strict';

// Media times are in seconds. Startup and crossfade timeouts are in milliseconds.
const REVEAL_AT = 2.6;
const SWAP_BEFORE_END = 0.12;
const INTRO_TIMEOUT = 6500;
const VIDEO_TIMEOUT = 3500;
const LOOP_CROSSFADE_MS = 300;
// Optional desktop assets described in docs/README-before-migration.md.
const USE_OPTIMIZED_ASSETS = false;
const mobileVideo = mobileHeader.matches;

function sceneVideo(name) {
  return `assets/${mobileVideo ? 'mobile/' : ''}${name}.mp4`;
}

const hero = document.querySelector('.hero');
const intro = document.querySelector('#intro');
const loop = document.querySelector('#loop');
const loopNext = document.querySelector('#loop-next');
const videoRetry = document.querySelector('.video-retry');
const loopVideos = [loop, loopNext];
let activeLoop = loop;
let manualLoop = false;
let crossfadeEnabled = true;
let blending = false;
let blendTimer;
let loopFrame;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let state = 'loading';
let stallTimer;
let inView = true;
let swapping = false;
let run = 0;

function setState(next) {
  state = next;
  hero.dataset.state = next;
}
function reveal(instant = false) {
  if (instant) hero.classList.add('is-instant');
  if (hero.classList.contains('is-revealed')) return;
  hero.classList.add('is-revealed');
}
function clearTimers() {
  clearTimeout(stallTimer);
  clearTimeout(blendTimer);
  cancelAnimationFrame(loopFrame);
}
function updateVideoRetry() {
  videoRetry.hidden = state !== 'static' || reducedMotion.matches || !loop.hasAttribute('src') || Boolean(loop.error);
}
function staticScene() {
  run++;
  clearTimers();
  intro.pause();
  loopVideos.forEach(video => {
    video.pause();
    video.classList.remove('is-active', 'is-blending');
  });
  blending = false;
  hero.classList.remove('is-intro', 'is-loop');
  hero.classList.add('is-lit');
  setState('static');
  reveal(true);
  updateVideoRetry();
}

// Offscreen or transparent video layers can delay frame callbacks in WebKit.
function playVideo(video, timeout = VIDEO_TIMEOUT) {
  return new Promise((resolve, reject) => {
    let frame;
    let pending = true;
    const timer = setTimeout(() => finish(new Error('Video startup timed out')), timeout);

    function finish(error) {
      if (!pending) return;
      pending = false;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      if (error) reject(error);
      else resolve();
    }

    function waitForFrame() {
      if (!pending) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.paused && !video.seeking) finish();
      else frame = requestAnimationFrame(waitForFrame);
    }

    // Call play synchronously so a retry or CTA can use the current user gesture.
    video.play().then(waitForFrame, finish);
  });
}

async function startLoop(manual = false) {
  if (swapping || state === 'loop' || reducedMotion.matches) return;
  swapping = true;
  videoRetry.disabled = true;
  const currentRun = run;
  clearTimeout(stallTimer);
  try {
    if (loop.error) throw new Error('Loop unavailable');
    loop.currentTime = 0;
    await playVideo(loop);
    if (currentRun !== run) { loop.pause(); return; }
    activeLoop = loop;
    manualLoop = manual;
    if (manual) crossfadeEnabled = false;
    if (crossfadeEnabled && !loopNext.hasAttribute('src')) loopNext.src = loop.src;
    // No opacity transition: both layers retain their last decoded frame.
    hero.classList.add('is-loop', 'is-lit');
    loop.classList.add('is-active');
    loopNext.classList.remove('is-active');
    hero.classList.remove('is-intro');
    intro.pause();
    setState('loop');
    if (document.activeElement === videoRetry) document.querySelector('#exchange-button').focus({preventScroll: true});
    updateVideoRetry();
    reveal();
    syncPlayback();
  } catch (_) {
    if (currentRun === run) staticScene();
  } finally {
    videoRetry.disabled = false;
    swapping = false;
  }
}
videoRetry.addEventListener('click', () => startLoop(true));

// The supplied loop endpoints differ slightly. Keep the outgoing frame visible
// underneath the incoming video throughout a 300 ms dissolve.
function monitorLoop() {
  cancelAnimationFrame(loopFrame);
  if (!crossfadeEnabled || state !== 'loop' || document.hidden || !inView || window.bxExchangeOpen) return;
  if (!blending && activeLoop.duration - activeLoop.currentTime <= LOOP_CROSSFADE_MS / 1000 + 0.12) {
    blendLoop();
  }
  loopFrame = requestAnimationFrame(monitorLoop);
}
async function blendLoop() {
  if (blending) return;
  blending = true;
  const outgoing = activeLoop;
  const incoming = loopVideos.find(video => video !== outgoing);
  const currentRun = run;
  try {
    incoming.currentTime = 0;
    incoming.style.zIndex = '3';
    outgoing.style.zIndex = '2';
    incoming.classList.remove('is-active', 'is-blending');
    await playVideo(incoming);
    if (currentRun !== run) { incoming.pause(); return; }
    incoming.classList.add('is-blending');
    // Commit the zero-opacity starting frame before beginning the dissolve.
    void incoming.offsetWidth;
    incoming.classList.add('is-active');
    syncPlayback();
    blendTimer = setTimeout(() => {
      outgoing.classList.remove('is-active', 'is-blending');
      outgoing.pause();
      incoming.classList.remove('is-blending');
      activeLoop = incoming;
      blending = false;
      syncPlayback();
    }, LOOP_CROSSFADE_MS);
  } catch (_) {
    if (currentRun !== run) return;
    incoming.pause();
    incoming.classList.remove('is-active', 'is-blending');
    // Keep the outgoing video's native loop if the second player cannot start.
    crossfadeEnabled = false;
    blending = false;
    syncPlayback();
  }
}

async function startIntro() {
  const currentRun = run;
  try {
    await playVideo(intro, INTRO_TIMEOUT);
    if (currentRun !== run) { intro.pause(); return; }
    hero.classList.add('is-intro');
    setState('intro');
  } catch (_) {
    if (currentRun === run) staticScene();
  }
}

function syncPlayback() {
  if (state !== 'loop') return;
  if (document.hidden || !inView || reducedMotion.matches || window.bxExchangeOpen) {
    loopVideos.forEach(video => video.pause());
    cancelAnimationFrame(loopFrame);
  } else {
    const currentRun = run;
    if (activeLoop.paused) {
      activeLoop.play().catch(error => {
        if (currentRun === run && error.name !== 'AbortError') staticScene();
      });
    }
    if (blending) loopVideos.filter(video => video !== activeLoop && video.classList.contains('is-active') && video.paused)
      .forEach(video => video.play().catch(() => {}));
    monitorLoop();
  }
}

function onExchangeClick(event) {
  event.preventDefault();
  // Respect manual mute until reload, which resets wantsMusic to true.
  startMusic();
  updateSoundButton();
  window.openExchangeScene?.();
}
document.querySelector('#exchange-button').addEventListener('click', onExchangeClick);

document.addEventListener('visibilitychange', syncPlayback);
if ('IntersectionObserver' in window) {
  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting && entries[0].intersectionRatio > 0.001;
    syncPlayback();
  }, { threshold: [0, 0.001] }).observe(hero);
}
reducedMotion.addEventListener('change', event => {
  if (event.matches) staticScene();
  else if (!intro.hasAttribute('src')) {
    setState('loading');
    boot();
  } else updateVideoRetry();
});

intro.addEventListener('error', () => {
  if (state === 'loading' || state === 'intro') staticScene();
});
intro.addEventListener('timeupdate', () => {
  if (state !== 'intro') return;
  if (intro.currentTime >= REVEAL_AT) reveal();
  if (Number.isFinite(intro.duration) && intro.currentTime >= intro.duration - SWAP_BEFORE_END) startLoop();
});
intro.addEventListener('ended', () => { if (state === 'intro') startLoop(); });
intro.addEventListener('pause', () => {
  if (state === 'intro' && !swapping && !intro.ended) staticScene();
});
intro.addEventListener('waiting', () => {
  clearTimeout(stallTimer);
  if (state === 'intro' && !swapping) stallTimer = setTimeout(staticScene, VIDEO_TIMEOUT);
});
intro.addEventListener('playing', () => clearTimeout(stallTimer));
loopVideos.forEach(video => video.addEventListener('error', () => {
  if (state === 'loop' && video === activeLoop) staticScene();
  else if (state === 'static') updateVideoRetry();
}));

function boot() {
  window.bxReady = true;
  clearTimeout(window.bxBootGuard);
  if (reducedMotion.matches) { staticScene(); return; }
  for (const video of [intro, ...loopVideos]) video.muted = true;
  if (USE_OPTIMIZED_ASSETS) {
    document.querySelector('.poster--lit').src = 'assets/opt/scene-lit.webp';
  }
  if (USE_OPTIMIZED_ASSETS && !mobileVideo) {
    const width = window.innerWidth < 1280 || navigator.connection?.saveData ? 1280 : 1920;
    intro.src = `assets/opt/intro-${width}.mp4`;
    loop.src = `assets/opt/loop-${width}.mp4`;
  } else {
    intro.src = sceneVideo('intro');
    loop.src = sceneVideo('loop');
  }
  startIntro();
}
boot();
