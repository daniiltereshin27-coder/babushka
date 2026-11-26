'use strict';
const form=document.getElementById('login-form');
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button');
  if(button.disabled) return;
  button.disabled=true;
  const error=document.getElementById('login-error');
  error.textContent='';
  try {
    const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({login:form.elements.login.value,password:form.elements.password.value})});
    form.elements.password.value='';
    if(response.ok) location.replace('/admin/'+location.hash);
    else { error.textContent=(await response.json()).error; form.elements.password.focus(); }
  } catch { error.textContent='Сервер недоступен. Повторите попытку.'; }
  finally { button.disabled=false; }
});
