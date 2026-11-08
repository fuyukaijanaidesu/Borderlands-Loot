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
 updatedAt:"2026-11-08T01:22:03.181332+00:00",games:[],
 items:[
  {id:"weapon-1",gameId:"borderlands-4",category:"Weapons",name:"Alpha Rifle",rarity:"f-legendary",manufacturer:"Dahl",type:"Assault Rifle",elements:["Fire"],content:"Base Game",sources:["Boss A"],image:null,url:"https://www.lootlemon.com/alpha",archived:false},
  {id:"shield-1",gameId:"borderlands-4",category:"Shields",name:"Beta Shield",rarity:"d-epic",manufacturer:"Maliwan",type:"Shield Generator",elements:["Shock"],content:"Base Game",sources:["Boss B"],image:null,url:"https://www.lootlemon.com/beta",archived:false},
  {id:"classmod-1",gameId:"borderlands-4",category:"Class Mods",name:"Gamma Mod",rarity:"f-legendary",class:"Amon",skills:["Bullet Hail","Wildfire"],attributes:{tree:["Green"]},content:"Base Game",sources:["Boss C"],archived:false},
  {id:"artifact-1",gameId:"borderlands-3",category:"Artifacts",name:"Delta Artifact",rarity:"Pearlescent",type:"Artifact",content:"DLC 1",sources:["Boss D"],archived:false}
 ]
};
async function boot(seed={}){
 const dom=new JSDOM(html,{url:"https://tracker.test/",runScripts:"outside-only",pretendToBeVisual:true});
 const w=dom.window;
 w.fetch=async()=>({ok:true,json:async()=>structuredClone(catalog)});
 w.confirm=()=>true;w.alert=()=>{};w.URL.createObjectURL=()=> "blob:test";w.URL.revokeObjectURL=()=>{};
 w.HTMLAnchorElement.prototype.click=function(){};
 for(const [key,value] of Object.entries(seed))w.localStorage.setItem(key,JSON.stringify(value));
 vm.runInContext(app,dom.getInternalVMContext());
 for(let i=0;i<50&&w.document.getElementById("status").textContent!=="Каталог загружен";i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(w.document.getElementById("status").textContent,"Каталог загружен");
 return {dom,w,doc:w.document,close:()=>dom.window.close()};
}
const change=(el,w)=>el.dispatchEvent(new w.Event("change",{bubbles:true}));
const chooseCategory=(x,name)=>{const c=x.doc.getElementById("category");c.value=name;change(c,x.w);};
const chooseFilter=(x,key,value)=>{const c=x.doc.querySelector('[data-filter="'+key+'"]');assert.ok(c,"missing filter "+key);c.value=value;change(c,x.w);};

test("initial render defaults to Weapons and preserves game-wide progress totals",async()=>{
 const x=await boot();try{
  assert.equal(x.doc.getElementById("category").value,"Weapons");
  assert.equal(x.doc.querySelectorAll("#items .item").length,1);
  assert.equal(x.doc.getElementById("game-count").textContent,"0 / 3 собрано");
  assert.equal(x.doc.getElementById("all-count").textContent,"0 из 4 предметов");
  assert.deepEqual([...x.doc.querySelectorAll("#dynamic-filters select")].map(e=>e.dataset.filter),["rarity","elements","type","manufacturer","content"]);
 }finally{x.close();}
});

test("each Borderlands 4 category renders its own fields and filter schema",async()=>{
 const x=await boot();try{
  chooseCategory(x,"Shields");
  assert.deepEqual([...x.doc.querySelectorAll("#dynamic-filters select")].map(e=>e.dataset.filter),["type","elements","manufacturer","content"]);
  assert.equal(x.doc.querySelector("#items .name").textContent,"Beta Shield");
  assert.match(x.doc.querySelector("#items").textContent,/Shield Type/);
  assert.doesNotMatch([...x.doc.querySelectorAll("#dynamic-filters select")].map(e=>e.dataset.filter).join(","),/rarity/);
  chooseCategory(x,"Class Mods");
  assert.deepEqual([...x.doc.querySelectorAll("#dynamic-filters select")].map(e=>e.dataset.filter),["class","tree","content"]);
  assert.match(x.doc.querySelector("#items").textContent,/Skills/);
  assert.match(x.doc.querySelector("#items").textContent,/Bullet Hail/);
  assert.match(x.doc.querySelector("#items").textContent,/Amon/);
 }finally{x.close();}
});

test("multi-filter selection combines with AND and updates visible cards",async()=>{
 const x=await boot();try{
  chooseFilter(x,"manufacturer","Dahl");
  assert.equal(x.doc.querySelectorAll("#items .item").length,1);
  chooseFilter(x,"elements","Fire");
  assert.equal(x.doc.querySelectorAll("#items .item").length,1);
  chooseFilter(x,"type","Shotgun");
  assert.equal(x.doc.querySelectorAll("#items .item").length,0);
 }finally{x.close();}
});

test("collect toggle persists while changing categories and games",async()=>{
 const x=await boot();try{
  x.doc.querySelector('#items [data-id="weapon-1"]').click();
  assert.equal(JSON.parse(x.w.localStorage.getItem("bl-loot-progress-v1"))["weapon-1"],true);
  chooseCategory(x,"Shields");
  assert.equal(x.doc.querySelectorAll("#items .item").length,1);
  x.doc.querySelector('#games [data-game="borderlands-3"]').click();
  assert.equal(x.doc.getElementById("category").value,"Artifacts");
  assert.equal(x.doc.querySelector("#items .name").textContent,"Delta Artifact");
  assert.equal(x.doc.getElementById("game-count").textContent,"0 / 1 собрано");
  assert.equal(JSON.parse(x.w.localStorage.getItem("bl-loot-progress-v1"))["weapon-1"],true);
 }finally{x.close();}
});

test("rarity codes are human-readable and never exposed as technical slugs",async()=>{
 const x=await boot();try{
  const card=x.doc.querySelector("#items .item");
  assert.match(card.textContent,/Legendary/);
  assert.doesNotMatch(card.textContent,/f-legendary/);
  assert.ok(card.querySelector(".name").classList.contains("rarity-legendary"));
 }finally{x.close();}
});

test("search, missing-only filter and backup export remain functional",async()=>{
 const x=await boot();try{
  const search=x.doc.getElementById("search");search.value="Alpha";search.dispatchEvent(new x.w.Event("input"));
  assert.equal(x.doc.querySelectorAll("#items .item").length,1);
  search.value="no match";search.dispatchEvent(new x.w.Event("input"));
  assert.equal(x.doc.querySelectorAll("#items .item").length,0);
  search.value="";search.dispatchEvent(new x.w.Event("input"));
  x.doc.querySelector('#items [data-id="weapon-1"]').click();
  const missing=x.doc.getElementById("missing");missing.checked=true;change(missing,x.w);
  assert.equal(x.doc.querySelectorAll("#items .item").length,0);
  x.doc.getElementById("export").click();
  assert.equal(JSON.parse(x.w.localStorage.getItem("bl-loot-backups-v1"))[0].reason,"manual-full-backup");
 }finally{x.close();}
});
