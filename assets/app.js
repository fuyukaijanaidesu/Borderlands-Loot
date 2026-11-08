(()=> {
 const $=id=>document.getElementById(id);
 const KEYS={newItems:"bl-loot-new-items-v1",progress:"bl-loot-progress-v1",settings:"bl-loot-settings-v1",history:"bl-loot-backups-v1",lastCatalog:"bl-loot-last-catalog-v1",override:"bl-loot-catalog-override-v1",forceOverride:"bl-loot-force-catalog-override-v1"};
 const GAMES=[["borderlands-1","Borderlands"],["borderlands-2","Borderlands 2"],["borderlands-tps","The Pre-Sequel"],["borderlands-3","Borderlands 3"],["wonderlands","Tiny Tina's Wonderlands"],["borderlands-4","Borderlands 4"]];
 let db={games:[],items:[]},done={},active="borderlands-4";
 const defaults={search:"",category:"",rarity:"",manufacturer:"",type:"",element:"",sort:"name",missing:false};
 let settings={...defaults},backupHistory=[];
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch{return fallback}};
 done=read(KEYS.progress,{});
 settings={...defaults,...read(KEYS.settings,{})};
 backupHistory=read(KEYS.history,[]);
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const ELEMENTS={
  fire:{icon:"🔥",label:"Огонь",className:"fire"},incendiary:{icon:"🔥",label:"Огонь",className:"fire"},
  shock:{icon:"⚡",label:"Шок",className:"shock"},electric:{icon:"⚡",label:"Шок",className:"shock"},lightning:{icon:"⚡",label:"Шок",className:"shock"},
  corrosive:{icon:"☣",label:"Коррозия",className:"corrosive"},poison:{icon:"☣",label:"Коррозия",className:"corrosive"},
  cryo:{icon:"❄",label:"Крио",className:"cryo"},ice:{icon:"❄",label:"Крио",className:"cryo"},frost:{icon:"❄",label:"Крио",className:"cryo"},
  radiation:{icon:"☢",label:"Радиация",className:"radiation"},
  explosive:{icon:"💥",label:"Взрыв",className:"explosive"},kinetic:{icon:"◉",label:"Кинетика",className:"kinetic"},
  slag:{icon:"✦",label:"Шлак",className:"slag"},"dark magic":{icon:"✧",label:"Тёмная магия",className:"dark-magic"}
 };
 const elementInfo=value=>ELEMENTS[String(value||"").toLowerCase().replace(/[-_]+/g," ").trim()]||{icon:"✧",label:value,className:"unknown"};
 const rarityClass=value=>{
  const raw=String(value||"unknown").toLowerCase().trim();
  const lootlemonCodes={"a-common":"common","b-uncommon":"uncommon","c-rare":"rare","d-epic":"epic","f-legendary":"legendary","g-seraph":"seraph","h-pearlescent":"pearlescent","i-effervescent":"effervescent","e-glitch":"glitch"};
  const normalized=lootlemonCodes[raw]||raw;
  return "rarity-"+normalized.replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
 };
 const games=()=>{let a=GAMES.map(([id,name])=>({id,name}));(db.games||[]).forEach(g=>{if(!a.some(x=>x.id===g.id))a.push(g)});return a};
 const items=()=>db.items.filter(x=>x.gameId===active&&!x.archived);
 const stats=a=>({n:a.filter(x=>done[x.id]).length,t:a.length});
 const persist=()=>{localStorage.setItem(KEYS.progress,JSON.stringify(done));localStorage.setItem(KEYS.settings,JSON.stringify(settings))};
 function snapshot(reason,catalog=null){
  const entry={version:2,at:new Date().toISOString(),reason,progress:{...done},settings:{...settings},catalogUpdatedAt:db.updatedAt||null,catalog:catalog||undefined};
  backupHistory.unshift(entry);backupHistory=backupHistory.slice(0,30);
  try{localStorage.setItem(KEYS.history,JSON.stringify(backupHistory))}catch(e){backupHistory=backupHistory.slice(0,10);try{localStorage.setItem(KEYS.history,JSON.stringify(backupHistory))}catch{}}
  return entry;
 }
 function download(name,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function restoreLastLocal(){
  const last=backupHistory.find(x=>x&&x.progress&&!["before-local-rollback","before-restore"].includes(x.reason));
  if(!last){alert("Локальных резервных копий пока нет.");return;}
  if(!confirm("Восстановить прогресс и настройки из копии от "+new Date(last.at).toLocaleString("ru-RU")+"?"))return;
  snapshot("before-local-rollback");done={...last.progress};settings={...defaults,...(last.settings||{})};persist();render();alert("Локальная копия восстановлена.");
 }
 function fullBackup(){
  snapshot("manual-full-backup");
  download("borderlands-loot-full-backup-"+new Date().toISOString().slice(0,10)+".json",{
   format:"borderlands-loot-full-backup",version:2,createdAt:new Date().toISOString(),
   catalog:db,progress:done,settings,history:backupHistory
  });
  persist();
 }
 function restoreBackup(data){
  if(data.backupVersion===1&&data.catalog&&Array.isArray(data.catalog.items)){snapshot("before-catalog-rollback");db=data.catalog;try{localStorage.setItem(KEYS.override,JSON.stringify(db));localStorage.setItem(KEYS.forceOverride,"true")}catch{}render();alert("Каталог из серверной резервной копии восстановлен. Прогресс и настройки сохранены.");return;}
  if(data.format==="borderlands-loot-progress"&&data.progress){
   snapshot("before-legacy-import");done={...data.progress};persist();render();alert("Прогресс импортирован.");return;
  }
  if(data.format!=="borderlands-loot-full-backup"||!data.progress||!data.catalog||!Array.isArray(data.catalog.items))throw Error("Файл не является полной резервной копией Borderlands Loot Tracker.");
  snapshot("before-restore");
  const preRestoreSnapshot=backupHistory[0];
  done={...data.progress};settings={...defaults,...(data.settings||{})};
  db=data.catalog;
  try{localStorage.setItem(KEYS.override,JSON.stringify(db));localStorage.setItem(KEYS.forceOverride,"true")}catch{alert("Каталог слишком большой для локального хранения. Прогресс и настройки восстановлены, каталог останется текущим.");}
  if(Array.isArray(data.history)) backupHistory=data.history.slice(0,29);
  if(preRestoreSnapshot) backupHistory=[preRestoreSnapshot,...backupHistory].slice(0,30);
  persist();render();alert("Полная резервная копия восстановлена.");
 }
 function render(){
  let gs=games(),g=gs.find(x=>x.id===active)||gs[0];if(!g)return;
  let a=items(),st=stats(a);
  renderNewItemsNotice();
  $("game-title").textContent=g.name;$("game-label").textContent=g.name.toUpperCase();$("game-desc").textContent="Каталог предметов";
  $("game-pct").textContent=(st.t?Math.round(st.n/st.t*100):0)+"%";$("game-count").textContent=st.n+" / "+st.t+" собрано";
  $("games").innerHTML=gs.map(x=>'<button data-game="'+esc(x.id)+'" class="'+(x.id===active?"active":"")+'">'+esc(x.name)+'</button>').join("");
  $("games").querySelectorAll("[data-game]").forEach(b=>b.onclick=()=>{active=b.dataset.game;render()});
  let cats=[...new Set(a.map(x=>x.category).filter(Boolean))].sort(),rs=[...new Set(a.map(x=>x.rarity).filter(Boolean))].sort();
  let makers=[...new Set(a.map(x=>x.manufacturer).filter(Boolean))].sort();
  let types=[...new Set(a.map(x=>x.type).filter(Boolean))].sort();
  let elements=[...new Set(a.flatMap(x=>x.elements||[]).filter(Boolean))].sort();
  const fillSelect=(id,values,placeholder)=>{const current=settings[id];$(id).innerHTML='<option value="">'+placeholder+'</option>'+values.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join("");$(id).value=values.includes(current)?current:"";};
  fillSelect("category",cats,"Все категории");fillSelect("rarity",rs,"Любая редкость");
  fillSelect("manufacturer",makers,"Любой производитель");fillSelect("type",types,"Любой тип");fillSelect("element",elements,"Любой элемент");
  $("search").value=settings.search;$("sort").value=settings.sort;$("missing").checked=!!settings.missing;
  let q=settings.search.toLowerCase().trim(),cat=$("category").value,rar=$("rarity").value;
  let maker=$("manufacturer").value,type=$("type").value,element=$("element").value;
  let shown=a.filter(x=>(!q||[x.name,x.category,x.manufacturer,x.type,x.description,(x.elements||[]).join(" "), (x.sources||[]).join(" "),...(x.tags||[]),...Object.values(x.attributes||{}).flat()].join(" ").toLowerCase().includes(q))&&(!cat||x.category===cat)&&(!rar||x.rarity===rar)&&(!maker||x.manufacturer===maker)&&(!type||x.type===type)&&(!element||(x.elements||[]).includes(element))&&(!settings.missing||!done[x.id]));
  shown.sort((x,y)=>{
   const collected=Number(!!done[x.id])-Number(!!done[y.id]);
   if(collected)return collected;
   if(settings.sort==="category")return (x.category||"").localeCompare(y.category||"")||x.name.localeCompare(y.name);
   if(settings.sort==="rarity")return (x.rarity||"").localeCompare(y.rarity||"")||x.name.localeCompare(y.name);
   return x.name.localeCompare(y.name);
  });
  $("shown").textContent=shown.length+" из "+a.length+" предметов";$("updated").textContent=db.updatedAt?"Обновлено: "+new Date(db.updatedAt).toLocaleDateString("ru-RU"):"Источник: Lootlemon";
  $("items").innerHTML=shown.map(x=>'<article class="item '+(done[x.id]?"collected":"")+'"><div class="picture">'+(x.image?'<img loading="lazy" src="'+esc(x.image)+'" alt="'+esc(x.name)+'" onerror="this.remove()">':'<span class="placeholder">◇</span>')+'</div><div class="card-body"><div class="cat">'+esc(x.category||"Предмет")+'</div><div class="name '+rarityClass(x.rarity)+'">'+esc(x.name)+'</div><div class="tags">'+[x.rarity,x.manufacturer,x.type,x.content,...(x.tags||[]),...Object.values(x.attributes||{}).flat()].filter((v,i,a)=>a.indexOf(v)===i).filter(Boolean).map(v=>'<span class="tag">'+esc(v)+'</span>').join("")+'</div>'+(x.elements&&x.elements.length?'<div class="element-icons" aria-label="Стихии">'+x.elements.map(el=>{const info=elementInfo(el);return '<span class="element-icon element-'+esc(info.className)+'" title="'+esc(info.label)+'" aria-label="'+esc(info.label)+'"><i>'+info.icon+'</i><small>'+esc(el)+'</small></span>'}).join("")+'</div>':'')+'<div class="item-foot">'+(x.url?'<a href="'+esc(x.url)+'" target="_blank" rel="noopener">Lootlemon ↗</a>':'<span></span>')+'<button data-id="'+esc(x.id)+'" class="'+(done[x.id]?"done":"")+'">'+(done[x.id]?"✓ Собрано":"+ Собрал")+'</button></div></div></article>').join("");
  $("items").querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{let id=b.dataset.id;if(done[id])delete done[id];else done[id]=true;persist();render()});
  $("empty").hidden=shown.length>0;
  let all=db.items.filter(x=>!x.archived),total=stats(all),pct=total.t?Math.round(total.n/total.t*100):0;
  $("all-pct").textContent=pct+"%";$("all-bar").style.width=pct+"%";$("all-count").textContent=total.n+" из "+total.t+" предметов";
 }
 function renderNewItemsNotice(){
  const notice=$("new-items-notice");if(!notice)return;
  const pending=read(KEYS.newItems,[]);
  if(!pending.length){notice.hidden=true;return;}
  notice.hidden=false;
  const names=pending.slice(0,5).map(x=>x.name);
  const rest=pending.length>5?" и ещё "+(pending.length-5):"";
  notice.innerHTML='<span><b>Новый лут в каталоге: '+pending.length+'</b> — '+names.map(esc).join(", ")+rest+'</span><button type="button" id="dismiss-new-items" aria-label="Скрыть уведомление">×</button>';
  $("dismiss-new-items").onclick=()=>{localStorage.removeItem(KEYS.newItems);notice.hidden=true;};
 }
 function bindSettings(){
  $("search").addEventListener("input",()=>{settings.search=$("search").value;persist();render()});
  ["category","rarity","manufacturer","type","element","sort","missing"].forEach(id=>$(id).addEventListener("change",()=>{settings[id]=id==="missing"?$("missing").checked:$(id).value;persist();render()}));
 }
 $("export").onclick=fullBackup;
 $("restore-local").onclick=restoreLastLocal;
 $("import").onchange=async e=>{try{const f=e.target.files[0];if(!f)return;restoreBackup(JSON.parse(await f.text()))}catch(err){alert(err.message)}e.target.value="";};
 bindSettings();
 (async()=>{
  try{
   const localOverride=read(KEYS.override,null);
   const response=await fetch("data/catalog.json",{cache:"no-store"});if(!response.ok)throw Error("catalog fetch failed");
   const fresh=await response.json();
   const previous=read(KEYS.lastCatalog,null);
   const forced=localStorage.getItem(KEYS.forceOverride)==="true";
   if(forced&&previous&&fresh.updatedAt===previous.updatedAt&&localOverride){db=localOverride;}
   else{
    if(forced)localStorage.removeItem(KEYS.forceOverride);
    if(previous&&Array.isArray(previous.items)){
     const known=new Set(previous.items.map(x=>x.id));
     const added=fresh.items.filter(x=>!known.has(x.id)&&!x.archived).map(x=>({id:x.id,name:x.name,gameId:x.gameId,category:x.category,rarity:x.rarity}));
     if(added.length){const pending=read(KEYS.newItems,[]),pendingIds=new Set(pending.map(x=>x.id));localStorage.setItem(KEYS.newItems,JSON.stringify([...added.filter(x=>!pendingIds.has(x.id)),...pending].slice(0,100)));}
    }
    if(previous&&previous.updatedAt&&fresh.updatedAt&&previous.updatedAt!==fresh.updatedAt)snapshot("automatic-before-catalog-sync");
    db=fresh;
   }
   try{localStorage.setItem(KEYS.lastCatalog,JSON.stringify(fresh))}catch{}
   $("status").textContent="Каталог загружен";
  }catch{
   db=read(KEYS.override,null)||{games:GAMES.map(([id,name])=>({id,name})),items:[]};
   $("status").textContent="Не удалось обновить каталог";
  }
  persist();render();
 })();
})();