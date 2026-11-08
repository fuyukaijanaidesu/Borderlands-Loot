const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {JSDOM}=require("jsdom");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"assets/app.js"),"utf8");
const catalog={updatedAt:"2026-11-08T01:22:03.181332+00:00",games:[],items:[
 {id:"weapon-1",gameId:"borderlands-4",category:"Weapons",name:"Alpha Rifle",rarity:"f-legendary",manufacturer:"Dahl",type:"Assault Rifle",elements:["Fire"],content:"Base Game",sources:["Boss A"],archived:false},
 {id:"weapon-2",gameId:"borderlands-4",category:"Weapons",name:"Second Shotgun",rarity:"d-epic",manufacturer:"Maliwan",type:"Shotgun",elements:["Shock"],content:"Base Game",sources:["Boss B"],archived:false},
 {id:"shield-1",gameId:"borderlands-4",category:"Shields",name:"Beta Shield",rarity:"d-epic",manufacturer:"Maliwan",type:"Shield Generator",elements:["Shock"],content:"Base Game",sources:["Boss C"],archived:false},
 {id:"classmod-1",gameId:"borderlands-4",category:"Class Mods",name:"Gamma Mod",rarity:"f-legendary",class:"Amon",skills:["Bullet Hail","Wildfire"],attributes:{tree:["Green"]},content:"Base Game",sources:["Boss D"],archived:false},
 {id:"artifact-1",gameId:"borderlands-3",category:"Artifacts",name:"Delta Artifact",rarity:"Pearlescent",type:"Artifact",content:"DLC 1",sources:["Boss E"],archived:false},
 {id:"bl1-grenade",gameId:"borderlands-1",category:"Grenades",name:"Bouncing Bettie",rarity:"Rare",type:"Bouncing Betty",manufacturer:"DAHL",elements:["Fire"],content:"Base Game",sources:["Grenade Pool"],archived:false},
 {id:"bl1-class",gameId:"borderlands-1",category:"Class Mods",name:"Test BL1 Mod",rarity:"Epic",class:"Brick",skills:["Endowed"],manufacturer:"Torgue",content:"Base Game",sources:["Brick Pool"],attributes:{tree:["0","2"]},archived:false},
 {id:"bl2-grenade",gameId:"borderlands-2",category:"Grenade Mods",name:"Bonus Package",rarity:"Legendary",type:"MIRV",manufacturer:"Torgue",elements:["Explosive"],content:"Base Game",sources:["Boom and Bewm"],archived:false},
 {id:"bl2-relic",gameId:"borderlands-2",category:"Relics",name:"Blood of Terramorphous",rarity:"Legendary",type:"Survivability",content:"Base Game",sources:["Terramorphous"],archived:false},
 {id:"tps-oz",gameId:"borderlands-tps",category:"Oz Kits",name:"3DD1.E",rarity:"Rare",type:"Survivability",elements:["Explosive"],content:"Base Game",sources:["CL4P-L3K"],archived:false},
 {id:"wl-armor",gameId:"wonderlands",category:"Armor",name:"Amalgam",rarity:"Legendary",manufacturer:"Swifft",content:"Base Game",sources:["Monstrous Shroom"],archived:false},
 {id:"wl-spell",gameId:"wonderlands",category:"Spells",name:"Arcane Bolt",rarity:"Legendary",type:"Simple",manufacturer:"Conjura",elements:["Lightning"],content:"Base Game",sources:["Chaos Chamber"],archived:false},
 {id:"wl-ring",gameId:"wonderlands",category:"Rings & Amulets",name:"Test Ring",rarity:"Legendary",item_type:"Ring",item_category:"Offense",content:"Base Game",sources:["Ring Pool"],archived:false},
 {id:"wl-amulet",gameId:"wonderlands",category:"Rings & Amulets",name:"Test Amulet",rarity:"Legendary",item_type:"Amulet",item_category:"Universal",content:"Base Game",sources:["Amulet Pool"],archived:false}
]};
async function boot(seed={}){
 const dom=new JSDOM(html,{url:"https://tracker.test/",runScripts:"outside-only",pretendToBeVisual:true}),w=dom.window;
 w.fetch=async()=>({ok:true,json:async()=>structuredClone(catalog)});w.confirm=()=>true;w.alert=()=>{};
 w.URL.createObjectURL=()=>"blob:test";w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 for(const [key,value] of Object.entries(seed))w.localStorage.setItem(key,JSON.stringify(value));
 vm.runInContext(app,dom.getInternalVMContext());
 for(let i=0;i<50&&w.document.getElementById("status").textContent!=="Каталог загружен";i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(w.document.getElementById("status").textContent,"Каталог загружен");
 return {dom,w,doc:w.document,close:()=>dom.window.close()};
}
const change=(el,w)=>el.dispatchEvent(new w.Event("change",{bubbles:true}));
const chooseCategory=(x,name)=>{const el=x.doc.getElementById("category");el.value=name;change(el,x.w)};
const chooseFilter=(x,key,value)=>{const el=x.doc.querySelector('[data-filter="'+key+'"]');assert.ok(el,"missing filter "+key);el.value=value;change(el,x.w)};

test("initial view selects Weapons and keeps game-wide counters",async()=>{const x=await boot();try{
 assert.equal(x.doc.getElementById("category").value,"Weapons");
 assert.equal(x.doc.querySelectorAll("#items .item").length,2);
 assert.equal(x.doc.getElementById("game-count").textContent,"0 / 4 собрано");
 assert.equal(x.doc.getElementById("all-count").textContent,"0 из 5 предметов");
 assert.deepEqual([...x.doc.querySelectorAll("#dynamic-filters select")].map(e=>e.dataset.filter),["rarity","elements","type","manufacturer","content"]);
}finally{x.close()}});
test("each category has its own fields and filters",async()=>{const x=await boot();try{
 chooseCategory(x,"Shields");
 assert.deepEqual([...x.doc.querySelectorAll("#dynamic-filters select")].map(e=>e.dataset.filter),["type","elements","manufacturer","content"]);
 assert.match(x.doc.querySelector("#items").textContent,/Shield Type/);
 assert.doesNotMatch([...x.doc.querySelectorAll("#dynamic-filters select")].map(e=>e.dataset.filter).join(","),/rarity/);
 chooseCategory(x,"Class Mods");
 assert.deepEqual([...x.doc.querySelectorAll("#dynamic-filters select")].map(e=>e.dataset.filter),["class","tree","content"]);
 assert.match(x.doc.querySelector("#items").textContent,/Skills/);
 assert.match(x.doc.querySelector("#items").textContent,/Bullet Hail/);
 assert.match(x.doc.querySelector("#items").textContent,/Amon/);
}finally{x.close()}});
test("legacy games and Wonderlands use category-specific Lootlemon schemas",async()=>{const x=await boot();try{
 x.doc.querySelector('#games [data-game="borderlands-1"]').click();
 chooseCategory(x,"Grenades");
 assert.deepEqual([...x.doc.querySelectorAll("#dynamic-filters select")].map(e=>e.dataset.filter),["rarity","type","manufacturer"]);
 assert.match(x.doc.querySelector("#items").textContent,/Grenade Type/);
 chooseCategory(x,"Class Mods");
 assert.deepEqual([...x.doc.querySelectorAll("#dynamic-filters select")].map(e=>e.dataset.filter),["class","tree","content"]);
 const tree=x.doc.querySelector('[data-filter="tree"]');
 assert.ok([...tree.options].some(o=>o.value==="Blue"));
 assert.ok([...tree.options].some(o=>o.value==="Green"));
 x.doc.querySelector('#games [data-game="borderlands-2"]').click();
 chooseCategory(x,"Grenade Mods");
 assert.deepEqual([...x.doc.querySelectorAll("#dynamic-filters select")].map(e=>e.dataset.filter),["rarity","elements","type","manufacturer","content"]);
 assert.match(x.doc.querySelector("#items").textContent,/Grenade Type/);
 chooseCategory(x,"Relics");
 assert.match(x.doc.querySelector("#items").textContent,/Relic Type/);
 x.doc.querySelector('#games [data-game="borderlands-tps"]').click();
 chooseCategory(x,"Oz Kits");
 assert.match(x.doc.querySelector("#items").textContent,/Oz Kit Type/);
 assert.match(x.doc.querySelector("#items").textContent,/Survivability/);
 x.doc.querySelector('#games [data-game="wonderlands"]').click();
 chooseCategory(x,"Armor");
 assert.deepEqual([...x.doc.querySelectorAll("#dynamic-filters select")].map(e=>e.dataset.filter),["rarity","manufacturer","content"]);
 assert.match(x.doc.querySelector("#items").textContent,/Swifft/);
 assert.doesNotMatch(x.doc.querySelector("#items").textContent,/Skills/);
 chooseCategory(x,"Spells");
 assert.match(x.doc.querySelector("#items").textContent,/Spell Cast/);
 assert.match(x.doc.querySelector("#items").textContent,/Simple/);
 chooseCategory(x,"Rings & Amulets");
 assert.deepEqual([...x.doc.querySelectorAll("#dynamic-filters select")].map(e=>e.dataset.filter),["rarity","item_type","item_category","content"]);
 assert.match(x.doc.querySelector("#items").textContent,/Category/);
 chooseFilter(x,"item_type","Amulet");
 assert.equal(x.doc.querySelectorAll("#items .item").length,1);
 assert.equal(x.doc.querySelector("#items .name").textContent,"Test Amulet");
}finally{x.close()}});
test("category filters combine with AND",async()=>{const x=await boot();try{
 chooseFilter(x,"manufacturer","Dahl");
 assert.equal(x.doc.querySelectorAll("#items .item").length,1);
 chooseFilter(x,"elements","Shock");
 assert.equal(x.doc.querySelectorAll("#items .item").length,0);
}finally{x.close()}});
test("collection state survives category and game changes",async()=>{const x=await boot();try{
 x.doc.querySelector('#items [data-id="weapon-1"]').click();
 assert.equal(JSON.parse(x.w.localStorage.getItem("bl-loot-progress-v1"))["weapon-1"],true);
 chooseCategory(x,"Shields");
 x.doc.querySelector('#games [data-game="borderlands-3"]').click();
 assert.equal(x.doc.getElementById("category").value,"Artifacts");
 assert.equal(x.doc.querySelector("#items .name").textContent,"Delta Artifact");
 assert.equal(JSON.parse(x.w.localStorage.getItem("bl-loot-progress-v1"))["weapon-1"],true);
}finally{x.close()}});
test("rarity codes are displayed as labels, not technical slugs",async()=>{const x=await boot();try{
 const card=x.doc.querySelector("#items .item");
 assert.match(card.textContent,/Legendary/);
 assert.doesNotMatch(card.textContent,/f-legendary/);
 assert.ok(card.querySelector(".name").classList.contains("rarity-legendary"));
}finally{x.close()}});
test("element names are displayed in English",async()=>{const x=await boot();try{const labels=[...x.doc.querySelectorAll("#items .element-icon small")].map(el=>el.textContent);assert.ok(labels.includes("Fire"));assert.ok(labels.includes("Shock"));assert.ok(!labels.includes("Огонь"));}finally{x.close()}});
test("search, missing-only and backup export remain functional",async()=>{const x=await boot();try{
 const search=x.doc.getElementById("search");search.value="Alpha";search.dispatchEvent(new x.w.Event("input"));
 assert.equal(x.doc.querySelectorAll("#items .item").length,1);
 search.value="";search.dispatchEvent(new x.w.Event("input"));
 x.doc.querySelector('#items [data-id="weapon-1"]').click();
 const missing=x.doc.getElementById("missing");missing.checked=true;change(missing,x.w);
 assert.equal(x.doc.querySelectorAll("#items .item").length,1);
 assert.equal(x.doc.querySelector("#items [data-id='weapon-1']"),null);
 x.doc.getElementById("export").click();
 assert.equal(JSON.parse(x.w.localStorage.getItem("bl-loot-backups-v1"))[0].reason,"manual-full-backup");
}finally{x.close()}});
