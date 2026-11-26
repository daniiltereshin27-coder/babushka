'use strict';
(() => {
  const form = $('instrument-form');
  const input = name => $('instrument-'+name);
  const kindNames = {crypto:'Криптовалюта',cash:'Наличные',cashless:'Безналичные'};
  let key = null, kind = 'all', icon = null, version = 0, decoding = false;
  let data = {};

  function render() {
    const keys = BXCalc.searchCurrencies(data, Object.keys(data), kind, $('catalog-search').value);
    $('catalog-count').textContent = keys.length ? 'Найдено: ' + keys.length : 'Ничего не найдено.';
    for (const button of $('catalog-tabs').children)
      button.setAttribute('aria-pressed', String(button.dataset.kind === kind));
    $('catalog-list').replaceChildren(...keys.map(id => {
      const coin = data[id], button = document.createElement('button');
      button.type = 'button';
      button.className = 'catalog-item';
      button.setAttribute('aria-pressed', String(id === key));
      const img = new Image(36,36);
      img.src = coin.icon;
      img.alt = '';
      img.loading = 'lazy';
      const caption = document.createElement('span'), detail = document.createElement('small');
      caption.append(coin.label);
      detail.textContent = kindNames[coin.category] + ' · ' + (coin.send && coin.receive ? 'Обе стороны' :
        coin.send ? 'Отдаёте' : coin.receive ? 'Получаете' : 'Выключено');
      caption.append(detail);
      button.append(img, caption);
      button.onclick = () => edit(id, true);
      return button;
    }));
  }
  function categoryFields() {
    const category = input('category').value;
    $('network-label').textContent = category === 'crypto' ? 'Сеть' : category === 'cashless' ? 'Способ оплаты' : 'Описание валюты';
    input('network').placeholder = category === 'crypto' ? 'Например, Polygon' : category === 'cashless' ? 'Например, Wise' : 'Например, доллар США';
  }
  function edit(id, focus = false) {
    if (focus && form.dataset.dirty && !window.confirm('Сбросить несохранённые изменения в карточке?')) return;
    delete form.dataset.dirty;
    key = id;
    icon = null;
    ++version;
    decoding = false;
    form.reset();
    const coin = data[id];
    input('title').textContent = coin ? coin.label : 'Новая позиция';
    for (const [name, fallback] of Object.entries({category:'crypto',label:'',symbol:'',network:'',usd:'',digits:2}))
      input(name).value = coin?.[name] ?? fallback;
    for (const side of ['send','receive']) input(side).checked = coin?.[side] ?? true;
    input('preview').hidden = !coin;
    if (coin) input('preview').src = coin.icon;
    input('monogram').textContent = coin ? '' : '¤';
    input('rule').hidden = !coin || !(coin.send || coin.receive);
    input('status').textContent = '';
    categoryFields();
    render();
    if (focus) input('title').focus();
  }
  async function fetchCatalog() {
    const response = await adminFetch('/api/admin/catalog');
    if (!response.ok) throw Error('Не удалось загрузить каталог.');
    const catalog = await response.json();
    data = catalog.currencies;
    ({currencies,sendOrder,receiveOrder} = catalog);
  }
  $('catalog-tabs').onclick = event => {
    const button = event.target.closest('[data-kind]');
    if (button) { kind = button.dataset.kind; render(); }
  };
  $('catalog-search').oninput = render;
  $('catalog-add').onclick = () => edit(null, true);
  input('category').onchange = categoryFields;
  form.oninput = () => {
    form.dataset.dirty = '1';
    input('rule').hidden = true;
    input('status').textContent = 'Есть несохранённые изменения';
    if (input('preview').hidden) input('monogram').textContent = input('symbol').value.toUpperCase().slice(0,5) || '¤';
  };
  input('file').onchange = async () => {
    const file = input('file').files[0];
    if (!file) return;
    const job = ++version;
    decoding = true;
    const url = URL.createObjectURL(file);
    try {
      if (!['image/png','image/webp','image/jpeg'].includes(file.type)) throw Error('Выберите PNG, JPG или WebP.');
      const img = new Image();
      img.src = url;
      await img.decode();
      if (job !== version) return;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const scale = 256 / Math.max(img.naturalWidth, img.naturalHeight);
      const w = img.naturalWidth*scale, h = img.naturalHeight*scale;
      canvas.getContext('2d').drawImage(img,(256-w)/2,(256-h)/2,w,h);
      icon = canvas.toDataURL('image/png');
      input('preview').src = icon;
      input('preview').hidden = false;
      input('monogram').textContent = '';
    } catch {
      if (job === version) {
        input('file').value = '';
        input('status').textContent = 'Не удалось прочитать файл. Выберите PNG, JPG или WebP.';
      }
    } finally {
      URL.revokeObjectURL(url);
      if (job === version) decoding = false;
    }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (decoding) { input('status').textContent = 'Иконка обрабатывается. Дождитесь предпросмотра.'; return; }
    const record = {key,icon};
    for (const name of ['label','category','symbol','network']) record[name] = input(name).value;
    for (const name of ['usd','digits']) record[name] = input(name).valueAsNumber;
    for (const name of ['send','receive']) record[name] = input(name).checked;
    const pane = $('catalog-panel');
    pane.inert = true;
    try {
      const response = await adminFetch('/api/admin/catalog', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      localStorage.setItem('bx:catalog-updated', crypto.randomUUID());
      await fetchCatalog();
      if (kind !== 'all') kind = data[result.key].category;
      if (!BXCalc.searchCurrencies(data,[result.key],kind,$('catalog-search').value).length) $('catalog-search').value = '';
      edit(result.key);
      const selected = $('catalog-list').querySelector('[aria-pressed=true]');
      if (selected) $('catalog-list').scrollTop = selected.offsetTop;
      refreshRuleAvailability();
      input('status').textContent = 'Сохранено';
    } catch (error) { input('status').textContent = error.message; }
    finally { pane.inert = false; }
  };
  input('rule').onclick = () => {
    if (!canReplaceRule()) return;
    location.hash = 'directions';
    show(null);
    const coin = data[key];
    setChoice(coin.send ? 'src' : 'dst', key);
    const opposite = coin.send ? 'dst' : 'src';
    if ($(opposite).value === key) setChoice(opposite,(coin.send ? receiveOrder : sendOrder).find(id=>id!==key));
    markEdited();
    $('title').focus();
  };
  window.addEventListener('storage', async event => {
    if (event.key !== 'bx:catalog-updated') return;
    try {
      await fetchCatalog();
      if (key && !form.dataset.dirty) edit(key);
      else render();
      refreshRuleAvailability();
    } catch (error) { input('status').textContent = error.message; }
  });
  fetchCatalog().then(() => edit(Object.keys(data)[0])).catch(error => { input('status').textContent = error.message; });
})();
