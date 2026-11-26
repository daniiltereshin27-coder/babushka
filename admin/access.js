'use strict';
let sessionPromise;
async function managerSession() {
  if(!sessionPromise) sessionPromise=fetch('/api/admin/session',{cache:'no-store'}).then(async response=>{
    if(response.status===401) location.replace('/admin/login'+location.hash);
    if(!response.ok) throw Error('Не удалось проверить вход.');
    return response.json();
  }).catch(error=>{sessionPromise=null;throw error;});
  return sessionPromise;
}
async function adminFetch(path,options={}) {
  const headers=new Headers(options.headers);
  if(options.method==='POST') headers.set('X-BX-CSRF',(await managerSession()).csrf);
  const response=await fetch(path,{...options,headers,cache:'no-store'});
  if(response.status===401) location.replace('/admin/login'+location.hash);
  return response;
}
document.getElementById('logout').onclick=async()=>{
  try {
    const response=await adminFetch('/api/admin/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if(!response.ok) throw Error();
    location.replace('/admin/login');
  } catch { document.getElementById('account-status').textContent='Выход не подтверждён. Попробуйте ещё раз.'; }
};
managerSession().then(s=>{document.getElementById('account-name').textContent=s.login;})
  .catch(()=>{document.getElementById('account-status').textContent='Не удалось проверить вход.';});
window.addEventListener('pageshow',event=>{ if(event.persisted) location.reload(); });

const labels={'manager.create':'Создан менеджер','manager.reset':'Изменён пароль','manager.remove':'Отозван доступ',
  'login.ok':'Вход','login.failed':'Неудачная попытка входа','login.limited':'Вход временно ограничен','logout':'Выход',
  'rules.created':'Создано правило','rules.updated':'Изменено правило','catalog.created':'Добавлена валюта','catalog.updated':'Изменена валюта',
  'pauses.paused':'Операция приостановлена','pauses.resumed':'Операция возобновлена',
  'access.denied':'Запрос без сессии','origin.denied':'Отклонён источник запроса','csrf.denied':'Отклонено подтверждение запроса',
  'locations.saved':'Добавлена локация','rules.rejected':'Правило отклонено','catalog.rejected':'Валюта отклонена',
  'pauses.rejected':'Изменение доступности отклонено','locations.rejected':'Локация отклонена'};
async function loadAudit() {
  const list=document.getElementById('audit-list');
  try {
    const response=await adminFetch('/api/admin/audit');
    if(!response.ok) throw Error();
    const entries=await response.json();
    list.replaceChildren(...entries.map(entry=>{
      const row=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('small');
      title.textContent=(labels[entry.event] || entry.event)+(entry.target?' · '+entry.target:'');
      detail.textContent=new Date(entry.at).toLocaleString('ru-RU')+' · '+(entry.actor || 'Неизвестный пользователь');
      row.append(title,detail);return row;
    }));
  } catch { list.textContent='Не удалось загрузить журнал.'; }
}
document.getElementById('audit-refresh').onclick=loadAudit;
