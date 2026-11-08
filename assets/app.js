(()=> {
 const $=id=>document.getElementById(id);
 const KEYS={newItems:"bl-loot-new-items-v1",progress:"bl-loot-progress-v1",settings:"bl-loot-settings-v1",history:"bl-loot-backups-v1",lastCatalog:"bl-loot-last-catalog-v1",override:"bl-loot-catalog-override-v1",forceOverride:"bl-loot-force-catalog-override-v1"};
 const GAMES=[["borderlands-1","Borderlands"],["borderlands-2","Borderlands 2"],["borderlands-tps","The Pre-Sequel"],["borderlands-3","Borderlands 3"],["wonderlands","Tiny Tina's Wonderlands"],["borderlands-4","Borderlands 4"]];
 let db={games:[],items:[]},done={},active="borderlands-4";
 const defaults={search:"",category:"",filters:{},sort:"name",missing:false};
 let settings={...defaults},backupHistory=[];
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch{return fallback}};
 done=read(KEYS.progress,{});
 settings={...defaults,...read(KEYS.settings,{})};
 if(!["name","rarity","content"].includes(settings.sort))settings.sort="name";
 settings.filters=settings.filters||{};
 backupHistory=read(KEYS.history,[]);
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const ELEMENTS={
  fire:{icon:"🔥",label:"Fire",className:"fire"},incendiary:{icon:"🔥",label:"Fire",className:"fire"},
  shock:{icon:"⚡",label:"Shock",className:"shock"},electric:{icon:"⚡",label:"Shock",className:"shock"},lightning:{icon:"⚡",label:"Shock",className:"shock"},
  corrosive:{icon:"☣",label:"Corrosive",className:"corrosive"},poison:{icon:"☣",label:"Corrosive",className:"corrosive"},
  cryo:{icon:"❄",label:"Cryo",className:"cryo"},ice:{icon:"❄",label:"Cryo",className:"cryo"},frost:{icon:"❄",label:"Cryo",className:"cryo"},
  radiation:{icon:"☢",label:"Radiation",className:"radiation"},
  explosive:{icon:"💥",label:"Explosive",className:"explosive"},kinetic:{icon:"◉",label:"Kinetic",className:"kinetic"},
  slag:{icon:"✦",label:"Slag",className:"slag"},"dark magic":{icon:"✧",label:"Dark Magic",className:"dark-magic"}
 };
 const elementInfo=value=>ELEMENTS[String(value||"").toLowerCase().replace(/[-_]+/g," ").trim()]||{icon:"✧",label:value,className:"unknown"};
 const rarityClass=value=>{
  const raw=String(value&&typeof value==="object"?(value.name||value.label||value.value||""):value||"").toLowerCase().trim();
  const slug=raw.replaceAll("_","-").replaceAll(" ","-").replace(/-+/g,"-");
  let rarity="unknown";
  if(raw.includes("uncommon")||raw.includes("b-uncommon"))rarity="uncommon";
  else if(raw.includes("common")||raw.includes("a-common"))rarity="common";
  else if(raw.includes("legendary")||raw.includes("f-legendary"))rarity="legendary";
  else if(raw.includes("pearlescent")||raw.includes("h-pearlescent"))rarity="pearlescent";
  else if(raw.includes("effervescent")||raw.includes("i-effervescent"))rarity="effervescent";
  else if(raw.includes("seraph")||raw.includes("g-seraph"))rarity="seraph";
  else if(raw.includes("glitch")||raw.includes("e-glitch"))rarity="glitch";
  else if(raw.includes("e-tech")||raw.includes("etech"))rarity="e-tech";
  else if(raw.includes("epic")||raw.includes("d-epic"))rarity="epic";
  else if(raw.includes("rare")||raw.includes("c-rare"))rarity="rare";
  else if(raw.includes("radiant"))rarity="radiant";
  else if(slug&&slug!=="unknown")rarity=slug;
  return "rarity-"+rarity;
 };
 const games=()=>{let a=GAMES.map(([id,name])=>({id,name}));(db.games||[]).forEach(g=>{if(!a.some(x=>x.id===g.id))a.push(g)});return a};
 const items=()=>db.items.filter(x=>x.gameId===active&&!x.archived);
 const stats=a=>({n:a.filter(x=>done[x.id]).length,t:a.length});
 const asList=value=>value==null?[]:(Array.isArray(value)?value:[value]).flat(Infinity).map(v=>String(v??"").trim()).filter(Boolean);
 const contentValues=item=>asList(item.content);
 const contentOf=item=>contentValues(item)[0]||"";
 const sourcesOf=item=>asList(item.sources);
 const rarityLabel=value=>{
  const raw=String(value&&typeof value==="object"?(value.name||value.label||value.value||""):value||"").trim();
  const key=raw.toLowerCase().replace(/^[a-i]-/,"").replace(/[-_]+/g," ").trim();
  const known={"common":"Common","uncommon":"Uncommon","rare":"Rare","epic":"Epic","legendary":"Legendary","seraph":"Seraph","pearlescent":"Pearlescent","effervescent":"Effervescent","glitch":"Glitch","e tech":"E-Tech","etech":"E-Tech","radiant":"Radiant"};
  return known[key]||raw.replace(/^[a-i]-/i,"").replace(/[-_]+/g," ").replace(/\b\w/g,c=>c.toUpperCase());
 };
 const uniqueValues=values=>[...new Set(values.map(v=>String(v??"").trim()).filter(Boolean))];

 const normalized=value=>String(value??"").trim().toLocaleLowerCase();
 const FIELD_LABELS={rarity:"Rarity",name:"Name",type:"Type",manufacturer:"Manufacturer",elements:"Elements",content:"Content",sources:"Sources",class:"Class",skills:"Skills",tree:"Trees",spell_cast:"Spell Cast",item_type:"Type",item_category:"Category"};
 const FILTER_LABELS={rarity:"Any rarity",manufacturer:"Any manufacturer",type:"Any type",elements:"Any element",content:"All content",class:"Any class",tree:"Any tree",item_type:"Any item type",item_category:"Any category",spell_cast:"Any spell cast"};
 const SCHEMAS={
  "borderlands-1":{
   "Weapons":{fields:["rarity","name",{key:"type",label:"Weapon Type"},"manufacturer","elements","content","sources"],filters:["rarity","elements","type","manufacturer","content"]},
   "Shields":{fields:["rarity","name",{key:"type",label:"Shield Type"},"manufacturer","elements","content","sources"],filters:["rarity","type","manufacturer","elements","content"]},
   "Grenades":{fields:["rarity","name",{key:"type",label:"Grenade Type"},"manufacturer","elements","content","sources"],filters:["rarity","type","manufacturer"]},
   "Class Mods":{fields:["rarity","name","class","skills","manufacturer","content","sources"],filters:["class","tree","content"]}
  },
  "borderlands-2":{
   "Weapons":{fields:["rarity","name",{key:"type",label:"Weapon Type"},"manufacturer","elements","content","sources"],filters:["rarity","elements","type","manufacturer","content"]},
   "Shields":{fields:["rarity","name",{key:"type",label:"Shield Type"},"manufacturer","elements","content","sources"],filters:["rarity","elements","type","manufacturer","content"]},
   "Grenade Mods":{fields:["rarity","name",{key:"type",label:"Grenade Type"},"manufacturer","elements","content","sources"],filters:["rarity","elements","type","manufacturer","content"]},
   "Class Mods":{fields:["rarity","name","class","skills","manufacturer","content","sources"],filters:["class","tree","rarity","content"]},
   "Relics":{fields:["rarity","name",{key:"type",label:"Relic Type"},"content","sources"],filters:["rarity","type","content"]}
  },
  "borderlands-tps":{
   "Weapons":{fields:["rarity","name",{key:"type",label:"Weapon Type"},"manufacturer","elements","content","sources"],filters:["rarity","elements","type","manufacturer","content"]},
   "Shields":{fields:["rarity","name",{key:"type",label:"Shield Type"},"manufacturer","elements","content","sources"],filters:["rarity","elements","type","manufacturer","content"]},
   "Grenades":{fields:["rarity","name",{key:"type",label:"Grenade Type"},"manufacturer","elements","content","sources"],filters:["rarity","elements","type","manufacturer","content"]},
   "Class Mods":{fields:["rarity","name","class","skills","manufacturer","content","sources"],filters:["class","tree","rarity","content"]},
   "Oz Kits":{fields:["rarity","name",{key:"type",label:"Oz Kit Type"},"elements","content","sources"],filters:["rarity","type","elements"]}
  },
  "borderlands-3":{
   "Weapons":{fields:["rarity","name",{key:"type",label:"Weapon Type"},"manufacturer","elements","content","sources"],filters:["rarity","elements","type","manufacturer","content"]},
   "Shields":{fields:["rarity","name",{key:"type",label:"Shield Type"},"manufacturer","elements","content","sources"],filters:["rarity","manufacturer","elements","type","content"]},
   "Grenade Mods":{fields:["rarity","name",{key:"type",label:"Grenade Type"},"manufacturer","elements","content","sources"],filters:["rarity","elements","type","manufacturer","content"]},
   "Class Mods":{fields:["rarity","name","class","skills","content","sources"],filters:["class","tree","rarity","content"]},
   "Artifacts":{fields:["rarity","name",{key:"type",label:"Artifact Type"},"content","sources"],filters:["rarity","type","content"]}
  },
  "wonderlands":{
   "Weapons":{fields:["rarity","name",{key:"type",label:"Weapon Type"},"manufacturer","elements","content","sources"],filters:["rarity","elements","type","manufacturer","content"]},
   "Wards":{fields:["rarity","name",{key:"type",label:"Ward Type"},"manufacturer","elements","content","sources"],filters:["rarity","manufacturer","elements","type","content"]},
   "Spells":{fields:["rarity","name","spell_cast","manufacturer","elements","content","sources"],filters:["rarity","elements","spell_cast","manufacturer","content"]},
   "Armor":{fields:["rarity","name","manufacturer","content","sources"],filters:["rarity","manufacturer","content"]},
   "Rings & Amulets":{fields:["rarity","name","item_category","content","sources"],filters:["rarity","item_type","item_category","content"]}
  },
  "borderlands-4":{
   "Weapons":{fields:["rarity","name",{key:"type",label:"Weapon Type"},"manufacturer","elements","content","sources"],filters:["rarity","elements","type","manufacturer","content"]},
   "Shields":{fields:["rarity","name",{key:"type",label:"Shield Type"},"manufacturer","elements","content","sources"],filters:["type","elements","manufacturer","content"]},
   "Ordnance":{fields:["rarity","name",{key:"type",label:"Ordnance Type"},"manufacturer","elements","content","sources"],filters:["type","elements","manufacturer","content"]},
   "Repkits":{fields:["rarity","name","manufacturer","content","sources"],filters:["manufacturer","content"]},
   "Class Mods":{fields:["rarity","name","class","skills","content","sources"],filters:["class","tree","content"]},
   "Enhancements":{fields:["rarity","name","manufacturer","content","sources"],filters:["manufacturer"]}
  }
 };
 const TREE_INDEX_LABELS={
  "borderlands-1":{"0":"Blue","1":"Red","2":"Green"},
  "borderlands-2":{"0":"Green","1":"Blue","2":"Red"},
  "borderlands-tps":{"0":"Green","1":"Blue","2":"Red"},
  "borderlands-3":{"0":"Green","1":"Blue","2":"Red","3":"Purple"},
  "borderlands-4":{"0":"Green","1":"Blue","2":"Red"}
 };
 const attrValues=(item,key)=>asList(item?.attributes?.[key]??[]);
 const fieldValues=(item,key)=>{
  if(key==="rarity")return item.rarity?[rarityLabel(item.rarity)]:[];
  if(key==="name")return asList(item.name);
  if(key==="elements")return asList(item.elements);
  if(key==="sources")return sourcesOf(item);
  if(key==="content")return contentValues(item);
  if(key==="manufacturer")return asList(item.manufacturer).length?asList(item.manufacturer):attrValues(item,"manufacturer");
  if(key==="type")return asList(item.type).length?asList(item.type):["weapon_type","shield_type","ordnance_type","artifact_type","type"].flatMap(k=>attrValues(item,k));
  if(key==="class")return asList(item.class).length?asList(item.class):attrValues(item,"class");
  if(key==="skills")return asList(item.skills).length?asList(item.skills):[...attrValues(item,"skill"),...attrValues(item,"skills")];
  if(key==="tree")return [...attrValues(item,"tree"),...attrValues(item,"trees")].map(value=>TREE_INDEX_LABELS[item.gameId]?.[value]||value);
  if(key==="spell_cast")return asList(item.spell_cast).length?asList(item.spell_cast):(item.gameId==="wonderlands"?asList(item.type):attrValues(item,"spell_cast"));
  if(key==="item_type"){
   const values=asList(item.item_type).length?asList(item.item_type):attrValues(item,"item_type");
   return values.length?values:asList(item.type).filter(value=>["Ring","Amulet"].includes(value));
  }
  if(key==="item_category"){
   const values=asList(item.item_category).length?asList(item.item_category):attrValues(item,"item_category");
   return values.length?values:(item.category==="Rings & Amulets"?asList(item.type).filter(value=>!["Ring","Amulet"].includes(value)):[]);
  }
  return attrValues(item,key);
 };
 const schemaFor=(game,category)=>{
  const known=SCHEMAS[game]?.[category];if(known)return known;
  const fields=["rarity","name"];
  if(category==="Weapons")fields.push({key:"type",label:"Weapon Type"},"manufacturer","elements","content","sources");
  else if(category==="Shields")fields.push({key:"type",label:"Shield Type"},"manufacturer","elements","content","sources");
  else if(["Grenades","Grenade Mods","Ordnance","Wards","Spells","Spellbooks","Melee Weapons"].includes(category))fields.push({key:"type",label:({Grenades:"Grenade Type","Grenade Mods":"Grenade Type",Ordnance:"Ordnance Type",Wards:"Ward Type",Spells:"Spell Type",Spellbooks:"Spell Type","Melee Weapons":"Weapon Type"})[category]},"manufacturer","elements","content","sources");
  else if(category==="Class Mods")fields.push("class","skills","content","sources");
  else if(category==="Artifacts"||category==="Relics")fields.push({key:"type",label:category==="Artifacts"?"Artifact Type":"Relic Type"},"content","sources");
  else if(category==="Armor")fields.push("manufacturer","content","sources");
  else if(category==="Rings & Amulets")fields.push("item_category","content","sources");
  else if(category==="Oz Kits")fields.push({key:"type",label:"Oz Kit Type"},"elements","content","sources");
  else if(category==="Repkits"||category==="Enhancements")fields.push("manufacturer","content","sources");
  else fields.push("manufacturer","content","sources");
  return {fields,filters:fields.map(f=>typeof f==="string"?f:f.key).filter(k=>!["name","skills","sources"].includes(k))};
 };
 const fieldDefinition=value=>typeof value==="string"?{key:value,label:FIELD_LABELS[value]||value}:value;
 const fieldFilterLabel=key=>FILTER_LABELS[key]||("Any "+(FIELD_LABELS[key]||key).toLowerCase());

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
  let allGameItems=items(),st=stats(allGameItems),categories=uniqueValues(allGameItems.map(x=>x.category)).sort();
  if(!categories.includes(settings.category))settings.category=categories.includes("Weapons")?"Weapons":(categories[0]||"");
  let a=allGameItems.filter(x=>x.category===settings.category);
  renderNewItemsNotice();
  $("game-title").textContent=g.name;$("game-label").textContent=g.name.toUpperCase();$("game-desc").textContent="Каталог предметов";
  $("game-pct").textContent=(st.t?Math.round(st.n/st.t*100):0)+"%";$("game-count").textContent=st.n+" / "+st.t+" собрано";
  $("games").innerHTML=gs.map(x=>'<button data-game="'+esc(x.id)+'" class="'+(x.id===active?"active":"")+'">'+esc(x.name)+'</button>').join("");
  $("games").querySelectorAll("[data-game]").forEach(b=>b.onclick=()=>{active=b.dataset.game;render()});

  const category=settings.category||"",schema=schemaFor(active,category),filterDefs=schema.filters.map(key=>({key,label:fieldFilterLabel(key)}));
  $("category").innerHTML=categories.map(value=>'<option value="'+esc(value)+'"'+(value===category?' selected':'')+'>'+esc(value)+'</option>').join("");
  const filtersState=settings.filters||(settings.filters={});
  const optionsFor=key=>uniqueValues(a.flatMap(item=>fieldValues(item,key))).sort((x,y)=>x.localeCompare(y));
  $("dynamic-filters").innerHTML=filterDefs.map(def=>{
   const values=optionsFor(def.key),current=filtersState[def.key]||"",selected=values.includes(current)?current:"";
   filtersState[def.key]=selected;
   return '<select data-filter="'+esc(def.key)+'"><option value="">'+esc(def.label)+'</option>'+values.map(value=>'<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(value)+'</option>').join("")+'</select>';
  }).join("");
  $("search").value=settings.search;$("sort").value=settings.sort;$("missing").checked=!!settings.missing;
  const selectedFilters=Object.entries(filtersState).filter(([key,value])=>value&&filterDefs.some(def=>def.key===key));
  let q=settings.search.toLowerCase().trim();
  let shown=a.filter(x=>{
   const searchable=[x.name,x.category,x.description,...schema.fields.flatMap(f=>fieldValues(x,fieldDefinition(f).key)),...asList(x.tags),...Object.values(x.attributes||{}).flat()].join(" ").toLowerCase();
   return (!q||searchable.includes(q))&&selectedFilters.every(([key,value])=>fieldValues(x,key).some(v=>normalized(v)===normalized(value)))&&(!settings.missing||!done[x.id]);
  });
  shown.sort((x,y)=>{
   if(settings.sort==="rarity")return rarityLabel(x.rarity).localeCompare(rarityLabel(y.rarity))||x.name.localeCompare(y.name);
   if(settings.sort==="content"){const rank=v=>/^base game$/i.test(v)?0:/^event$/i.test(v)?1:2;return rank(contentOf(x))-rank(contentOf(y))||contentOf(x).localeCompare(contentOf(y))||x.name.localeCompare(y.name)}
   return x.name.localeCompare(y.name);
  });
  $("shown").textContent=shown.length+" из "+a.length+" предметов";$("updated").textContent=db.updatedAt?"Обновлено: "+new Date(db.updatedAt).toLocaleDateString("ru-RU"):"Источник: Lootlemon";

  const renderValue=(item,def)=>{
   const key=def.key,values=fieldValues(item,key);if(!values.length)return '<div class="loot-field is-empty" aria-hidden="true"><span>'+esc(def.label)+'</span><b>—</b></div>';
   if(key==="elements")return '<div class="loot-field"><span>'+esc(def.label)+'</span><div class="element-icons">'+values.map(value=>{const info=elementInfo(value);return '<span class="element-icon element-'+esc(info.className)+'" title="'+esc(info.label)+'"><i>'+info.icon+'</i><small>'+esc(info.label)+'</small></span>'}).join("")+'</div></div>';
   if(key==="sources")return '<div class="loot-field"><span>'+esc(def.label)+'</span><div class="drop-source-list">'+values.map(value=>'<span class="drop-source">'+esc(value)+'</span>').join("")+'</div></div>';
   if(key==="skills")return '<div class="loot-field"><span>'+esc(def.label)+'</span><div class="skill-list">'+values.map(value=>'<span class="skill-chip">'+esc(value)+'</span>').join("")+'</div></div>';
   const value=key==="rarity"?rarityLabel(values[0]):values.join(", ");
   return '<div class="loot-field field-'+esc(key)+' '+(key==="rarity"?"rarity-field":"")+'"><span>'+esc(def.label)+'</span><b class="'+(key==="rarity"?rarityClass(item.rarity):"")+'">'+esc(value)+'</b></div>';
  };
  $("items").innerHTML=shown.map(x=>{
   const schema=schemaFor(active,x.category||""),fields=schema.fields.map(fieldDefinition);
   const details=fields.filter(f=>f.key!=="name").map(f=>renderValue(x,f)).join("");
   return '<article class="item '+(done[x.id]?"collected":"")+'"><div class="picture">'+(x.image?'<img loading="lazy" src="'+esc(x.image)+'" alt="'+esc(x.name)+'" onerror="this.remove()">':'<span class="placeholder">◇</span>')+'</div><div class="card-body"><div class="name '+rarityClass(x.rarity)+'">'+esc(x.name)+'</div>'+details+'<div class="item-foot">'+(x.url?'<a href="'+esc(x.url)+'" target="_blank" rel="noopener">Lootlemon ↗</a>':'<span></span>')+(x.code?'<button type="button" class="copy-code" data-copy-code="'+esc(x.code)+'">Copy Code</button>':'')+'<button type="button" data-id="'+esc(x.id)+'" class="collect-button '+(done[x.id]?"done":"")+'">'+(done[x.id]?"Collected":"Collect")+'</button></div></div></article>';
  }).join("");
  $("items").querySelectorAll(".collect-button[data-id]").forEach(b=>b.onclick=()=>{let id=b.dataset.id;if(done[id])delete done[id];else done[id]=true;persist();render()});
  $("items").querySelectorAll("[data-copy-code]").forEach(button=>button.addEventListener("click",event=>{event.stopPropagation();copyItemCode(button)}));
  $("empty").hidden=shown.length>0;
  let all=db.items.filter(x=>!x.archived),total=stats(all),pct=total.t?Math.round(total.n/total.t*100):0;
  $("all-pct").textContent=pct+"%";$("all-bar").style.width=pct+"%";$("all-count").textContent=total.n+" из "+total.t+" предметов";
 }
 async function copyItemCode(button){
  const code=button.dataset.copyCode;
  if(!code)return;
  try{
   if(navigator.clipboard&&navigator.clipboard.writeText){
    await navigator.clipboard.writeText(code);
   }else{
    const field=document.createElement("textarea");
    field.value=code;field.setAttribute("readonly","");field.style.position="fixed";field.style.opacity="0";
    document.body.appendChild(field);field.select();
    const copied=document.execCommand("copy");field.remove();
    if(!copied)throw Error("Clipboard unavailable");
   }
   button.textContent="Copied!";
   button.classList.add("copied");
   setTimeout(()=>{if(button.isConnected){button.textContent="Copy Code";button.classList.remove("copied")}},1600);
  }catch{
   button.textContent="Copy failed";
   setTimeout(()=>{if(button.isConnected)button.textContent="Copy Code"},1600);
  }
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
  $("category").addEventListener("change",()=>{settings.category=$("category").value;settings.filters={};persist();render()});
  $("dynamic-filters").addEventListener("change",event=>{const select=event.target.closest("[data-filter]");if(!select)return;settings.filters=settings.filters||{};settings.filters[select.dataset.filter]=select.value;persist();render()});
  ["sort","missing"].forEach(id=>$(id).addEventListener("change",()=>{settings[id]=id==="missing"?$("missing").checked:$(id).value;persist();render()}));
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