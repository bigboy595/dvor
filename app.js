(() => {
  'use strict';
  const places = window.DVOR_PLACES, stories = window.DVOR_STORIES;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    pin:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    route:'<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h9a4 4 0 0 1 0 8H7a3 3 0 0 0 0 6h9"/>',
    locate:'<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
    compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    arrow:'<path d="M19 12H5m6-6-6 6 6 6"/>',
    text:'<path d="M4 5h16M4 10h16M4 15h11M4 20h8"/>',
    bookmark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',
    share:'<path d="M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 6v1"/>',
    list:'<path d="M8 5h12M8 12h12M8 19h12M3 5h1M3 12h1M3 19h1"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    download:'<path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/>'
  };
  const glyphs = {
    tree:'<path d="M12 3 6 10h3l-5 6h6v5h4v-5h6l-5-6h3Z"/>',
    ball:'<circle cx="12" cy="12" r="9"/><path d="m12 7 5 4-2 6H9l-2-6Zm0-4v4m-8 2 3 2m-2 7 4-1m10 1-4-1m5-8-3 2"/>',
    bench:'<path d="M5 5h14v7H5Zm-2 7h18v4H3Zm3 4v5m12-5v5M9 5v7m6-7v7"/>',
    shoe:'<path d="m5 4 5 2-1 6 4 2 3-2 3 5 3 1v3H2V10l3 1Zm-3 13h5m4-9 2 1m-3 2 2 1"/>',
    building:'<path d="M3 21V10l6-3v14m0-14V3l6 3v15m0-12 6 3v9M3 21h18M6 12v2m6-5v2m6 3v2"/>',
    bike:'<circle cx="5.5" cy="16.5" r="4.5"/><circle cx="18.5" cy="16.5" r="4.5"/><path d="m5.5 16.5 4-9 5 9h-9l11-9 2 9m-11-9h5m3-3h3l1 3"/>'
  };
  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.pin}</svg>`;
  }
  const glyph = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${glyphs[name] || glyphs.tree}</svg>`;
  const hydrate = (root = document) => root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
  const readStore = (key, fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
  let storageAvailable = true;
  const writeStore = (key, value) => {try {localStorage.setItem(key, JSON.stringify(value));return true;} catch {storageAvailable = false;return false;}};
  const storyById = id => stories.find(s => s.id === id);
  const placeById = id => places.find(p => p.id === id);
  const photoByPlace = id => window.DVOR_PHOTOS?.[id];
  const sanitizeIds = ids => [...new Set(Array.isArray(ids) ? ids : [])].filter(id => storyById(id));
  const state = {
    query:'',theme:'Все',district:'all',active:null,nearby:null,
    route:sanitizeIds(readStore('dvor.route.v1', [])),
    bookmarks:sanitizeIds(readStore('dvor.bookmarks.v1', [])),
    saved:readStore('dvor.saved.v1', []),
    routeInfo:null,walking:false,walkIndex:0
  };
  if (!Array.isArray(state.saved)) state.saved = [];
  state.saved = state.saved.filter(r => r && Array.isArray(r.ids)).map(r => ({...r,ids:sanitizeIds(r.ids)})).filter(r => r.ids.length);
  const routeParam = new URL(location.href).searchParams.get('route');
  if (routeParam) state.route = sanitizeIds(routeParam.split(','));
  let map, userMarker, routeLayer, routeLabel, toastTimer, routeController, mapLoadTimer, mapSDKPromise, mapLoading=false, appStarted=false, routeToken = 0;
  const markers = new Map(), routeCache = new Map();
  const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plural = (n, forms) => forms[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 1 : 2];
  const storyCount = n => `${n} ${plural(n,['история','истории','историй'])}`;
  const placeCount = n => `${n} ${plural(n,['место','места','мест'])}`;
  const km = n => n.toLocaleString('ru-RU',{maximumFractionDigits:1});
  function toast(message) { clearTimeout(toastTimer);$('toast').textContent = message;$('toast').hidden = false;toastTimer = setTimeout(()=>$('toast').hidden = true, 4500); }
  function setNav(value) { document.querySelectorAll('[data-nav]').forEach(el => el.classList.toggle('active', el.dataset.nav === value)); }
  function routePlaces() { return [...new Set(state.route.map(id => storyById(id).place))].map(placeById); }
  function filteredStories() {
    const query = state.query.toLocaleLowerCase('ru');
    let result = stories.filter(s => {
      const p = placeById(s.place);
      return (state.theme === 'Все' || state.theme === 'Сохранённые' && state.bookmarks.includes(s.id) || s.theme === state.theme)
        && (state.district === 'all' || p.district === state.district)
        && (!query || [s.title,s.name,s.theme,s.period,...s.text,p.name,p.district,p.address].join(' ').toLocaleLowerCase('ru').includes(query))
        && (!state.nearby || distance(state.nearby, [p.lat,p.lng]) <= 2000);
    });
    if (state.nearby) result.sort((a,b) => {const pa=placeById(a.place),pb=placeById(b.place);return distance(state.nearby,[pa.lat,pa.lng])-distance(state.nearby,[pb.lat,pb.lng]);});
    return result;
  }
  // Coordinates in the content are [latitude, longitude]; EvaMaps expects [longitude, latitude].
  const toMap = ([lat,lng]) => [lng,lat];
  function distance(a,b){
    const rad=Math.PI/180,[lat1,lng1]=a,[lat2,lng2]=b;
    const h=Math.sin((lat2-lat1)*rad/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lng2-lng1)*rad/2)**2;
    return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  }
  function loadMapSDK(){
    if(window.EvaMaps)return Promise.resolve();
    if(mapSDKPromise)return mapSDKPromise;
    mapSDKPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://evamaps.ru/sdk/1/evamaps.js';script.async=true;
      const timer=setTimeout(fail,15000);
      function fail(){clearTimeout(timer);script.remove();mapSDKPromise=null;reject(new Error('Map SDK unavailable'));}
      script.onload=()=>{clearTimeout(timer);if(window.EvaMaps)resolve();else fail();};script.onerror=fail;
      document.head.append(script);
    });
    return mapSDKPromise;
  }
  async function startMap(){
    if(mapLoading)return;mapLoading=true;$('map').setAttribute('aria-busy','true');$('mapError').hidden=true;
    try{
      await loadMapSDK();
      if(!$('introScreen').hidden)return;
      const center=map?.getCenter()||[37.674,55.795],zoom=map?.getZoom()||14;
      routeController?.abort();clearTimeout(mapLoadTimer);map?.destroy();markers.clear();userMarker=null;routeLayer=null;routeLabel=null;
      map=EvaMaps.create('map',{center,zoom,theme:'gray',minZoom:9,maxZoom:19,zoomControl:false,scaleControl:true});
      mapLoadTimer=setTimeout(()=>{$('mapError').hidden=false;$('map').setAttribute('aria-busy','false');},20000);
      map.on('load',()=>{clearTimeout(mapLoadTimer);$('mapError').hidden=true;$('map').setAttribute('aria-busy','false');});
      map.on('moveend',()=>{const [lng,lat]=map.getCenter();$('mapCoordinate').textContent=`${lat.toFixed(4)}° N   ${lng.toFixed(4)}° E`;});
      map.on('click',()=>{if(!state.walking)closeDetail();});
      renderMarkers();
      if(state.route.length)updateRouteGeometry();
      if(state.active)flyToPlace(placeById(storyById(state.active).place));
      else if(!$('routePanel').hidden&&routePlaces().length>1)fitCoordinates(routePlaces().map(p=>[p.lat,p.lng]));
      else if(innerWidth<=760)map.panBy(0,100);
    }catch{
      clearTimeout(mapLoadTimer);map?.destroy();map=null;markers.clear();
      $('mapError').hidden=false;$('map').setAttribute('aria-busy','false');
    }finally{mapLoading=false;}
  }
  function fitCoordinates(coords) {
    if(!map||!coords.length)return;
    const left = innerWidth > 760 ? 35 : 25;
    const right = !$('routePanel').hidden || !$('detailPanel').hidden ? innerWidth > 1020 ? 440 : innerWidth > 760 ? 360 : 25 : 55;
    const bottom = innerWidth > 760 ? 115 : 330;
    const lats=coords.map(p=>p[0]),lngs=coords.map(p=>p[1]);
    map.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:{left,top:95,right,bottom},maxZoom:16});
  }
  function focusSokolniki(filter) {
    closeDetail();closeRoute();
    if(filter){resetFilters(false);state.district='Сокольники';$('districtSelect').value=state.district;renderList();}
    fitCoordinates(places.filter(p=>p.district==='Сокольники').map(p=>[p.lat,p.lng]));
    $('moscowButton').classList.remove('selected');$('sokolnikiButton').classList.add('selected');
  }
  function renderMarkers() {
    const filtered = filteredStories();
    if(!map)return;
    markers.forEach(marker=>marker.remove());markers.clear();
    places.forEach(p=>{
      const matching=filtered.filter(s=>s.place===p.id);if(!matching.length)return;
      const all=stories.filter(s=>s.place===p.id),routeIndex=routePlaces().findIndex(x=>x.id===p.id);
      const html=`<div class="pin-inner">${glyph(p.icon)}</div>${all.length>1?`<span class="pin-count">${all.length}</span>`:''}${routeIndex>=0?`<span class="pin-route">${routeIndex+1}</span>`:''}`;
      const active=state.active && storyById(state.active)?.place===p.id;
      const node=document.createElement('div');node.className='memory-marker'+(active?' active':'');node.innerHTML=html;
      const marker=EvaMaps.marker([p.lng,p.lat],{icon:node,title:p.name,hint:`${p.name} · ${storyCount(all.length)}`,keyboard:true,riseOnHover:true});
      marker.on('click',()=>openStory(matching[0].id));marker.addTo(map);markers.set(p.id,marker);
    });
  }
  function renderThemes() {
    const themes=['Все',...new Set(stories.map(s=>s.theme)),'Сохранённые'];
    $('themeFilters').innerHTML=themes.map(t=>`<button class="chip${state.theme===t?' active':''}" data-theme="${t}" aria-pressed="${state.theme===t}">${t==='Сохранённые'?icon('bookmark'):''}${t==='Сохранённые'?'Мои':t}</button>`).join('');
  }
  function renderList() {
    const result=filteredStories();$('resultsCount').textContent=storyCount(result.length);
    renderThemes();renderMarkers();
    $('storyList').innerHTML=result.length?result.map(s=>{
      const p=placeById(s.place),added=state.route.includes(s.id),photo=photoByPlace(p.id);
      return `<article class="story-card${state.active===s.id?' selected':''}"><button class="story-card-main" data-story="${s.id}" aria-label="Открыть историю ${esc(s.title)}"><div class="story-thumbnail${photo?'':' no-photo'}" style="--thumb:${s.color}">${photo?`<img src="${photo.src}" alt="${esc(photo.caption||p.name)} — фотография места" loading="lazy" decoding="async">`:glyph(p.icon)}<span class="thumbnail-index">${esc(s.period)}</span><span class="thumbnail-voice">${icon('text')} Чтение · ${s.readingMinutes} мин</span></div><div class="story-copy"><div class="story-place">${esc(p.district)} · ${esc(p.name)}</div><h3>${esc(s.title)}</h3><div class="story-meta"><span>${esc(s.name)}</span><span>·</span><span>${esc(s.theme)}</span></div></div></button><button class="card-add${added?' added':''}" data-add="${s.id}" aria-label="${added?'Убрать из прогулки':'Добавить в прогулку'}: ${esc(s.title)}" aria-pressed="${added}">${added?'✓':'+'}</button></article>`;
    }).join(''):`<div class="empty-state">${icon('search')}<b>${state.theme==='Сохранённые'?'Здесь будут твои истории':'Пока ничего не нашлось'}</b>${state.theme==='Сохранённые'?'Сохраняй истории значком закладки в карточке.':state.nearby?'В радиусе двух километров пока нет историй.':'Попробуй другую тему, район или название.'}<br><button data-reset>Показать все истории ↗</button></div>`;
    $('nearbyButton').classList.toggle('selected',!!state.nearby);
    $('sokolnikiButton').classList.toggle('selected',state.district==='Сокольники');
  }
  function resetFilters(render=true){state.query='';state.theme='Все';state.district='all';state.nearby=null;$('searchInput').value='';$('districtSelect').value='all';if(render)renderList();}
  function flyToPlace(p) {
    if(!map)return;
    const zoom=Math.max(map.getZoom(),15),rightPanel=innerWidth>760;
    const offset=rightPanel?180:0,bottomOffset=innerWidth<=760?-90:15;
    // Project at the target zoom, then offset the center so the point stays outside the story panel.
    map.setView([p.lng,p.lat],zoom);
    const projected=map.project([p.lng,p.lat]);
    const center=map.unproject({x:projected.x+offset,y:projected.y+bottomOffset});
    if(motion)map.flyTo(center,zoom,{duration:350});else map.setView(center,zoom);
  }
  function openStory(id,fly=true){
    if(!storyById(id))return;
    state.walking=false;state.active=id;$('routePanel').hidden=true;$('detailPanel').hidden=false;document.querySelector('.workspace').classList.add('panel-open');setNav('map');
    $('explorer').classList.remove('expanded');renderDetail();renderList();if(fly)flyToPlace(placeById(storyById(id).place));
    $('detailPanel').scrollTop=0;
  }
  function closeDetail(){if($('detailPanel').hidden)return;$('detailPanel').hidden=true;state.active=null;if($('routePanel').hidden)document.querySelector('.workspace').classList.remove('panel-open');renderList();}
  function photoFigure(p){
    const photo=photoByPlace(p.id);if(!photo)return '';
    return `<figure class="story-photo"><img src="${esc(photo.src)}" alt="${esc(photo.caption||p.name)}" loading="lazy" decoding="async"><figcaption><span>${esc(photo.caption||p.name)}</span><small><a href="${esc(photo.source)}" target="_blank" rel="noopener">${esc(photo.artist)} ↗</a> · <a href="${esc(photo.licenseUrl||photo.source)}" target="_blank" rel="noopener">${esc(photo.license)}</a> · Размер адаптирован.</small></figcaption></figure>`;
  }
  function storyHTML(s){
    const p=placeById(s.place);
    return `<div class="story-text">${s.text.map((t,i)=>`<p>${esc(t)}</p>${i===1?photoFigure(p):''}`).join('')}</div>`;
  }
  function renderDetail(){
    const s=storyById(state.active);if(!s)return;const p=placeById(s.place),added=state.route.includes(s.id),saved=state.bookmarks.includes(s.id);
    const other=stories.filter(x=>x.place===p.id&&x.id!==s.id);
    $('detailPanel').innerHTML=`<div class="panel-top"><button class="panel-back" data-close-detail>${icon('arrow')} К историям</button><button class="panel-close" data-close-detail aria-label="Закрыть историю">${icon('close')}</button></div>
      <div class="detail-content"><div class="detail-location">${esc(p.district)} / ${esc(p.name)}</div><h2>${esc(s.title)}</h2><div class="narrator"><div class="avatar" style="background:${s.color}">${esc(s.name[0])}</div><div class="narrator-copy"><strong>${esc(s.name)}</strong><span>${esc(s.connection)}</span></div></div>
      <div class="reading-meta">${icon('text')} ${s.readingMinutes} мин чтения <span>·</span> ${esc(s.period)}</div>
      <article class="story-article" aria-label="Текст истории: ${esc(s.title)}">${storyHTML(s)}</article><div class="detail-tags"><span>${esc(s.theme)}</span><span>${esc(s.period)}</span><span>${esc(p.district)}</span></div>
      <div class="detail-actions"><button class="button ${added?'dark':'amber'}" data-add="${s.id}">${added?'✓ В твоей прогулке':'+ Добавить в прогулку'}</button><button class="icon-button" data-bookmark="${s.id}" aria-label="${saved?'Убрать из сохранённых':'Сохранить историю'}" aria-pressed="${saved}" style="${saved?'background:#fff0c8':''}">${icon('bookmark')}</button><button class="icon-button" data-share-story="${s.id}" aria-label="Поделиться историей">${icon('share')}</button></div>
      ${other.length?`<div class="other-stories"><h3>ЕЩЁ ОДНА ИСТОРИЯ ЭТОГО МЕСТА</h3>${other.map(o=>`<button class="other-story-button" data-story="${o.id}"><span>${esc(o.title)}<small>${esc(o.name)} · ${esc(o.period)}</small></span><span>↗</span></button>`).join('')}</div>`:''}
      <div class="other-stories"><h3>РЯДОМ НА КАРТЕ</h3>${places.filter(x=>x.id!==p.id).sort((a,b)=>distance([p.lat,p.lng],[a.lat,a.lng])-distance([p.lat,p.lng],[b.lat,b.lng])).slice(0,2).map(x=>`<button class="other-story-button" data-story="${stories.find(y=>y.place===x.id).id}"><span>${esc(x.name)}<small>${km(distance([p.lat,p.lng],[x.lat,x.lng])/1000)} км по прямой</small></span><span>↗</span></button>`).join('')}</div></div>`;
  }
  function toggleRoute(id){
    const adding=!state.route.includes(id);state.route=adding?[...state.route,id]:state.route.filter(x=>x!==id);state.walking=false;
    persistRoute();renderList();renderDock();if(!$('detailPanel').hidden)renderDetail();if(!$('routePanel').hidden)renderRoute();updateRouteGeometry();
    toast(adding?'История добавлена в твою прогулку':'История убрана из прогулки');
  }
  function persistRoute(){writeStore('dvor.route.v1',state.route);state.routeInfo=null;}
  function renderDock(){
    $('navRouteCount').textContent=state.route.length;const points=routePlaces();
    $('dockTitle').textContent=state.route.length?`${storyCount(state.route.length)} в твоей прогулке`:'Собери город в прогулку';
    $('dockSubtitle').textContent=state.route.length?`${placeCount(points.length)} · ${state.routeInfo?.status==='ready'?`${km(state.routeInfo.length)} км пешком`:'добавляй и меняй порядок'}`:'Выбирай истории и открывай город';
    $('openRoute').innerHTML=state.route.length?'Моя прогулка <span>↗</span>':'Собрать прогулку <span>↗</span>';
    $('dockAvatars').innerHTML=state.route.slice(0,3).map(id=>{const s=storyById(id);return `<span style="background:${s.color}">${esc(s.name[0])}</span>`;}).join('');
  }
  function openRoute(){closeDetail();$('routePanel').hidden=false;document.querySelector('.workspace').classList.add('panel-open');setNav('routes');renderRoute();if(routePlaces().length>1)fitCoordinates(routePlaces().map(p=>[p.lat,p.lng]));updateRouteGeometry();}
  function closeRoute(){if($('routePanel').hidden)return;$('routePanel').hidden=true;if($('detailPanel').hidden)document.querySelector('.workspace').classList.remove('panel-open');setNav('map');if(state.walking){state.walking=false;}}
  function renderRoute(){
    const points=routePlaces(),seconds=state.route.reduce((n,id)=>n+storyById(id).readingMinutes*60,0);
    const info=state.routeInfo;
    $('routePanel').innerHTML=`<div class="panel-top"><button class="panel-back" data-close-route>${icon('arrow')} На карту</button><button class="panel-close" data-close-route aria-label="Закрыть прогулку">${icon('close')}</button></div>
    <div class="route-header"><div class="eyebrow">ДВОР / ЛИЧНЫЙ МАРШРУТ</div><h2>Москва твоими<br>шагами<span class="amber-dot">.</span></h2><p>${state.route.length?'Твой маршрут из личных историй. Порядок можно менять стрелками у каждой истории.':'Выбери истории на карте — или начни с нашей первой прогулки по Сокольникам.'}</p></div>
    ${state.route.length?`<div class="route-summary"><div><b>${points.length}</b>МЕСТА</div><div><b>${info?.status==='ready'?km(info.length):'—'} <small>км</small></b>ПЕШКОМ</div><div><b>${info?.status==='ready'?Math.ceil((info.time+seconds)/60):Math.ceil(seconds/60)} <small>мин</small></b>${info?.status==='ready'?'С ЧТЕНИЕМ':'НА ЧТЕНИЕ'}</div></div>
    <div class="route-status">${info?.status==='ready'?'Пеший маршрут по дорожкам и улицам. Время включает примерные остановки на чтение.':info?.status==='loading'?'Ищем пешеходные дорожки…':points.length<2?'Одна точка: открой её в навигаторе или добавь ещё одну.':'Показан порядок мест. Для пешего пути открой навигацию.'}</div>
    ${state.walking?walkingHTML():''}<div class="route-stops">${state.route.map((id,i)=>{const s=storyById(id),p=placeById(s.place),number=points.findIndex(x=>x.id===p.id)+1;return `<div class="route-stop"><span class="stop-number">${number}</span><div class="stop-content"><button data-story="${id}">${esc(s.title)}</button><p>${esc(p.name)}<br>${esc(s.name)} · ~${s.readingMinutes} мин чтения</p></div><div class="stop-tools"><button data-move="${id}" data-direction="-1" ${i===0?'disabled':''} aria-label="Переместить историю выше">↑</button><button data-move="${id}" data-direction="1" ${i===state.route.length-1?'disabled':''} aria-label="Переместить историю ниже">↓</button><button data-add="${id}" aria-label="Убрать историю из прогулки">×</button></div></div>`;}).join('')}</div>
    <div class="route-bottom"><button class="button dark" data-start-walk>${state.walking?'Завершить прогулку':'Начать прогулку'} ${icon('route')}</button><a class="button amber" href="${navigationURL()}" target="_blank" rel="noopener">Открыть пешую навигацию ↗</a><div class="two-buttons"><button class="button secondary" data-save-route>Сохранить ${icon('bookmark')}</button><button class="button secondary" data-share-route>Ссылка ${icon('share')}</button></div><div class="two-buttons"><button class="button secondary" data-export-route>Скачать GPX ${icon('download')}</button></div><p class="route-saved-note">Выбранные истории сохранены ${storageAvailable?'в этом браузере.':'только до закрытия страницы — хранилище недоступно.'}</p><button class="route-clear" data-clear-route>Очистить прогулку</button>${savedHTML()}</div>`:
    `<div class="route-empty"><div class="pilot-card"><div class="eyebrow">ПЕРВАЯ ПРОГУЛКА / СОКОЛЬНИКИ</div><h3>Три места.<br>Шесть личных историй</h3><p>3 места · 6 историй<br>Главный вход → фонтан → аллея у ротонды</p><button class="button dark" data-pilot>Выбрать эти истории ↗</button></div>${savedHTML()}</div>`}`;
  }
  function savedHTML(){return state.saved.length?`<div class="other-stories"><h3>СОХРАНЁННЫЕ ПРОГУЛКИ</h3>${state.saved.slice(0,5).map((r,i)=>`<div class="saved-route"><div>${esc(r.name)}<small>${storyCount(r.ids.length)}</small></div><button data-load-route="${i}">Открыть ↗</button></div>`).join('')}</div>`:'';}
  function walkingHTML(){
    const id=state.route[state.walkIndex],s=storyById(id),p=placeById(s.place);
    if(!s)return '';
    return `<div class="walking-status"><div class="eyebrow">ПРОГУЛКА / ${state.walkIndex+1} ИЗ ${state.route.length}</div><h3>${esc(s.title)}</h3><p>${esc(p.name)} · ${esc(s.name)}</p><details class="walk-reading"><summary>Читать историю <span>↗</span></summary>${storyHTML(s)}</details><div class="two-buttons"><button class="button secondary" data-walk-step="-1" ${state.walkIndex===0?'disabled':''}>← Назад</button><button class="button secondary" data-walk-step="1">${state.walkIndex===state.route.length-1?'Завершить ✓':'Следующая →'}</button></div><p class="route-playing-note">Переходи к следующей истории, когда дойдёшь до места. Автопереход по геопозиции пока не включён.</p></div>`;
  }
  function navigationURL(){const points=routePlaces();return `https://yandex.ru/maps/?mode=routes&rtt=pd&rtext=${points.map(p=>`${p.lat},${p.lng}`).join('~')}`;}
  async function updateRouteGeometry(){
    if(!map)return;
    const points=routePlaces();routeToken++;const token=routeToken;
    routeController?.abort();if(routeLayer){routeLayer.remove();routeLayer=null;}if(routeLabel){routeLabel.remove();routeLabel=null;}
    if(points.length<2){state.routeInfo=null;renderDock();return;}
    const key=points.map(p=>p.id).join(',');
    if(routeCache.has(key)){applyRoute(routeCache.get(key));return;}
    state.routeInfo={status:'loading'};if(!$('routePanel').hidden)renderRoute();
    const controller=new AbortController();routeController=controller;const timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const result=await localWalkingRoute(points,controller.signal);
      if(token!==routeToken)return;
      routeCache.set(key,result);applyRoute(result);
    }catch{if(token!==routeToken)return;state.routeInfo={status:'unavailable'};renderDock();if(!$('routePanel').hidden)renderRoute();}
    finally{clearTimeout(timeout);}
    function applyRoute(info){state.routeInfo=info;if(routeLayer)routeLayer.remove();routeLayer=EvaMaps.polyline(info.coords.map(toMap),{color:'#9e7935',weight:4,opacity:.9}).addTo(map);renderDock();if(!$('routePanel').hidden)renderRoute();}
  }
  // The current collection uses a local pedestrian path, so every ordering works without a foreign routing API.
  async function localWalkingRoute(points,signal){
    const ids=['entrance','fountain','rotonda'];
    if(points.some(p=>!ids.includes(p.id)))throw new Error('No local path for this location');
    const response=await fetch('assets/pilot-route.json',{signal});
    if(!response.ok)throw new Error('Local route unavailable');
    const data=await response.json(),legs=data.trip?.legs;
    if(!legs||legs.length!==2)throw new Error('Local route invalid');
    const coords=[];let length=0,time=0;
    for(let i=1;i<points.length;i++){
      const from=ids.indexOf(points[i-1].id),to=ids.indexOf(points[i].id),step=from<to?1:-1;
      for(let at=from;at!==to;at+=step){
        const leg=legs[step>0?at:at-1],segment=decodePolyline(leg.shape);
        if(step<0)segment.reverse();
        coords.push(...(coords.length?segment.slice(1):segment));length+=leg.summary.length;time+=leg.summary.time;
      }
    }
    return {status:'ready',length,time,coords};
  }
  function decodePolyline(str){let index=0,lat=0,lng=0,result=[];while(index<str.length){let shift=0,value=0,byte;do{byte=str.charCodeAt(index++)-63;value|=(byte&31)<<shift;shift+=5;}while(byte>=32);lat+=(value&1)?~(value>>1):(value>>1);shift=0;value=0;do{byte=str.charCodeAt(index++)-63;value|=(byte&31)<<shift;shift+=5;}while(byte>=32);lng+=(value&1)?~(value>>1):(value>>1);result.push([lat/1e6,lng/1e6]);}return result;}
  function pilotRoute(){state.route=places.filter(p=>p.district==='Сокольники').flatMap(p=>stories.filter(s=>s.place===p.id).map(s=>s.id));state.walking=false;persistRoute();renderList();renderDock();openRoute();toast('Шесть историй Сокольников — в твоей прогулке');}
  function moveStory(id,direction){const index=state.route.indexOf(id),next=index+direction;if(next<0||next>=state.route.length)return;[state.route[index],state.route[next]]=[state.route[next],state.route[index]];state.walking=false;persistRoute();renderList();renderDock();renderRoute();updateRouteGeometry();}
  function download(name,content,type='text/plain;charset=utf-8'){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
  function exportRoute(){
    const points=routePlaces(),xmlEscape=v=>String(v).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
    const waypoints=points.map(p=>`<wpt lat="${p.lat}" lon="${p.lng}"><name>${xmlEscape(p.name)}</name><desc>${xmlEscape(stories.filter(s=>state.route.includes(s.id)&&s.place===p.id).map(s=>s.title).join('; '))}</desc></wpt>`).join('');
    const track=state.routeInfo?.status==='ready'?`<trk><name>ДВОР — пешая прогулка</name><trkseg>${state.routeInfo.coords.map(([lat,lng])=>`<trkpt lat="${lat}" lon="${lng}"/>`).join('')}</trkseg></trk>`:'';
    download('dvor-walk.gpx',`<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="ДВОР" xmlns="http://www.topografix.com/GPX/1/1">${waypoints}${track}</gpx>`,'application/gpx+xml');toast(track?'Пеший маршрут скачан в GPX':'Точки прогулки скачаны в GPX');
  }
  async function shareURL(url){try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);toast('Ссылка скопирована');}else{download('dvor-link.txt',url);toast('Ссылка сохранена в файл');}}catch{download('dvor-link.txt',url);toast('Ссылка сохранена в файл');}}
  async function locateUser(){
    if(state.nearby){state.nearby=null;renderList();toast('Снова показываем все районы');return;}
    if(!navigator.geolocation){toast('Геолокация недоступна в этом браузере');return;}
    const btn=$('nearbyButton');btn.disabled=true;
    navigator.geolocation.getCurrentPosition(pos=>{btn.disabled=false;const ll=[pos.coords.latitude,pos.coords.longitude];state.nearby=ll;state.district='all';$('districtSelect').value='all';if(userMarker)userMarker.remove();if(map)userMarker=EvaMaps.marker(toMap(ll),{appearance:'dot',color:'#527bdc',title:'Ты здесь',keyboard:false}).addTo(map);renderList();if(filteredStories().length){if(map)map.flyTo(toMap(ll),14,{duration:motion?350:0});toast('Истории в радиусе двух километров');}else toast('Рядом пока нет историй. Выбери район на карте Москвы.');},error=>{btn.disabled=false;toast(error.code===1?'Разреши геолокацию в настройках браузера или выбери район.':'Не удалось определить местоположение. Выбери район вручную.');},{timeout:10000,maximumAge:60000,enableHighAccuracy:false});
  }
  function bindEvents(){
    $('retryTiles').addEventListener('click',startMap);
    $('zoomIn').addEventListener('click',()=>map?.zoomIn());$('zoomOut').addEventListener('click',()=>map?.zoomOut());
    $('resetView').addEventListener('click',()=>focusSokolniki(false));
    $('moscowButton').addEventListener('click',()=>{resetFilters();closeDetail();closeRoute();fitCoordinates([[55.59,37.35],[55.92,37.89]]);$('moscowButton').classList.add('selected');});
    $('sokolnikiButton').addEventListener('click',()=>focusSokolniki(true));$('nearbyButton').addEventListener('click',locateUser);
    $('searchInput').addEventListener('input',e=>{state.query=e.target.value;renderList();});
    $('districtSelect').addEventListener('change',e=>{state.district=e.target.value;state.nearby=null;renderList();const coords=places.filter(p=>state.district==='all'||p.district===state.district).map(p=>[p.lat,p.lng]);if(coords.length===1)flyToPlace(places.find(p=>p.district===state.district));else fitCoordinates(coords);});
    $('themeFilters').addEventListener('click',e=>{const t=e.target.closest('[data-theme]');if(!t)return;state.theme=t.dataset.theme;renderList();});
    $('openRoute').addEventListener('click',openRoute);$('pilotRoute').addEventListener('click',pilotRoute);
    $('headerCollection').addEventListener('click',()=>focusSokolniki(true));
    $('aboutExplore').addEventListener('click',()=>$('aboutDialog').close());
    $('mobileExpand').addEventListener('click',()=>$('explorer').classList.toggle('expanded'));
    document.querySelectorAll('dialog').forEach(d=>{d.querySelector('.close-modal').addEventListener('click',()=>d.close());d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});});
    document.querySelectorAll('[data-nav]').forEach(el=>el.addEventListener('click',()=>{if(el.dataset.nav==='about')$('aboutDialog').showModal();else if(el.dataset.nav==='routes')openRoute();else{closeDetail();closeRoute();$('explorer').classList.toggle('expanded',innerWidth<=760);setNav('map');}}));
    document.querySelector('.topbar .brand').addEventListener('click',e=>{e.preventDefault();showIntro();});
    document.addEventListener('keydown',e=>{if(!$('introScreen').hidden)return;if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();$('explorer').classList.add('expanded');$('searchInput').focus();}if(e.key==='Escape'&&!document.querySelector('dialog[open]')){closeDetail();closeRoute();$('explorer').classList.remove('expanded');}});
    document.addEventListener('click',e=>{
      const target=e.target.closest('button,a');if(!target)return;
      if(target.hasAttribute('data-story'))openStory(target.dataset.story);
      else if(target.hasAttribute('data-add'))toggleRoute(target.dataset.add);
      else if(target.hasAttribute('data-close-detail'))closeDetail();
      else if(target.hasAttribute('data-close-route'))closeRoute();
      else if(target.hasAttribute('data-reset'))resetFilters();
      else if(target.hasAttribute('data-bookmark')){const id=target.dataset.bookmark;state.bookmarks=state.bookmarks.includes(id)?state.bookmarks.filter(x=>x!==id):[...state.bookmarks,id];writeStore('dvor.bookmarks.v1',state.bookmarks);renderDetail();renderList();toast(state.bookmarks.includes(id)?'История сохранена. Найдёшь её в фильтре «Мои».':'История удалена из сохранённых');}
      else if(target.hasAttribute('data-share-story')){const u=new URL(location.href);u.search='';u.searchParams.set('story',target.dataset.shareStory);shareURL(u.href);}
      else if(target.hasAttribute('data-pilot'))pilotRoute();
      else if(target.hasAttribute('data-move'))moveStory(target.dataset.move,Number(target.dataset.direction));
      else if(target.hasAttribute('data-clear-route')){state.route=[];state.walking=false;persistRoute();renderList();renderDock();renderRoute();updateRouteGeometry();}
      else if(target.hasAttribute('data-save-route')){const points=routePlaces();const entry={name:points.length&&points.every(p=>p.district===points[0].district)?`Прогулка / ${points[0].district}`:'Моя Москва',ids:[...state.route],date:new Date().toISOString()};state.saved=[entry,...state.saved.filter(r=>r.ids.join(',')!==entry.ids.join(','))].slice(0,5);const ok=writeStore('dvor.saved.v1',state.saved);renderRoute();toast(ok?'Прогулка сохранена в этом браузере':'Хранилище недоступно. Сохрани прогулку ссылкой или GPX.');}
      else if(target.hasAttribute('data-load-route')){const saved=state.saved[Number(target.dataset.loadRoute)];if(!saved)return;state.route=sanitizeIds(saved.ids);state.walking=false;persistRoute();renderList();renderDock();renderRoute();updateRouteGeometry();fitCoordinates(routePlaces().map(p=>[p.lat,p.lng]));}
      else if(target.hasAttribute('data-share-route')){const u=new URL(location.href);u.search='';u.searchParams.set('route',state.route.join(','));shareURL(u.href);}
      else if(target.hasAttribute('data-export-route'))exportRoute();
      else if(target.hasAttribute('data-start-walk')){state.walking=!state.walking;state.walkIndex=0;renderRoute();if(state.walking){flyToPlace(placeById(storyById(state.route[0]).place));$('routePanel').scrollTop=0;toast('Прогулка началась. Открой текст истории в первой точке.');}}
      else if(target.hasAttribute('data-walk-step')){const next=state.walkIndex+Number(target.dataset.walkStep);if(next>=state.route.length){state.walking=false;renderRoute();toast('Прогулка завершена. Спасибо, что открыл истории города.');}else{state.walkIndex=Math.max(0,next);renderRoute();flyToPlace(placeById(storyById(state.route[state.walkIndex]).place));}}

    });

  }
  function enterMap(){
    const firstVisit=!appStarted;
    $('introScreen').hidden=true;$('introScreen').inert=true;
    $('siteHeader').hidden=false;$('siteHeader').inert=false;
    $('mapWorkspace').hidden=false;$('mapWorkspace').inert=false;
    if(firstVisit){
      appStarted=true;bindEvents();renderList();renderDock();
      const storyParam=new URL(location.href).searchParams.get('story');
      if(storyParam&&storyById(storyParam))openStory(storyParam);
      if(routeParam&&state.route.length)openRoute();
      else if(state.route.length)updateRouteGeometry();
    }
    if(!map)startMap();
    $('mapWorkspace').focus({preventScroll:true});
  }
  function showIntro(){
    closeDetail();closeRoute();state.walking=false;
    $('siteHeader').hidden=true;$('siteHeader').inert=true;
    $('mapWorkspace').hidden=true;$('mapWorkspace').inert=true;
    $('introScreen').hidden=false;$('introScreen').inert=false;
    const url=new URL(location.href);url.searchParams.delete('story');url.searchParams.delete('route');history.replaceState(null,'',url);
    $('enterMap').focus({preventScroll:true});
  }
  hydrate();
  [...new Set(places.map(p=>p.district))].forEach(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;$('districtSelect').append(option);});
  $('enterMap').addEventListener('click',enterMap);
  const sharedStory=new URL(location.href).searchParams.get('story');
  if(sharedStory&&storyById(sharedStory)||routeParam&&state.route.length)enterMap();
})();
