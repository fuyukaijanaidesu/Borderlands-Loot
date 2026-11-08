const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {JSDOM}=require("jsdom");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"assets/app.js"),"utf8");
const catalog={
 updatedAt:"2026-11-08T01:22:03.181332+00:00",
 games:[],
 items:[
  {id:"bl4-1",gameId:"borderlands-4",category:"Weapons",name:"Alpha Rifle",rarity:"Legendary",manufacturer:"Dahl",type:"Assault Rifle",elements:["Fire"],sources:["Boss A"],image:"https://cdn.example/alpha.png",url:"https://www.lootlemon.com/alpha",archived:false},
  {id:"bl4-2",gameId:"borderlands-4",category:"Shields",name:"Beta Shield",rarity:"Epic",manufacturer:"Maliwan",type:"Shield Generator",elements:["Shock"],sources:["Boss B"],image:null,url:"https://www.lootlemon.com/beta",archived:false},
  {id:"bl2-1",gameId:"borderlands-2",category:"Weapons",name:"Gamma Gun",rarity:"Pearlescent",archived:false}
 ]
};

async function boot(seed={}){
 const dom=new JSDOM(html,{url:"https://tracker.test/",runScripts:"outside-only",pretendToBeVisual:true});
 const w=dom.window;
 w.fetch=async()=>({ok:true,json:async()=>structuredClone(catalog)});
 w.confirm=()=>true;
 w.alert=()=>{};
 w.URL.createObjectURL=()=> "blob:test";
 w.URL.revokeObjectURL=()=>{};
 w.HTMLAnchorElement.prototype.click=function(){};
 for(const [key,value] of Object.entries(seed))w.localStorage.setItem(key,JSON.stringify(value));
 vm.runInContext(app,dom.getInternalVMContext());
 for(let i=0;i<50&&w.document.getElementById("status").textContent!=="Каталог загружен";i++)
  await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(w.document.getElementById("status").textContent,"Каталог загружен");
 return {dom,w,doc:w.document,close:()=>dom.window.close()};
}

test("initial catalog render, games and progress totals",async()=>{
 const x=await boot();
 try{
  assert.equal(x.doc.querySelectorAll("#items .item").length,2);
  assert.equal(x.doc.querySelectorAll("#games [data-game]").length,6);
  assert.equal(x.doc.getElementById("game-count").textContent,"0 / 2 собрано");
  assert.equal(x.doc.getElementById("all-count").textContent,"0 из 3 предметов");
 }finally{x.close();}
});

test("collect toggle persists and updates counters",async()=>{
 const x=await boot();
 try{
  x.doc.querySelector('#items [data-id="bl4-1"]').click();
  assert.equal(x.doc.getElementById("game-count").textContent,"1 / 2 собрано");
  assert.equal(JSON.parse(x.w.localStorage.getItem("bl-loot-progress-v1"))["bl4-1"],true);
  x.doc.querySelector('#items [data-id="bl4-1"]').click();
  assert.equal(x.doc.getElementById("game-count").textContent,"0 / 2 собрано");
 }finally{x.close();}
});

test("search, category, rarity and missing filters",async()=>{
 const x=await boot();
 try{
  const search=x.doc.getElementById("search");
  search.value="Alpha";search.dispatchEvent(new x.w.Event("input"));
  assert.equal(x.doc.querySelectorAll("#items .item").length,1);
  search.value="";search.dispatchEvent(new x.w.Event("input"));
  const category=x.doc.getElementById("category");
  category.value="Shields";category.dispatchEvent(new x.w.Event("change"));
  assert.equal(x.doc.querySelectorAll("#items .item").length,1);
  category.value="";category.dispatchEvent(new x.w.Event("change"));
  const rarity=x.doc.getElementById("rarity");
  rarity.value="Legendary";rarity.dispatchEvent(new x.w.Event("change"));
  assert.equal(x.doc.querySelectorAll("#items .item").length,1);
  rarity.value="";rarity.dispatchEvent(new x.w.Event("change"));
  x.doc.querySelector('#items [data-id="bl4-1"]').click();
  x.doc.getElementById("missing").checked=true;
  x.doc.getElementById("missing").dispatchEvent(new x.w.Event("change"));
  assert.equal(x.doc.querySelectorAll("#items .item").length,1);
  assert.equal(x.doc.querySelector("#items [data-id='bl4-1']"),null);
 }finally{x.close();}
});


test("manufacturer type and element filters adapt to catalog values",async()=>{
 const x=await boot();
 try{
  assert.deepEqual([...x.doc.getElementById("manufacturer").options].map(o=>o.value).filter(Boolean),["Dahl","Maliwan"]);
  assert.deepEqual([...x.doc.getElementById("type").options].map(o=>o.value).filter(Boolean),["Assault Rifle","Shield Generator"]);
  assert.deepEqual([...x.doc.getElementById("element").options].map(o=>o.value).filter(Boolean),["Fire","Shock"]);
  const manufacturer=x.doc.getElementById("manufacturer");
  manufacturer.value="Dahl";manufacturer.dispatchEvent(new x.w.Event("change"));
  assert.equal(x.doc.querySelectorAll("#items .item").length,1);
  manufacturer.value="";manufacturer.dispatchEvent(new x.w.Event("change"));
  const type=x.doc.getElementById("type");
  type.value="Shield Generator";type.dispatchEvent(new x.w.Event("change"));
  assert.equal(x.doc.querySelector("#items .name").textContent,"Beta Shield");
  type.value="";type.dispatchEvent(new x.w.Event("change"));
  const element=x.doc.getElementById("element");
  element.value="Fire";element.dispatchEvent(new x.w.Event("change"));
  assert.equal(x.doc.querySelector("#items .name").textContent,"Alpha Rifle");
 }finally{x.close();}
});

test("game tabs switch catalog and counters",async()=>{
 const x=await boot();
 try{
  x.doc.querySelector('#games [data-game="borderlands-2"]').click();
  assert.equal(x.doc.getElementById("game-title").textContent,"Borderlands 2");
  assert.equal(x.doc.querySelectorAll("#items .item").length,1);
  assert.equal(x.doc.querySelector("#items .name").textContent,"Gamma Gun");
 }finally{x.close();}
});

test("full backup export creates a snapshot and download",async()=>{
 const x=await boot();
 try{
  x.doc.getElementById("export").click();
  const history=JSON.parse(x.w.localStorage.getItem("bl-loot-backups-v1"));
  assert.equal(history[0].reason,"manual-full-backup");
  assert.equal(history.length,1);
 }finally{x.close();}
});

test("full restore preserves a pre-restore rollback snapshot",async()=>{
 const x=await boot({"bl-loot-progress-v1":{"bl4-1":true}});
 try{
  const imported={format:"borderlands-loot-full-backup",version:2,catalog:{...catalog,items:[{...catalog.items[0],id:"restored-item",name:"Restored Item"}]},progress:{"restored-item":true},settings:{search:"Restored"},history:[{version:2,at:"2026-01-01T00:00:00.000Z",reason:"imported-history",progress:{},settings:{}}]};
  await x.doc.getElementById("import").onchange({target:{files:[{text:async()=>JSON.stringify(imported)}]}});
  assert.equal(x.w.localStorage.getItem("bl-loot-force-catalog-override-v1"),"true");
  assert.equal(JSON.parse(x.w.localStorage.getItem("bl-loot-progress-v1"))["restored-item"],true);
  const history=JSON.parse(x.w.localStorage.getItem("bl-loot-backups-v1"));
  assert.equal(history[0].reason,"before-restore");
  assert.equal(x.doc.querySelector("#items .name").textContent,"Restored Item");
 }finally{x.close();}
});

test("legacy progress and server catalog backups restore safely",async()=>{
 const x=await boot({"bl-loot-progress-v1":{"bl4-1":true}});
 try{
  await x.doc.getElementById("import").onchange({target:{files:[{text:async()=>JSON.stringify({format:"borderlands-loot-progress",progress:{"bl4-2":true}})}]}});
  assert.equal(JSON.parse(x.w.localStorage.getItem("bl-loot-progress-v1"))["bl4-2"],true);
  const serverBackup={backupVersion:1,catalog:{...catalog,items:[{...catalog.items[0],id:"server-backup-item",name:"Server Backup Item"}]}};
  await x.doc.getElementById("import").onchange({target:{files:[{text:async()=>JSON.stringify(serverBackup)}]}});
  assert.equal(x.doc.querySelector("#items .name").textContent,"Server Backup Item");
  assert.equal(JSON.parse(x.w.localStorage.getItem("bl-loot-progress-v1"))["bl4-2"],true);
 }finally{x.close();}
});

test("rarity colours are attached to item titles and collected cards are visibly marked",async()=>{
 const x=await boot();
 try{
  const alpha=x.doc.querySelector('#items [data-id="bl4-1"]').closest(".item");
  const beta=x.doc.querySelector('#items [data-id="bl4-2"]').closest(".item");
  assert.ok(alpha.querySelector(".name").classList.contains("rarity-legendary"));
  assert.ok(beta.querySelector(".name").classList.contains("rarity-epic"));
  assert.equal(alpha.classList.contains("collected"),false);
  x.doc.querySelector('#items [data-id="bl4-1"]').click();
  assert.equal(x.doc.querySelector('#items [data-id="bl4-1"]').closest(".item").classList.contains("collected"),true);
 }finally{x.close();}
});

test("collected items always move to the bottom for every sort mode",async()=>{
 const x=await boot();
 try{
  x.doc.querySelector('#items [data-id="bl4-1"]').click();
  const names=()=>[...x.doc.querySelectorAll("#items .item")].map(el=>el.querySelector(".name").textContent);
  assert.deepEqual(names(),["Beta Shield","Alpha Rifle"]);
  const sort=x.doc.getElementById("sort");
  sort.value="category";sort.dispatchEvent(new x.w.Event("change"));
  assert.equal(names().at(-1),"Alpha Rifle");
  sort.value="rarity";sort.dispatchEvent(new x.w.Event("change"));
  assert.equal(names().at(-1),"Alpha Rifle");
 }finally{x.close();}
});
