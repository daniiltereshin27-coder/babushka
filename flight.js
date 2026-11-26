'use strict';

(() => {
  const layer = document.createElement('div');
  layer.className = 'desk-flight';
  layer.setAttribute('aria-hidden', 'true');

  // Wide phones can cross the layout breakpoint when rotated.
  const wideLayout = matchMedia('(min-width: 901px)');
  const landscapePhone = matchMedia('(pointer: coarse) and (orientation: landscape) and (max-height: 540px)');
  const useFlight = () => wideLayout.matches && !landscapePhone.matches;
  const variants = [];

  function prepareFlight() {
    if (!useFlight() || variants.length || reducedMotion.matches) return;
    for (const [index, at] of [1.5, 3.5, 5.5].entries()) {
      const video = document.createElement('video');
      video.defaultMuted = video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.disablePictureInPicture = true;
      video.hidden = true;
      video.src = `assets/desk-flight-${index + 1}.mp4?v=aligned`;
      layer.append(video);
      variants.push({at, video});
    }
    document.body.append(layer);
  }
  prepareFlight();
  wideLayout.addEventListener('change', prepareFlight);
  landscapePhone.addEventListener('change', prepareFlight);

  let cancelCurrent;
  let playingVideo;

  function hideFlightLayer() {
    layer.classList.remove('is-visible', 'is-moving');
    document.body.classList.remove('bx-has-flight');
  }

  window.playDeskFlight = () => {
    if (!useFlight() || reducedMotion.matches) return Promise.resolve(true);
    prepareFlight();
    const available = variants.filter(({video}) => !video.error);
    let immediateVariant;
    if (state === 'static') {
      immediateVariant = available[0];
    } else if (state === 'loop' && manualLoop) {
      const time = activeLoop.currentTime;
      immediateVariant = available.reduce((nearest, variant) => (
        !nearest || Math.abs(variant.at - time) < Math.abs(nearest.at - time) ? variant : nearest
      ), undefined);
    }
    if (!available.length || (state !== 'loop' && !immediateVariant)) return Promise.resolve(true);

    return new Promise(resolve => {
      let frame;
      let deadline;
      let flightTimer;
      let done = false;
      let selected;
      const button = document.querySelector('#exchange-button span');
      const label = button.textContent;
      button.textContent = 'Сейчас посчитаем…';
      document.body.classList.add('bx-desk-pending');

      function finish(openDesk, keepFrame = false) {
        if (done) return;
        done = true;
        cancelAnimationFrame(frame);
        clearTimeout(deadline);
        clearTimeout(flightTimer);
        reducedMotion.removeEventListener('change', onMotionChange);
        wideLayout.removeEventListener('change', onLayoutChange);
        landscapePhone.removeEventListener('change', onLayoutChange);
        if (selected) {
          selected.pause();
          selected.removeEventListener('ended', ended);
          selected.removeEventListener('error', failed);
        }
        button.textContent = label;
        document.body.classList.remove('bx-desk-pending', 'bx-camera-moving');
        cancelCurrent = undefined;
        if (!keepFrame) hideFlightLayer();
        if (!openDesk) {
          window.bxExchangeOpen = false;
          hero.inert = false;
          syncPlayback();
        }
        resolve(openDesk);
      }

      function ended() { finish(true, true); }
      function failed() { finish(true); }
      function onMotionChange(event) { if (event.matches) failed(); }

      function onLayoutChange() { if (!useFlight()) failed(); }

      async function start(variant) {
        clearTimeout(deadline);
        const video = selected = playingVideo = variant.video;
        window.bxExchangeOpen = true;
        hero.inert = true;
        syncPlayback();
        variants.forEach(item => { item.video.hidden = item !== variant; });

        try {
          video.currentTime = 0;
          video.addEventListener('ended', ended);
          video.addEventListener('error', failed);
          await playVideo(video);
          if (done) return;
          layer.classList.add('is-visible');
          document.body.classList.add('bx-has-flight', 'bx-camera-moving');
          frame = requestAnimationFrame(() => layer.classList.add('is-moving'));
          flightTimer = setTimeout(failed, 14000);
        } catch (_) {
          failed();
        }
      }

      function check() {
        if (state !== 'loop' || reducedMotion.matches) {
          failed();
          return;
        }
        if (!document.hidden && !blending) {
          const time = activeLoop.currentTime;
          const variant = variants.find(({at, video}) => video.readyState >= 1 && !video.error && time >= at - .018 && time < at + .09);
          if (variant) {
            start(variant);
            return;
          }
        }
        frame = requestAnimationFrame(check);
      }

      cancelCurrent = () => finish(false);
      reducedMotion.addEventListener('change', onMotionChange);
      wideLayout.addEventListener('change', onLayoutChange);
      landscapePhone.addEventListener('change', onLayoutChange);
      if (immediateVariant) {
        // Starting inside the CTA gesture also works when Safari blocks autoplay.
        start(immediateVariant);
      } else {
        deadline = setTimeout(failed, 7500);
        check();
      }
    });
  };

  window.hideDeskFlight = () => {
    cancelCurrent?.();
    variants.forEach(({video}) => video.pause());
    hideFlightLayer();
    document.body.classList.remove('bx-camera-moving', 'bx-desk-pending');
  };

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') cancelCurrent?.();
  });
  document.addEventListener('visibilitychange', () => {
    if (!playingVideo || !layer.classList.contains('is-visible') || playingVideo.ended) return;
    if (document.hidden) playingVideo.pause();
    else if (document.body.classList.contains('bx-camera-moving')) playingVideo.play().catch(() => {});
  });
})();
