import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
const dist=new URL('../dist/',import.meta.url);
const dest=new URL('../../assets/about/knit/',import.meta.url);
await mkdir(dest,{recursive:true});
const manifest=new URL('.generated.json',dest);
let prior=[];
try {prior=JSON.parse(await readFile(manifest,'utf8'));} catch(error) {if(error.code!=='ENOENT') throw error;}
const {readdir}=await import('node:fs/promises');
const files=(await readdir(dist,{recursive:true,withFileTypes:true})).filter(dirent=>dirent.isFile());
const {relative,join}=await import('node:path');
const {fileURLToPath}=await import('node:url');
const current=files.map(f=>relative(fileURLToPath(dist),join(f.parentPath,f.name)));
await cp(dist,dest,{recursive:true});
for(const file of prior) if(!current.includes(file) && /^assets\/[\w.-]+$/.test(file)) await rm(new URL(file,dest),{force:true});
await writeFile(manifest,JSON.stringify(current));
