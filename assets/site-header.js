'use strict';

// Sound is requested on every load; browsers may require a user gesture first.
const MUSIC_VOLUME = 0.45;
const music = document.querySelector('#background-music');
const soundButton = document.querySelector('.sound-toggle');
// Keep the original desktop position; mobile sound travels with the shared header.
const soundHome = document.createComment('sound-toggle desktop position');
soundButton.before(soundHome);
const telegramIcon = document.querySelector('.header-telegram');
const telegramHome = document.createComment('Telegram desktop position');
telegramIcon.before(telegramHome);
const mobileHeader = window.matchMedia('(max-width: 900px)');
function placeSoundButton() {
  if (mobileHeader.matches) {
    document.querySelector('.menu-toggle').before(soundButton, telegramIcon);
  } else {
    soundHome.after(soundButton);
    telegramHome.after(telegramIcon);
  }
}
placeSoundButton();
mobileHeader.addEventListener('change', placeSoundButton);
// Carry a manual mute between site pages. Reloading starts a fresh visit.
const muteKey = 'bx-site-muted';
function readMusicPreference() {
  try { return sessionStorage.getItem(muteKey) !== 'yes'; }
  catch { return true; }
}
try {
  if (performance.getEntriesByType('navigation')[0]?.type === 'reload') sessionStorage.removeItem(muteKey);
} catch { /* Session storage may be unavailable. */ }
let wantsMusic = readMusicPreference();
let musicPending = false;
let musicHasStarted = false;
// JS owns playback; the HTML autoplay attribute is retained for no-JS mode.
music.autoplay = false;
music.volume = MUSIC_VOLUME;
music.muted = false;
soundButton.hidden = false;

function updateSoundButton() {
  const playing = !music.paused && !music.muted;
  soundButton.dataset.sound = wantsMusic ? (playing ? 'playing' : 'waiting') : 'off';
  soundButton.setAttribute('aria-pressed', String(playing));
  soundButton.setAttribute('aria-label', music.error ? 'Музыка недоступна' : playing ? 'Выключить музыку' : 'Включить музыку');
  soundButton.disabled = Boolean(music.error);
}
function startMusic() {
  if (!wantsMusic || musicPending || document.hidden || music.error) return;
  musicPending = true;
  music.play().then(() => {
    if (!wantsMusic || document.hidden) music.pause();
  }).catch(() => {
    // Autoplay denial is expected; retry directly inside the next user gesture.
  }).finally(() => {
    musicPending = false;
    updateSoundButton();
  });
}
soundButton.addEventListener('click', () => {
  if (wantsMusic && musicHasStarted) {
    wantsMusic = false;
    music.pause();
  } else {
    wantsMusic = true;
    startMusic();
  }
  try {
    if (wantsMusic) sessionStorage.removeItem(muteKey);
    else sessionStorage.setItem(muteKey, 'yes');
  } catch { /* The current document still keeps the preference. */ }
  updateSoundButton();
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  wantsMusic = readMusicPreference();
  if (wantsMusic) startMusic(); else music.pause();
  updateSoundButton();
});
function unlockMusic(event) {
  if (event.target.closest?.('.sound-toggle') || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  if (wantsMusic && music.paused) startMusic();
}
document.addEventListener('click', unlockMusic);
document.addEventListener('keydown', unlockMusic);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) music.pause();
  else startMusic();
});
['playing', 'pause', 'error'].forEach(event => music.addEventListener(event, updateSoundButton));
music.addEventListener('playing', () => {
  musicHasStarted = true;
  if (!wantsMusic || document.hidden) music.pause();
});
updateSoundButton();
startMusic();

const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
function closeMenu() {
  navigation.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Открыть меню');
}
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  navigation.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
});
navigation.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menuButton.focus();
  }
});
document.addEventListener('click', event => { if (!event.target.closest('.header')) closeMenu(); });
mobileHeader.addEventListener('change', closeMenu);
document.documentElement.classList.add('js');
