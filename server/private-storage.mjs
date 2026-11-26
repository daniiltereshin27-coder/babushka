import {chmodSync,closeSync,constants,existsSync,fchmodSync,fstatSync,linkSync,mkdirSync,openSync,readFileSync,unlinkSync,writeFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';

const privateDir=fileURLToPath(new URL('../.local',import.meta.url));
export function databasePath() {
  process.umask(0o077);
  const path=process.env.BX_DB || join(privateDir,'rules.sqlite');
  if(dirname(resolve(path))===resolve(privateDir)) {
    mkdirSync(privateDir,{mode:0o700,recursive:true});
    chmodSync(privateDir,0o700);
  }
  for(const suffix of ['', '-wal','-shm','-journal'])
    if(existsSync(path+suffix)) chmodSync(path+suffix,0o600);
  return path;
}

export function loadKey(db) {
  const path=resolve(process.env.BX_KEY_FILE || join(homedir(),'.config','babushka-exchange','requests.key'));
  const parent=dirname(path);
  if (!existsSync(path)) {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='request_key_check'").get())
      throw Error('Ключ заявок отсутствует. Восстановите исходный ключ перед запуском.');
    mkdirSync(parent,{mode:0o700,recursive:true});
    const temp=path+'.'+randomUUID();
    writeFileSync(temp,randomBytes(32),{flag:'wx',mode:0o600});
    try { linkSync(temp,path); } catch(error) { if(error.code!=='EEXIST') throw error; }
    finally { unlinkSync(temp); }
  }
  const fd=openSync(path,constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat=fstatSync(fd);
    if(!stat.isFile() || stat.uid!==process.getuid() || stat.size!==32) throw Error('Неверный файл ключа заявок.');
    fchmodSync(fd,0o600);
    return readFileSync(fd);
  } finally { closeSync(fd); }
}
