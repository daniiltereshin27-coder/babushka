'use strict';
(() => {
  const $=selector=>document.querySelector(selector);
  const section=$('#exchange'),heroSection=$('.hero'),sharedHeader=heroSection.querySelector('.header');
  const headerHome=sharedHeader.parentElement,headerSlot=$('.desk__header-slot');
  const form=$('#exchange-form'),from=$('#send-currency'),to=$('#receive-currency');
  const amount=$('#send-amount'),result=$('#receive-amount'),method=$('#receive-method'),city=$('#receive-city');
  const dialog=$('#quote-dialog'),cityDialog=$('#city-dialog'),error=$('#amount-error');
  const submit=form.querySelector('[type=submit]');
  let {currencies,sendOrder,receiveOrder}=window.BXCatalog;
  const iconFor = key => currencies[key].icon || 'assets/currencies/atelier/'+key+'.webp';
  const category=c=>!c?'':c.crypto?'crypto':c.kind?'cashless':'cash';
  for(const select of [from,to])for(const key of (select===from?sendOrder:receiveOrder))select.add(new Option(currencies[key].label,key));
  from.value=sendOrder.includes('USDT_TRC20') ? 'USDT_TRC20' : sendOrder[0];
  to.value=receiveOrder.includes('USD') ? 'USD' : receiveOrder[0];
  let editedSide='send',lastQuote,deadline=Date.now()+60000,refreshCount=0;
  const fmt=(n,d=2)=>n.toLocaleString('ru-RU',{minimumFractionDigits:Math.min(d,2),maximumFractionDigits:d});
  const compactCurrencies=matchMedia('(max-width:1100px)');
  const sliders={};
  function syncCurrencyOptions(side,preferred){
    const select=side==='send'?from:to;
    const filter=$('#'+side+'-type').value;
    const order=side==='send'?sendOrder:receiveOrder;
    const keys=order.filter(key=>filter==='all'||filter===category(currencies[key]));
    const selected=preferred??select.value;
    if(select.dataset.filter!==filter){
      select.replaceChildren(...keys.map(key=>new Option(currencies[key].label,key)));
      select.dataset.filter=filter;
    }
    select.value=keys.includes(selected)?selected:keys[0];
    return keys;
  }
  const mobileCalculator = matchMedia('(max-width: 900px)');
  const picker = $('#currency-picker');
  const pickerFilter = $('#picker-type');
  const optionsList = picker.querySelector('.currency-options');
  let pickerSide;
  pickerFilter.replaceChildren(...Array.from($('#send-type').options, option => option.cloneNode(true)));

  function renderPickerList() {
    const order = pickerSide === 'send' ? sendOrder : receiveOrder;
    const selected = $('#' + pickerSide + '-currency').value;
    const buttons = order.filter(key =>
      pickerFilter.value === 'all' || category(currencies[key]) === pickerFilter.value
    ).map(key => {
      const option = document.createElement('button');
      option.type = 'button';
      option.dataset.key = key;
      option.setAttribute('aria-pressed', String(key === selected));
      const icon = new Image(36, 36);
      icon.alt = '';
      icon.src = iconFor(key);
      icon.loading = 'lazy';
      option.append(icon, currencies[key].label);
      return option;
    });
    optionsList.replaceChildren(...buttons);
    optionsList.scrollTop = 0;
  }

  for (const side of ['send', 'receive']) {
    $('#' + side + '-picker').onclick = () => {
      pickerSide = side;
      $('#currency-picker-title').textContent = side === 'send' ? 'Валюта отдачи' : 'Валюта получения';
      pickerFilter.value = $('#' + side + '-type').value;
      renderPickerList();
      picker.showModal();
    };
  }
  pickerFilter.onchange = renderPickerList;
  optionsList.onclick = event => {
    const option = event.target.closest('button[data-key]');
    if (!option) return;
    $('#' + pickerSide + '-type').value = pickerFilter.value;
    syncCurrencyOptions(pickerSide, option.dataset.key);
    update();
    resetCountdown();
    picker.close();
  };
  picker.querySelector('.bx-modal__close').onclick = () => picker.close();

  const quoteNote = $('#quote-note');
  function placeQuote() {
    if (mobileCalculator.matches) $('.desk__columns').after(quoteNote);
    else $('#send-network').after(quoteNote);
  }
  placeQuote();
  mobileCalculator.addEventListener('change', () => {
    if (picker.open) picker.close();
    placeQuote();
    renderChoices();
    if (!mobileCalculator.matches) {
      revealSelection('send');
      revealSelection('receive');
    }
  });

  function renderChoices(){
    for(const [side,select,order] of [['send',from,sendOrder],['receive',to,receiveOrder]]){
      const filter=document.querySelector('#'+side+'-type').value;
      const grid=document.querySelector('#'+side+'-choices');
      const keys=syncCurrencyOptions(side);
      if (mobileCalculator.matches) {
        const trigger = $('#' + side + '-picker');
        const key = select.value;
        trigger.disabled = !order.length;
        if (!key) {
          trigger.querySelector('span').textContent = 'Нет валют';
          trigger.querySelector('img').removeAttribute('src');
          delete trigger.dataset.key;
          continue;
        }
        if (trigger.dataset.key !== key) {
          const currency = currencies[key];
          trigger.dataset.key = key;
          trigger.querySelector('img').src = iconFor(key);
          trigger.querySelector('span').textContent = currency.kind || currency.crypto && currency.label.includes(' · ')
            ? currency.label.replace(' · ', ' ') : currency.symbol;
          trigger.setAttribute('aria-label', select.getAttribute('aria-label') + ': ' + currency.label);
        }
        continue;
      }
      const size=compactCurrencies.matches?6:10, signature=filter+':'+size;
      if(grid.dataset.signature!==signature){
        grid.dataset.signature=signature;grid.replaceChildren();
        const track=document.createElement('div');track.className='desk__currency-track';
        const pages=[];
        for(let offset=0;offset<keys.length;offset+=size){
          const page=document.createElement('div');page.className='desk__currency-page';
          for(const key of keys.slice(offset,offset+size)){
            const c=currencies[key],button=document.createElement('button');button.type='button';button.className='desk__currency';button.dataset.key=key;
            button.setAttribute('aria-label',c.label);
            const icon=document.createElement('span');
            icon.className='desk__coin desk__coin--atelier is-'+category(c);
            const img=document.createElement('img');
            img.src=iconFor(key);
            img.alt='';img.width=96;img.height=96;img.decoding='async';
            icon.append(img);
            const label=document.createElement('span');label.textContent=c.crypto||c.kind?c.label:c.symbol;
            button.append(icon,label);button.addEventListener('click',()=>{select.value=key;update();resetCountdown();});page.append(button);
          }
          pages.push(page);track.append(page);
        }
        const controls=document.createElement('div');controls.className='desk__slider-controls';
        const prev=document.createElement('button'),next=document.createElement('button'),status=document.createElement('span');
        prev.type=next.type='button';prev.textContent='‹';next.textContent='›';
        prev.setAttribute('aria-label','Предыдущие валюты: '+(side==='send'?'отдаёте':'получаете'));
        next.setAttribute('aria-label','Следующие валюты: '+(side==='send'?'отдаёте':'получаете'));
        status.setAttribute('aria-live','polite');
        const sync=()=>{const index=Math.round(track.scrollLeft/(track.clientWidth||1));prev.disabled=index===0;next.disabled=index>=pages.length-1;status.textContent=pages.length ? (index+1)+' / '+pages.length : '';};
        const move=direction=>track.scrollBy({left:direction*track.clientWidth,behavior:reducedMotion.matches?'instant':'smooth'});
        prev.onclick=()=>move(-1);next.onclick=()=>move(1);track.addEventListener('scroll',sync,{passive:true});
        controls.append(prev,status,next);grid.append(track,controls);sync();
        sliders[side]={track,sync};
      }
      for(const button of grid.querySelectorAll('.desk__currency'))button.setAttribute('aria-pressed',String(button.dataset.key===select.value));
    }
  }
  ['send','receive'].forEach(side=>document.querySelector('#'+side+'-type').addEventListener('change',()=>{update();resetCountdown();revealSelection(side);}));
  compactCurrencies.addEventListener('change',renderChoices);

  let quoteVersion=0;
  let previousPair='';
  async function serverQuote(){
    const version=++quoteVersion;
    const src=from.value,dst=to.value;
    const pair=src+'>'+dst;
    const cashFrom=category(currencies[src])==='cash';
    const cashTo=category(currencies[dst])==='cash';
    const field=editedSide==='send'?amount:result;
    const other=editedSide==='send'?result:amount;
    submit.disabled=true;
    $('#exchange-rate').textContent='…';
    other.value='';
    error.textContent='';
    try {
      const params=new URLSearchParams({src,dst,city:cashTo?city.value:cashFrom?$('#send-city').value:'',
        side:editedSide,value:field.value,chooseCity:pair!==previousPair?'1':'0'});
      const response=await fetch('/api/quote?'+params,{cache:'no-store'});
      if(!response.ok)throw Error();
      const q=await response.json();
      if(version!==quoteVersion)return false;
      previousPair=pair;
      cities=q.cities;
      if(q.city){if(cashFrom)setCity('send',q.city);if(cashTo)setCity('receive',q.city);}
      for(const b of section.querySelectorAll('[data-city-target][data-city]'))
        b.hidden=!cities.some(name=>name.startsWith(b.dataset.city+','));
      if(cityDialog.open)renderCities();
      $('#exchange-rate').textContent=q.rate?'1 '+currencies[src].symbol+' = '+fmt(q.rate,8)+' '+currencies[dst].symbol:'—';
      if(Number.isFinite(q.send))other.value=editedSide==='send'?fmt(q.receive,currencies[dst].digits):fmt(q.send,currencies[src].digits);
      error.textContent=q.error||'';
      submit.disabled=Boolean(q.error);
      field.setAttribute('aria-invalid',String(Boolean(q.error)));
      other.setAttribute('aria-invalid','false');
      lastQuote={...q,from:src,to:dst,side:editedSide,value:field.value};
      if (dialog.open && requestMode === 'exchange' && !submitting && $('#request-success').hidden) {
        if (requestSnapshot.from !== src || requestSnapshot.to !== dst || requestSnapshot.city !== q.city)
          requestAvailability('Направление изменилось. Вернитесь к расчёту.');
        else if (q.error) requestAvailability(q.error);
        else updateRequestQuote(q);
      }
      return !q.error;
    }catch{
      if(version===quoteVersion){
        error.textContent='Сервер расчёта недоступен. Попробуйте ещё раз.';
        $('#exchange-rate').textContent='—';lastQuote=null;
        if(dialog.open && requestMode==='exchange' && !submitting && $('#request-success').hidden) requestAvailability(error.textContent);
      }
      return false;
    }
  }
  function update(){
    renderChoices();
    const a=currencies[from.value],b=currencies[to.value];

    $('.desk__swap').disabled = !sendOrder.includes(to.value) || !receiveOrder.includes(from.value);
    if (!a || !b) {
      ++quoteVersion;
      lastQuote = null;
      submit.disabled = true;
      $('#send-network').textContent = a?.network || '';
      $('#receive-network').textContent = b?.network || '';
      $('#exchange-rate').textContent = '—';
      $('#delivery-fields').hidden = !b || category(b)!=='cash';
      $('#send-location').hidden = !a || category(a)!=='cash';
      (editedSide === 'send' ? result : amount).value = '';
      error.textContent = 'В выбранной категории пока нет доступных валют.';
      if (dialog.open && requestMode === 'exchange' && !submitting) requestAvailability(error.textContent);
      return false;
    }
    $('#send-network').textContent=a.network;$('#receive-network').textContent=b.network;
    $('#delivery-fields').hidden=category(b)!=='cash';$('#send-location').hidden=category(a)!=='cash';
    method.value=b.kind?'bank':'cash';
    if(window.BXServer)return serverQuote();
    const quote=BXCalc.calculate({from:a,to:b,value:editedSide==='send'?amount.value:result.value,side:editedSide});
    const message=!quote.valid?'Введите сумму больше нуля.':from.value===to.value?'Выберите разные направления обмена.':quote.usd<100-1e-7?`Минимальная сумма — ${fmt(100/a.usd,a.digits)} ${a.symbol}.`:quote.usd>1000000+1e-7?`Максимальная сумма — ${fmt(1000000/a.usd,a.digits)} ${a.symbol}.`:'';
    error.textContent=message;submit.disabled=Boolean(message);
    amount.setAttribute('aria-invalid',String(Boolean(message)&&editedSide==='send'));
    result.setAttribute('aria-invalid',String(Boolean(message)&&editedSide==='receive'));
    if(editedSide==='send')result.value=quote.valid?fmt(quote.receive,b.digits):'';
    else amount.value=quote.valid?fmt(quote.send,a.digits):'';
    $('#exchange-rate').textContent=`1 ${a.symbol} = ${fmt(quote.rate,8)} ${b.symbol}`;
    lastQuote={...quote,from:from.value,to:to.value,sendCity:$('#send-city').value,receiveCity:city.value};
    return !message;
  }
  function resetCountdown(){deadline=Date.now()+60000;$('#rate-status').textContent='Обновление каждые 60 секунд';paintCountdown();}
  function paintCountdown(){
    const seconds=BXCalc.secondsLeft(deadline);
    $('#rate-countdown').textContent=seconds;
    $('.desk__timer').style.setProperty('--remaining',seconds/60);
    $('.desk__timer').setAttribute('aria-label',`Обновление расчёта через ${seconds} секунд`);
  }
  function tick(){
    if(!window.bxExchangeOpen)return;
    if(Date.now()>=deadline){update();deadline=Date.now()+60000;refreshCount++;$('#rate-status').textContent='Расчёт обновлён';$('#rate-status').dataset.refreshCount=refreshCount;}
    paintCountdown();
  }
  setInterval(tick,250);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
  amount.addEventListener('input',()=>{editedSide='send';update();});
  result.addEventListener('input',()=>{editedSide='receive';update();});
  [from,to].forEach(select=>select.addEventListener('change',()=>{update();resetCountdown();revealSelection(select===from?'send':'receive');}));
  function revealSelection(side){const selected=$(`#${side}-choices [aria-pressed=true]`);if(selected){const page=selected.parentElement;const track=page.parentElement;track.scrollTo({left:page.offsetLeft-track.firstElementChild.offsetLeft,behavior:'instant'});}}
  $('.desk__swap').addEventListener('click',()=>{
    const previousFrom=from.value,previousTo=to.value;
    const sendFilter=$('#send-type'),receiveFilter=$('#receive-type'),filter=sendFilter.value;
    sendFilter.value=receiveFilter.value;receiveFilter.value=filter;
    syncCurrencyOptions('send',previousTo);syncCurrencyOptions('receive',previousFrom);
    const oldCity=$('#send-city').value;setCity('send',city.value);setCity('receive',oldCity);
    const oldAmount=amount.value;amount.value=result.value;result.value=oldAmount;
    editedSide=editedSide==='send'?'receive':'send';update();resetCountdown();revealSelection('send');revealSelection('receive');
  });
  let cities=[],citySide='receive',cityLoadError=false;
  function setCity(side,value){
    if(window.BXServer && category(currencies[from.value])==='cash' && category(currencies[to.value])==='cash'){
      const opposite=side==='send'?'receive':'send';
      $('#'+opposite+'-city').value=value;$('#'+opposite+'-city-label').textContent=value;
    }
$('#'+side+'-city').value=value;$('#'+side+'-city-label').textContent=value.replace('Объединённые Арабские Эмираты (ОАЭ)','ОАЭ').replace('Соединённые Штаты Америки (США)','США');}
  function renderCities(){
    const matches=BXCalc.searchCities(cities,$('#city-search').value);
    const list=$('#city-results');list.replaceChildren();
    for(const name of matches){const button=document.createElement('button');button.type='button';button.className='bx-city-option';button.setAttribute('aria-pressed',String(name===$('#'+citySide+'-city').value));
      const split=name.indexOf(','),strong=document.createElement('strong'),small=document.createElement('span');strong.textContent=name.slice(0,split);small.textContent=name.slice(split+2);button.append(strong,small);
      button.onclick=()=>{setCity(citySide,name);update();resetCountdown();cityDialog.close();};list.append(button);}
    const locationWord={one:'локация',few:'локации',many:'локаций',other:'локации'}[new Intl.PluralRules('ru').select(matches.length)];
    $('#city-count').textContent=cityLoadError?'Список временно недоступен':`${matches.length} ${locationWord}`;
    $('#city-empty').hidden=matches.length>0||!window.BXServer&&!cities.length&&!cityLoadError;
  }
  if(!window.BXServer)fetch('assets/exchange-cities.json?v=2').then(r=>{if(!r.ok)throw new Error('Cities unavailable');return r.json();}).then(data=>{cities=data;renderCities();}).catch(()=>{cityLoadError=true;renderCities();});
  function openCities(side){citySide=side;$('#city-search').value='';renderCities();cityDialog.showModal();$('#city-search').focus();}
  $('#city-search').addEventListener('input',renderCities);
  document.querySelectorAll('[data-city-open]').forEach(b=>b.onclick=()=>openCities(b.dataset.cityOpen));
  document.querySelectorAll('[data-city-target]').forEach(b=>b.onclick=()=>{const side=b.dataset.cityTarget;if(b.dataset.city){const value=cities.find(name=>name.startsWith(b.dataset.city+','))||b.dataset.city+', Объединённые Арабские Эмираты (ОАЭ)';setCity(side,value);update();resetCountdown();}else openCities(side);});
  $('#city-custom-request').onclick=()=>{const query=$('#city-search').value;cityDialog.close();openRequest('custom');$('#request-message').value=query?`Интересует обмен в локации: ${query}`:'';};

  const requestForm=$('#request-form');let requestMode='exchange',submissionTimer,submitting=false,requestSnapshot,requestToken,needsConfirmation,pendingRequest;
  function requestAvailability(message){
    if (pendingRequest) return;
    const notice = $('#request-quote-error');
    notice.textContent = message;
    notice.hidden = !message;
    $('.bx-request__submit').disabled = Boolean(message);
  }
  function updateRequestQuote(current) {
    if (pendingRequest) return;
    const previous = requestSnapshot;
    if (['rate','send','receive'].some(key=>previous[key] !== current[key])) {
      requestSnapshot = {...previous,...current};
      const a = currencies[previous.from], b = currencies[previous.to];
      $('#summary-from').textContent = (previous.side==='send' ? previous.value : fmt(current.send,a.digits))+' '+a.label;
      $('#summary-to').textContent = (previous.side==='receive' ? previous.value : fmt(current.receive,b.digits))+' '+b.label;
      $('#summary-rate').textContent = '1 '+a.symbol+' = '+fmt(current.rate,8)+' '+b.symbol;
      needsConfirmation = true;
    }
    requestAvailability('');
    if (needsConfirmation) {
      $('#request-quote-error').textContent = 'Курс изменился. Проверьте новые суммы в разделе «Ваш обмен».';
      $('#request-quote-error').hidden = false;
      $('.bx-request__submit').textContent = 'Подтвердить новые суммы';
    }
  }
  function fieldError(id,message){$('#'+id+'-error').textContent=message;$('#'+id).setAttribute('aria-invalid',String(Boolean(message)));}
  function validateRequest(){
    const name=$('#request-name').value.trim(),telegram=$('#request-telegram').value.trim().replace(/^@/,'');
    fieldError('request-name',name.length<2?'Укажите имя — минимум 2 символа.':'');
    fieldError('request-telegram',!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegram)?'Укажите Telegram: от 5 до 32 латинских букв, цифр или знаков _.':'');
    fieldError('request-message',requestMode!=='exchange'&&$('#request-message').value.trim().length<5?'Расскажите немного подробнее — минимум 5 символов.':'');
    const consentOK=[...requestForm.querySelectorAll('input[type=checkbox]')].every(c=>c.checked);
    $('#consent-error').textContent=consentOK?'':'Подтвердите обязательные согласия.';
    const invalid=requestForm.querySelector('[aria-invalid=true]');
    if(invalid)invalid.focus();else if(!consentOK)$('#consent-rules').focus();
    return !invalid&&consentOK;
  }
  async function openRequest(mode='exchange'){
    if(mode==='exchange'&&!await update())return;
    pendingRequest = null;
    requestToken = window.BXServer ? crypto.randomUUID() : null; needsConfirmation = false;
    requestMode=mode;requestSnapshot={...lastQuote};clearTimeout(submissionTimer);submitting=false;
    requestAvailability('');
    requestForm.reset();for(const id of ['request-name','request-telegram','request-message'])fieldError(id,'');$('#consent-error').textContent='';
    $('#request-content').hidden=false;$('#request-success').hidden=true;$('#request-document').hidden=true;
    const normal=mode==='exchange';$('#request-summary').hidden=!normal;$('.bx-request__layout').classList.toggle('is-contact',!normal);
    $('#quote-title').textContent=normal?'Новая заявка':mode==='custom'?'Ваше направление':'Связаться с нами';
    $('#request-intro').textContent=normal?'Оставьте контакты — дальше всё обсудим лично.':mode==='custom'?'Расскажите, какой обмен вам нужен. Подберём решение вместе.':'Задайте вопрос — мы поможем разобраться.';
    $('#request-message-row').hidden=normal;$('#request-message').required=!normal;
    $('#request-message-label').textContent=mode==='custom'?'Что хотите обменять? *':'Ваш вопрос *';
    $('#request-message').placeholder=mode==='custom'?'Что отдаёте и получаете, сумма, город':'Напишите, чем мы можем помочь';
    $('.bx-request__submit').textContent=normal?'Отправить заявку':'Отправить сообщение';$('.bx-request__submit').disabled=false;
    if(normal){
      $('#summary-from-icon').src=iconFor(from.value);$('#summary-to-icon').src=iconFor(to.value);
      $('#summary-from').textContent=`${amount.value} ${currencies[from.value].label}`;$('#summary-to').textContent=`${result.value} ${currencies[to.value].label}`;
      const places=[];if(category(currencies[from.value])==='cash')places.push('Передача: '+$('#send-city').value);if(category(currencies[to.value])==='cash')places.push('Получение: '+city.value);
      $('#summary-city-row').hidden=!places.length;$('#summary-city').textContent=places.join(' · ');$('#summary-rate').textContent=$('#exchange-rate').textContent;
    }
    if(!dialog.open)dialog.showModal();dialog.scrollTop=0;$('#request-name').focus({preventScroll:true});
  }
  form.addEventListener('submit',e=>{e.preventDefault();openRequest();});
  document.querySelectorAll('[data-request]').forEach(b=>b.onclick=()=>openRequest(b.dataset.request));
  requestForm.addEventListener('submit',async e=>{
    e.preventDefault();if(submitting||(!pendingRequest && !validateRequest()))return;
    submitting=true;
    const submitButton = $('.bx-request__submit');
    submitButton.disabled = true;
    if(window.BXServer && requestMode==='exchange'){
      const snapshot = requestSnapshot;
      const token = requestToken;
      try {
        pendingRequest ??= {token,src:snapshot.from,dst:snapshot.to,city:snapshot.city,
          side:snapshot.side,value:snapshot.value,
          expected:{rate:snapshot.rate,send:snapshot.send,receive:snapshot.receive},
          name:$('#request-name').value,telegram:$('#request-telegram').value,
          consents:Object.fromEntries(['rules','privacy','aml'].map(key=>[key,$('#consent-'+key).checked]))};
        const response = await fetch('/api/requests', {
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pendingRequest)
        });
        const receipt = await response.json();
        if (!dialog.open || token !== requestToken) return;
        if (response.status >= 500) throw Error();
        pendingRequest = null;
        for (const field of requestForm.querySelectorAll('input')) field.disabled = false;
        if (!response.ok) {
          if (receipt.current) updateRequestQuote(receipt.current);
          else {
            requestAvailability(receipt.error || 'Сохранение временно недоступно.');
            if (response.status !== 409) submitButton.disabled = false;
          }
          return;
        }
        $('#request-number').textContent=receipt.number;
        $('#request-number-label').textContent='Номер заявки';
        $('#success-caption').textContent='Заявка сохранена на локальном сервере.';
        $('#request-content').hidden=true;$('#request-success').hidden=false;dialog.scrollTop=0;$('#request-success').focus();
      } catch {
        if (dialog.open && token === requestToken) {
          for (const field of requestForm.querySelectorAll('input')) field.disabled = true;
          $('#request-quote-error').textContent='Не удалось получить ответ. Повторите отправку, чтобы узнать номер заявки.';
          $('#request-quote-error').hidden=false;
          submitButton.textContent='Повторить отправку';
          submitButton.disabled=false;
        }
      } finally { if (token === requestToken) submitting=false; }
      return;
    }
    submitButton.textContent='Проверяем данные…';
    submissionTimer=setTimeout(()=>{
      $('#request-number-label').textContent='Номер расчёта';
      $('#request-number').textContent='BX-'+Date.now().toString(36).toUpperCase().slice(-7);
      $('#success-caption').textContent='Контактные данные проверены.';
      $('#request-content').hidden=true;$('#request-success').hidden=false;dialog.scrollTop=0;$('#request-success').focus();
    },450);
  });
  const documents={
    rules:{title:'Правила обмена',paragraphs:['Расчёт на сайте предварительный. Курс фиксируется при совершении сделки. Возможность фиксации при немедленном переводе и её срок согласуются с менеджером в Telegram.','Заявки принимаются круглосуточно. Первый освободившийся менеджер связывается с клиентом в Telegram. Реквизиты передаются в личном чате.','Возможность выдачи наличных и условия доставки уточняет менеджер. Стоимость доставки определяется отдельно и не входит в расчёт.','Полная редакция правил сервиса будет размещена после согласования с заказчиком.']},
    privacy:{title:'Политика конфиденциальности',paragraphs:['Для заявки предусмотрены имя и Telegram.',window.BXServer ? 'При отправке заявки на рассчитанный обмен локальный сервер сохраняет имя, Telegram и условия расчёта.' : 'В этой форме данные проходят локальную проверку.','Полный текст политики конфиденциальности для работающего сервиса предоставит заказчик.']},
    aml:{title:'Условия AML/KYC',paragraphs:['Проверки AML и KYC выполняет менеджер вручную. Условия сделки и необходимые сведения обсуждаются в личном чате Telegram.','Полную редакцию AML/KYC-политики и окончательные формулировки согласий предоставит заказчик.']}
  };
  let documentOpener;
  document.querySelectorAll('[data-document]').forEach(b=>b.onclick=()=>{documentOpener=b;const doc=documents[b.dataset.document];$('#document-title').textContent=doc.title;$('#document-body').replaceChildren(...doc.paragraphs.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));$('#request-content').hidden=true;$('#request-document').hidden=false;dialog.scrollTop=0;$('#document-back').focus();});
  $('#document-back').onclick=()=>{$('#request-document').hidden=true;$('#request-content').hidden=false;documentOpener?.focus();};
  document.querySelectorAll('[data-close-dialog]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  dialog.addEventListener('close',()=>{clearTimeout(submissionTimer);submitting=false;pendingRequest=null;requestToken=null;for(const field of requestForm.querySelectorAll('input')) field.disabled=false;requestForm.reset();});
  [dialog,cityDialog,picker].forEach(modal=>{modal.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();});modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}});});
  let previousFocus;
  let opening=false;
  async function open(skipFlight = false) {
    if(window.bxExchangeOpen || opening)return;
    opening=true;
    previousFocus=document.activeElement;
    const arrived=skipFlight || await window.playDeskFlight();
    opening=false;
    if(!arrived)return;
    closeMenu();headerSlot.append(sharedHeader);
    window.bxExchangeOpen=true;syncPlayback();
    heroSection.inert=true;section.inert=false;
    section.setAttribute('aria-hidden','false');section.classList.add('is-open');
    document.body.classList.add('bx-at-desk');document.body.style.overflow='hidden';
    section.focus({preventScroll:true});
    history.replaceState(null,'','#exchange');resetCountdown();
  }
  function close() {
    if(!window.bxExchangeOpen)return;
    if(dialog.open)dialog.close();if(cityDialog.open)cityDialog.close();if(picker.open)picker.close();
    closeMenu();headerHome.prepend(sharedHeader);
    window.hideDeskFlight?.();
    section.classList.remove('is-open');section.inert=true;section.setAttribute('aria-hidden','true');heroSection.inert=false;
    window.bxExchangeOpen=false;document.body.classList.remove('bx-at-desk');document.body.style.overflow='';syncPlayback();
    history.replaceState(null,'',location.pathname+location.search);
    (previousFocus?.isConnected?previousFocus:document.querySelector('#exchange-button')).focus({preventScroll:true});
  }
  section.inert=true;window.openExchangeScene=open;
  document.querySelectorAll('a[href="#exchange"]').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();open();}));
  sharedHeader.querySelector('.brand').addEventListener('click',e=>{
    if(window.bxExchangeOpen){e.preventDefault();close();}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&window.bxExchangeOpen&&!dialog.open&&!cityDialog.open&&!picker.open)close();});
  // Escape closing the dialog must not also close the scene in the same event.
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();});
  if(window.BXServer){
    const params=new URLSearchParams(location.search);
    if(sendOrder.includes(params.get('src')) && receiveOrder.includes(params.get('dst'))){
      from.value=params.get('src');to.value=params.get('dst');
      if(params.get('city')){previousPair=from.value+'>'+to.value;setCity('send',params.get('city'));setCity('receive',params.get('city'));}
      if(params.get('amount'))amount.value=params.get('amount');
    }
    let catalogSequence = 0;
    window.addEventListener('storage',async event=>{
      if (event.key === 'bx:catalog-updated') {
        const sequence = ++catalogSequence;
        try {
          const response = await fetch('/api/catalog');
          if (!response.ok) throw Error();
          const catalog = await response.json();
          if (sequence !== catalogSequence) return;
          ({currencies,sendOrder,receiveOrder} = catalog);
          for (const side of ['send','receive']) {
            delete $('#'+side+'-currency').dataset.filter;
            delete $('#'+side+'-choices').dataset.signature;
            delete $('#'+side+'-picker').dataset.key;
          }
          if (picker.open) renderPickerList();
        } catch { return; }
      } else if (event.key !== 'bx:rates-updated') return;
      update();resetCountdown();
    });
    window.addEventListener('focus',()=>{if(window.bxExchangeOpen)update();});
  }
  update();
  if(location.hash==='#exchange')open(true);
})();
