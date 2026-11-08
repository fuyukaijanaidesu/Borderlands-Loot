#!/usr/bin/env python3
"""Lootlemon database sync. Never replace a catalog with an empty/failed scrape."""
import hashlib, json, re, sys, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"; BACKUPS=ROOT/"backups"; CATALOG=DATA/"catalog.json"
BASE="https://www.lootlemon.com"
HEADERS={"User-Agent":"BorderlandsLootTracker/1.0 (personal fan project)"}
EXCLUDED=("tales-from-the-borderlands","new-tales-from-the-borderlands")
GAMES={
 "borderlands-1":"Borderlands","borderlands-2":"Borderlands 2",
 "borderlands-pre-sequel":"The Pre-Sequel","borderlands-3":"Borderlands 3",
 "tiny-tinas-wonderlands":"Tiny Tina's Wonderlands","borderlands-4":"Borderlands 4"
}
CATEGORIES={"weapons":"Weapons","shields":"Shields","class-mods":"Class Mods","grenades":"Grenades","relics":"Relics","artifacts":"Artifacts","ordnance":"Ordnance","repkits":"Repkits","enhancements":"Enhancements","melee-weapons":"Melee Weapons","armor":"Armor","spellbooks":"Spellbooks"}
def get(url):
 r=requests.get(url,headers=HEADERS,timeout=40);r.raise_for_status();return r.text
def load():
 if not CATALOG.exists():return {"schemaVersion":1,"updatedAt":None,"games":[],"items":[]}
 try:return json.loads(CATALOG.read_text(encoding="utf-8"))
 except Exception as e:raise RuntimeError(f"Catalog JSON is invalid; refusing to overwrite: {e}")
def backup():
 if not CATALOG.exists():return
 BACKUPS.mkdir(parents=True,exist_ok=True)
 name="catalog-"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")+".json"
 (BACKUPS/name).write_bytes(CATALOG.read_bytes())
 old=sorted(BACKUPS.glob("catalog-*.json"))
 for p in old[:-30]:p.unlink()
def discover():
 found=set()
 for path in ("/sitemap.xml","/sitemap_index.xml"):
  try:root=BeautifulSoup(get(BASE+path),"xml")
  except Exception:continue
  locs=[x.get_text(strip=True) for x in root.find_all("loc")]
  for loc in locs:
   if loc.endswith(".xml"):
    try:locs.extend(x.get_text(strip=True) for x in BeautifulSoup(get(loc),"xml").find_all("loc"))
    except Exception:pass
  for url in locs:
   p=urlparse(url);m=re.fullmatch(r"/db/([^/]+)/([^/]+)/?",p.path)
   if m:
    game,cat=m.groups()
    if cat in CATEGORIES and not any(x in game.lower() for x in EXCLUDED):found.add((game,cat,url))
 return sorted(found)
def parse(url,game,cat):
 soup=BeautifulSoup(get(url),"html.parser");items=[]
 for table in soup.find_all("table"):
  rows=table.find_all("tr")
  if len(rows)<2:continue
  heads=[" ".join(c.stripped_strings).lower() for c in rows[0].find_all(["th","td"])]
  if not any("name" in h for h in heads):continue
  for row in rows[1:]:
   cells=row.find_all(["td","th"])
   if not cells:continue
   link=next((a for a in row.find_all("a",href=True) if a.get_text(strip=True) and ("/weapon/" in a["href"] or "/shield/" in a["href"] or "/item/" in a["href"] or "/db/" not in a["href"])),None)
   if not link:link=next((a for a in row.find_all("a",href=True) if a.get_text(strip=True)),None)
   name=link.get_text(" ",strip=True) if link else ""
   if not name:continue
   values={heads[i]:" ".join(cells[i].stripped_strings) for i in range(min(len(heads),len(cells)))}
   img=row.find("img");image=(img.get("data-src") or img.get("data-lazy-src") or img.get("src")) if img else None
   if image:image=urljoin(BASE,image)
   href=urljoin(BASE,link["href"]) if link else url
   ident=hashlib.sha1(f"{game}|{cat}|{href}".encode()).hexdigest()[:20]
   def val(*keys):
    return next((v for k,v in values.items() if any(key in k for key in keys) and v),None)
   items.append({"id":ident,"gameId":game,"category":CATEGORIES[cat],"name":name,"type":val("type"),"rarity":val("rarity"),"manufacturer":val("manufacturer","manu-"),"content":val("content"),"image":image,"url":href,"archived":False})
 if not items:raise ValueError("No recognizable item rows; page is not treated as an empty catalog")
 return items
def main():
 old=load();routes=discover()
 if not routes:raise RuntimeError("No Lootlemon database routes discovered; catalog unchanged")
 backup()
 existing={x["id"]:x for x in old.get("items",[])};fresh={};successful=set();errors=[]
 for game,cat,url in routes:
  try:
   rows=parse(url,game,cat);fresh.update({x["id"]:x for x in rows});successful.add((game,CATEGORIES[cat]));print(f"{game}/{cat}: {len(rows)}")
  except Exception as e:errors.append(f"{url}: {e}");print(f"WARN {url}: {e}",file=sys.stderr)
  time.sleep(.35)
 if not fresh:raise RuntimeError("No pages parsed successfully; catalog unchanged")
 # Keep records from temporarily failing pages; archive absent entries only in categories parsed successfully.
 for ident,item in existing.items():
  if ident not in fresh:
   if (item.get("gameId"),item.get("category")) in successful:item["archived"]=True
   fresh[ident]=item
 games={g["id"]:g for g in old.get("games",[])}
 for slug,name in GAMES.items():games.setdefault(slug,{"id":slug,"name":name})
 for slug,_,_ in routes:
  if slug not in games:games[slug]={"id":slug,"name":slug.replace("-"," ").title(),"autoDiscovered":True}
 result={"schemaVersion":1,"updatedAt":datetime.now(timezone.utc).isoformat(),"games":sorted(games.values(),key=lambda x:x["name"]),"items":sorted(fresh.values(),key=lambda x:(x["gameId"],x["category"],x["name"].lower())),"sync":{"routes":len(routes),"warnings":errors}}
 tmp=CATALOG.with_suffix(".tmp");tmp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8");json.loads(tmp.read_text(encoding="utf-8"));tmp.replace(CATALOG)
 print(f"Saved {len(result['items'])} items. Warnings: {len(errors)}")
if __name__=="__main__":main()
