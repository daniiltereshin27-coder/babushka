import {initKnitGlobe} from './globe.js';
export {initKnitGlobe};
const container=document.querySelector('[data-knit-globe]');
export const viewer=container ? initKnitGlobe(container) : null;
