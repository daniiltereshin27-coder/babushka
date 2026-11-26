import {DatabaseSync} from 'node:sqlite';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {databasePath} from './private-storage.mjs';
import {configureManager,initSecurity} from './security.mjs';

if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error('Запустите настройку в интерактивном терминале.');
const db=new DatabaseSync(databasePath());
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
initSecurity(db);
let muted=false;
const output=new Writable({write(data,encoding,done) {
  if(!muted) process.stdout.write(data,encoding);
  done();
}});
const terminal=createInterface({input:process.stdin,output,terminal:true,historySize:0});
async function secret(prompt) {
  process.stdout.write(prompt);
  muted=true;
  try { return await terminal.question(''); }
  finally { muted=false;process.stdout.write('\n'); }
}
try {
  const hasManagers=db.prepare('SELECT 1 FROM managers LIMIT 1').get();
  let action='create';
  if(hasManagers) {
    const choice=await terminal.question('1 — Добавить менеджера, 2 — Сменить пароль, 3 — Отключить доступ\nВыберите действие: ');
    action={'1':'create','2':'reset','3':'remove'}[choice.trim()];
    if(!action) throw Error('Неизвестное действие.');
  }
  const login=await terminal.question('Логин менеджера: ');
  let password;
  if(action==='remove') {
    if(await terminal.question('Для подтверждения повторите логин: ')!==login) throw Error('Логин не совпал.');
  } else {
    password=await secret('Новый пароль (от 15 символов, ввод скрыт): ');
    if(password!==await secret('Повторите пароль: ')) throw Error('Пароли не совпали.');
  }
  await configureManager(db,action,login,password);
  console.log(action==='remove'?'Доступ отключён.':'Доступ настроен. Откройте '+(process.env.BX_ORIGIN || 'http://127.0.0.1:'+(process.env.PORT || '8080'))+'/admin/');
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {terminal.close();db.close();}
