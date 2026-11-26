'use strict';
const $=id=>document.getElementById(id);
let {currencies,sendOrder,receiveOrder}=BXCatalog;
let rules=[],locations=[],countries=[],pauses=[],selectedId=null;
function addTier(tier = {}) {
  const row = document.createElement('div');
  row.className = 'tier';
  for (const [key, title] of [['threshold', 'От суммы'], ['percent', 'Поправка, %']]) {
    const label = document.createElement('label');
    label.textContent = title;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.required = true;
    input.name = key;
    input.value = tier[key] ?? '';
    label.append(input);
    row.append(label);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Убрать';
  remove.onclick = () => { row.remove(); markEdited(); };
  row.append(remove);
  $('tiers').append(row);
  return row;
}
function markEdited() {
  $('editor').dataset.dirty = '1';
  fields();
  $('preview').hidden = $('reverse-rule').hidden = true;
  $('status').textContent = 'Есть несохранённые изменения';
}
$('add-tier').onclick = () => { addTier().querySelector('input').focus(); markEdited(); };
function switchSection() {
  const current = ['#catalog', '#locations', '#audit'].includes(location.hash) ? location.hash : '#directions';
  for (const section of ['catalog', 'locations', 'directions','audit'])
    $(section+'-panel').hidden = current !== '#'+section;
  for (const link of document.querySelectorAll('.sidebar nav a')) {
    if (link.hash === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if(current==='#audit') loadAudit();
  document.title = document.querySelector('.sidebar nav [aria-current]').textContent + ' · Babushka';
}
window.addEventListener('hashchange', switchSection);
switchSection();

let savingAvailability = false;
const operationNames = {intake: 'Приём', payout: 'Выдача'};
function readAvailability(settings) {
  ({cities:locations,countries} = settings);
  pauses = [...settings.pauses, ...settings.operationPauses];
}
const isPaused = (scope, name) => pauses.some(p => p.scope === scope && p.name === name);

function renderLocations() {
  const country = $('location').value;
  const countryPaused = isPaused('country', country);
  $('country-cities').hidden = !country;
  $('toggle-pause').hidden = !country;
  $('add-country').disabled = $('add-city').disabled = $('toggle-pause').disabled = savingAvailability;
  $('location').disabled = savingAvailability || !countries.length;
  $('toggle-pause').textContent = countryPaused ? 'Снять паузу страны' : 'Поставить страну на паузу';
  $('country-notice').hidden = !countryPaused;
  const inCountry = locations.filter(city => city.endsWith(', ' + country));
  const matches = BXCalc.searchCities(inCountry, $('city-search').value);
  $('city-total').textContent = $('city-search').value.trim() ? matches.length + ' из ' + inCountry.length : inCountry.length;
  $('city-empty').hidden = matches.length !== 0;
  $('city-empty').textContent = inCountry.length ? 'Город не найден.' : 'В этой стране пока нет городов.';
  $('city-rows').replaceChildren(...matches.map(city => {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = city.split(', ')[0];
    row.append(name);
    for (const [operation, label] of Object.entries(operationNames)) {
      const cell = row.insertCell();
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !isPaused(operation, city);
      input.disabled = savingAvailability || countryPaused;
      input.dataset.operation = operation;
      input.dataset.city = city;
      input.setAttribute('aria-label', label + ' наличных — ' + name.textContent);
      cell.append(input);
    }
    const action = document.createElement('button');
    action.textContent = 'Создать';
    action.setAttribute('aria-label','Создать правило для города ' + city);
    action.onclick = () => {
      if (!canReplaceRule()) return;
      location.hash = 'directions';
      show(null);
      const intake = isPaused('payout',city) && !isPaused('intake',city);
      const cash = (intake ? sendOrder : receiveOrder).find(key => currencies[key].category === 'cash');
      const other = (intake ? receiveOrder : sendOrder).find(key => currencies[key].crypto);
      setChoice('src', intake ? cash : other);
      setChoice('dst', intake ? other : cash);
      setChoice('city',city);
      markEdited();
      $('title').focus();
    };
    row.insertCell().append(action);
    return row;
  }));
}

async function changeAvailability(scope, name, paused, trigger) {
  if (savingAvailability) return;
  savingAvailability = true;
  $('pause-status').textContent = 'Сохранение…';
  for (const input of $('city-rows').querySelectorAll('input')) input.disabled = true;
  $('add-country').disabled = $('add-city').disabled = $('toggle-pause').disabled = $('location').disabled = true;
  try {
    const response = await adminFetch('/api/admin/pauses', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({scope, name, paused})
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
    readAvailability(result);
    refreshRuleAvailability();
    localStorage.setItem('bx:rates-updated', crypto.randomUUID());
    $('pause-status').textContent = 'Настройки сохранены.';
  } catch (error) {
    $('pause-status').textContent = 'Не удалось подтвердить сохранение. ' + error.message;
    // If the response was lost the write may already have succeeded.
    try {
      const latest = await adminFetch('/api/admin/rules');
      if (latest.ok) readAvailability(await latest.json());
    } catch {}
  } finally {
    savingAvailability = false;
    renderLocations();
    if (trigger && !$('locations-panel').hidden && document.activeElement === document.body) {
      const selector = 'input[data-operation="' + scope + '"][data-city="' + CSS.escape(name) + '"]';
      (scope === 'country' ? $('toggle-pause') : $('city-rows').querySelector(selector))?.focus({preventScroll:true});
    }
  }
}

const geoDialog = $('geo-dialog');
const geoForm = $('geo-form');
let newLocationType;
function openLocationForm(type) {
  if (savingAvailability) return;
  newLocationType = type;
  geoForm.reset();
  const newCountry = type === 'country';
  $('geo-title').textContent = newCountry ? 'Добавить страну' : 'Добавить город';
  $('geo-country-field').hidden = !newCountry;
  $('geo-country').value = newCountry ? '' : $('location').value;
  $('geo-country').required = newCountry;
  $('geo-parent').hidden = newCountry;
  $('geo-parent').textContent = $('location').value;
  $('geo-city-label').textContent = newCountry ? 'Первый город (необязательно)' : 'Название города';
  $('geo-city').required = !newCountry;
  $('geo-operations').hidden = newCountry;
  $('geo-error').textContent = '';
  geoDialog.showModal();
  $(newCountry ? 'geo-country' : 'geo-city').focus();
}
$('add-country').onclick = () => openLocationForm('country');
$('add-city').onclick = () => openLocationForm('city');
$('geo-city').oninput = () => {
  $('geo-operations').hidden = newLocationType === 'country' && !$('geo-city').value.trim();
};
$('geo-close').onclick = $('geo-cancel').onclick = () => geoDialog.close();
geoDialog.oncancel = event => { if (savingAvailability) event.preventDefault(); };
geoForm.onsubmit = async event => {
  event.preventDefault();
  if (savingAvailability) return;
  const details = {type:newLocationType, country:$('geo-country').value.trim(), city:$('geo-city').value.trim(),
    intake:$('geo-intake').checked, payout:$('geo-payout').checked};
  savingAvailability = true;
  geoForm.inert = true;
  $('geo-error').textContent = '';
  try {
    const response = await adminFetch('/api/admin/locations', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(details)});
    const saved = await response.json();
    if (!response.ok) throw Error(saved.error);
    readAvailability(saved);
    setChoice('location', saved.country);
    $('city-search').value = '';
    $('pause-status').textContent = saved.location ? 'Добавлен город: ' + saved.location + '.' : 'Добавлена страна: ' + saved.country + '.';
    geoDialog.close();
    localStorage.setItem('bx:locations-updated', crypto.randomUUID());
  } catch (error) {
    $('geo-error').textContent = error.message;
  } finally {
    geoForm.inert = false;
    savingAvailability = false;
    renderLocations();
    if (!geoDialog.open) $('add-city').focus({preventScroll:true});
  }
};
window.addEventListener('storage',async event => {
  if (!['bx:locations-updated','bx:rates-updated'].includes(event.key)) return;
  try {
    const response = await adminFetch('/api/admin/rules');
    if (!response.ok) return;
    const settings = await response.json();
    rules = settings.rules;
    ({currencies,sendOrder,receiveOrder}=settings.catalog);
    readAvailability(settings);
    if (!$('editor').dataset.dirty && selectedId) show(rules.find(r=>r.id===selectedId));
    refreshRuleAvailability();
    renderLocations();
    if (dialog.open && !isCurrency(picking)) renderResults();
  } catch { /* Keep the last loaded directory available. */ }
});

$('city-search').oninput = renderLocations;
$('city-rows').onchange = event => {
  const input = event.target;
  if (input.matches('input[type=checkbox]'))
    changeAvailability(input.dataset.operation, input.dataset.city, !input.checked, input);
};
$('toggle-pause').onclick = event => {
  const country = $('location').value;
  changeAvailability('country', country, !isPaused('country', country), event.currentTarget);
};
const needsCity=()=>[$('src').value,$('dst').value].some(key=>currencies[key] && !currencies[key].kind&&!currencies[key].crypto);
function isRuleFilter(id) { return id === 'filter-src' || id === 'filter-dst'; }
function isCurrency(id) { return id === 'src' || id === 'dst' || isRuleFilter(id); }
function setChoice(id, value) {
  $(id).value = value || '';
  $(id+'-value').textContent = isCurrency(id) ? currencies[value]?.label || (isRuleFilter(id) ? 'Любая валюта' : 'Выбрать валюту') : value || (id === 'location' ? 'Выберите страну' : 'Выбрать');
}
function fields(){
  $('place').hidden=!needsCity();
  const draft = {src:$('src').value,dst:$('dst').value,city:needsCity()?$('city').value:'',enabled:$('enabled').checked};
  const reason = BXCalc.ruleBlock(draft,currencies,isPaused);
  $('effective-status').classList.toggle('is-blocked',Boolean(reason));
  $('effective-status').textContent = reason || (needsCity() && !draft.city ? 'Выберите город.' : 'Правило разрешает обмен в пределах заданных лимитов.');
  $('unit').textContent='Лимиты в валюте отдачи · '+(currencies[$('src').value]?.symbol || '—');
}
function show(rule){
  delete $('editor').dataset.dirty;
  selectedId=rule?.id??null;
  setChoice('src', rule?.src ?? (sendOrder.includes('USDT_TRC20') ? 'USDT_TRC20' : sendOrder[0]));
  setChoice('dst', rule?.dst ?? (receiveOrder.includes('USD') ? 'USD' : receiveOrder[0]));
  setChoice('city', rule?.city || '');
  categoryBySide.src = categoryBySide.dst = 'all';
  for(const [key,defaultValue] of [['min',100],['max',50000],['percent',0]])$(key).value=rule?.[key]??defaultValue;
  $('tiers').replaceChildren();
  for (const tier of rule?.tiers || []) addTier(tier);
  $('enabled').checked=rule?Boolean(rule.enabled):true;
  $('title').textContent=rule?'Настройка направления':'Новое направление';
  $('preview').hidden=!rule || !!BXCalc.ruleBlock(rule,currencies,isPaused);
  $('reverse-rule').hidden=!rule || !sendOrder.includes(rule.dst) || !receiveOrder.includes(rule.src);
  if(rule) $('preview').href='/?'+new URLSearchParams({src:rule.src,dst:rule.dst,city:rule.city,amount:String(Math.min(rule.max,Math.max(rule.min,1000)))})+'#exchange';
  $('status').textContent='';fields();
  for(const b of $('list').children)b.setAttribute('aria-pressed',String(Number(b.dataset.id)===selectedId));
}
const pageSize = 6;
let rulePage = 0;
let ruleStatus = 'all';
function renderRules(revealId) {
  const filters = {query: $('rule-search').value.trim(), src: $('filter-src').value,
    dst: $('filter-dst').value, status: ruleStatus};
  const annotated = rules.map(rule => ({...rule,blocked:BXCalc.ruleBlock(rule,currencies,isPaused)}));
  const filtered = BXCalc.searchRules(annotated, currencies, filters);
  const index = filtered.findIndex(rule => rule.id === revealId);
  if (index >= 0) rulePage = Math.floor(index / pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  rulePage = Math.min(Math.max(0, rulePage), pages - 1);
  const start = rulePage * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  $('rule-count').textContent = filtered.length ? (start+1) + '–' + (start+visible.length) + ' из ' + filtered.length : 'Найдено: 0';
  $('reset-rules').hidden = !(filters.query || filters.src || filters.dst || ruleStatus !== 'all');
  $('empty-rules').hidden = filtered.length > 0;
  $('rule-pages').hidden = pages <= 1;
  $('rule-page').textContent = (rulePage + 1) + ' / ' + pages;
  $('prev-rules').disabled = rulePage === 0;
  $('next-rules').disabled = rulePage === pages - 1;
  for (const button of document.querySelectorAll('[data-status]'))
    button.setAttribute('aria-pressed', String(button.dataset.status === ruleStatus));
  $('list').replaceChildren(...visible.map(rule => {
    const button = document.createElement('button'), name = document.createElement('span'), detail = document.createElement('small');
    button.type = 'button';
    button.className = 'rule';
    button.dataset.id = rule.id;
    button.setAttribute('aria-pressed', String(rule.id === selectedId));
    name.textContent = currencies[rule.src].label + ' → ' + currencies[rule.dst].label;
    detail.textContent = (rule.city || 'Без города') + ' · ' + rule.percent + '%' +
      (rule.tiers.length ? ' · диапазонов: ' + (1 + rule.tiers.length) : '') + (rule.blocked ? ' · ' + rule.blocked : '');
    button.append(name, detail);
    button.onclick = () => openEditor(rule);
    return button;
  }));
  return index >= 0;
}
function canReplaceRule() {
  return !$('editor').dataset.dirty || window.confirm('Открыть другое направление и сбросить несохранённые изменения?');
}
$('reverse-rule').onclick = () => {
  const current = rules.find(row=>row.id===selectedId);
  if (!current) return;
  const reverse = rules.find(row=>row.src===current.dst && row.dst===current.src && row.city===current.city);
  if (reverse) { openEditor(reverse); renderRules(reverse.id); return; }
  show(null);
  setChoice('src',current.dst); setChoice('dst',current.src); setChoice('city',current.city);
  markEdited();
  $('title').focus();
};
function openEditor(rule) {
  if (!canReplaceRule()) return;
  show(rule);
  if (matchMedia('(max-width:1100px)').matches) $('title').focus();
}
function refreshRuleAvailability() {
  fields();
  const rule = rules.find(row=>row.id===selectedId);
  $('preview').hidden = !!$('editor').dataset.dirty || !rule || !!BXCalc.ruleBlock(rule,currencies,isPaused);
  renderRules();
}
function changeRuleFilters() {
  rulePage = 0;
  renderRules();
}
$('rule-search').oninput = changeRuleFilters;
document.querySelector('.rule-status').onclick = event => {
  const button = event.target.closest('[data-status]');
  if (!button) return;
  ruleStatus = button.dataset.status;
  changeRuleFilters();
};
$('reset-rules').onclick = () => {
  $('rule-search').value = '';
  setChoice('filter-src', '');
  setChoice('filter-dst', '');
  ruleStatus = 'all';
  changeRuleFilters();
  $('rule-search').focus();
};
$('prev-rules').onclick = () => { rulePage--; renderRules(); };
$('next-rules').onclick = () => { rulePage++; renderRules(); };
async function load(id){
  const response=await adminFetch('/api/admin/rules');
  if(!response.ok)throw Error('Не удалось загрузить правила.');
  const settings = await response.json();
  rules=settings.rules;
  if (settings.catalog) ({currencies,sendOrder,receiveOrder}=settings.catalog);
  readAvailability(settings);
  renderLocations();

  show(rules.find(r=>r.id===id)??rules[0]);
  return renderRules(id);
}
$('new').onclick=()=>openEditor(null);
$('editor').oninput=markEdited;
$('editor').onsubmit=async event=>{
  event.preventDefault();
  const button=event.submitter;button.disabled=true;
  try {
    const rule={id:selectedId,src:$('src').value,dst:$('dst').value,city:needsCity()?$('city').value:'',enabled:$('enabled').checked};
    for(const key of ['min','max','percent'])rule[key]=$(key).valueAsNumber;
    rule.tiers = Array.from($('tiers').children, row => ({
      threshold: row.querySelector('[name=threshold]').valueAsNumber,
      percent: row.querySelector('[name=percent]').valueAsNumber
    }));
    const response=await adminFetch('/api/admin/rules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rule)});
    const result=await response.json();if(!response.ok)throw Error(result.error);
    localStorage.setItem('bx:rates-updated',crypto.randomUUID());
    const listed = await load(result.id);
    $('status').textContent = listed ? 'Настройки сохранены' : 'Сохранено. Правило скрыто выбранными фильтрами.';
  }catch(error){$('status').textContent=error.message;}
  finally{button.disabled=false;}
};
const dialog = $('pick-dialog');
const search = $('pick-search');
const results = $('pick-options');
const categoryBySide = {src: 'all', dst: 'all', 'filter-src': 'all', 'filter-dst': 'all'};
let picking;
let matches = [];
let highlighted = -1;

function openPicker(id) {
  picking = id;
  const currency = isCurrency(id);
  const country = id === 'location';
  $('pick-title').textContent = currency ? $(id+'-label').textContent : country ? 'Выберите страну' : 'Выберите город';
  $('pick-categories').hidden = !currency;
  search.placeholder = currency ? 'Валюта, сеть или способ оплаты' : country ? 'Название страны' : 'Город или страна';
  search.setAttribute('aria-label', search.placeholder);
  search.value = '';
  renderResults();
  dialog.showModal();
  search.focus();
}
function renderResults() {
  const currency = isCurrency(picking);
  if (currency) {
    const category = categoryBySide[picking];
    for (const button of $('pick-categories').children)
      button.setAttribute('aria-pressed', String(button.dataset.category === category));
    const side = picking.endsWith('src') ? 'src' : 'dst';
    let keys = side === 'src' ? sendOrder : receiveOrder;
    if (isRuleFilter(picking)) {
      const used = new Set(rules.map(rule => rule[side]));
      keys = [...used];
    }
    matches = BXCalc.searchCurrencies(currencies, keys, category, search.value);
    if (isRuleFilter(picking) && !search.value.trim()) matches.unshift('');
  } else {
    const data = picking === 'location' ? countries : locations;
    matches = BXCalc.searchCities(data, search.value);
  }
  const fragment = document.createDocumentFragment();
  matches.forEach((value, i) => {
    const option = document.createElement('div');
    option.id = 'pick-option-' + i;
    option.dataset.index = i;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String($(picking).value === value));
    if (currency && value) {
      const icon = new Image(34, 34);
      icon.src = currencies[value].icon;
      icon.alt = '';
      icon.loading = 'lazy';
      option.append(icon);
    }
    const name = document.createElement('span');
    name.textContent = currency ? currencies[value]?.label || 'Любая валюта' : value;
    option.append(name);
    fragment.append(option);
  });
  results.replaceChildren(fragment);
  results.scrollTop = 0;
  $('pick-count').textContent = matches.length ? 'Найдено: ' + matches.length : 'Совпадений нет. Попробуйте другой запрос.';
  highlighted = -1;
  search.removeAttribute('aria-activedescendant');
}
function highlight(index) {
  results.children[highlighted]?.classList.remove('highlight');
  highlighted = index;
  const row = results.children[index];
  row.classList.add('highlight');
  search.setAttribute('aria-activedescendant', row.id);
  row.scrollIntoView({block: 'nearest'});
}
function commitChoice(value) {
  if (value === undefined || (!value && !isRuleFilter(picking))) return;
  const changed = $(picking).value !== value;
  setChoice(picking, value);
  dialog.close();
  if (!changed) return;
  if (picking === 'location') {
    $('pause-status').textContent = '';
    $('city-search').value = '';
    renderLocations();
  } else if (isRuleFilter(picking)) changeRuleFilters();
  else markEdited();
}
for (const id of ['src', 'dst', 'city', 'location', 'filter-src', 'filter-dst'])
  $(id).onclick = () => openPicker(id);
$('pick-close').onclick = () => dialog.close();
$('pick-categories').onclick = event => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  categoryBySide[picking] = button.dataset.category;
  renderResults();
  search.focus();
};
results.onclick = event => {
  const row = event.target.closest('[role=option]');
  if (row) commitChoice(matches[Number(row.dataset.index)]);
};
search.oninput = renderResults;
search.onkeydown = event => {
  if (event.isComposing || !matches.length) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? Math.min(highlighted + 1, matches.length - 1)
      : highlighted < 0 ? matches.length - 1 : Math.max(0, highlighted - 1);
    highlight(next);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    commitChoice(matches[Math.max(0, highlighted)]);
  }
};
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
load().catch(error => { $('status').textContent = $('pause-status').textContent = error.message; });
