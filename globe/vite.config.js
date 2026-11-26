import {defineConfig} from 'vite';
export default defineConfig({
  base:'./',
  build:{assetsInlineLimit:0,rolldownOptions:{
    input:{demo:'index.html',viewer:'site.js'},
    preserveEntrySignatures:'strict',
    output:{entryFileNames:'[name].js',chunkFileNames:'assets/[name]-[hash].js',assetFileNames:'assets/[name][extname]'}
  }}
});
