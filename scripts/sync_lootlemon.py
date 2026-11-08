#!/usr/bin/env python3
"""Safely sync all discoverable Lootlemon database routes."""
import hashlib, json, re, sys, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"; BACKUPS=ROOT/"backups"; CATALOG=DATA/"catalog.json"
BASE="https://www.lootlemon.com"
SESSION=requests.Session()
SESSION.headers.update({"User-Agent":"Mozilla/5.0 (compatible; BorderlandsLootTracker/1.0)"})
EXCLUDED={"tales-from-the-borderlands","new-tales-from-the-borderlands"}
GAMES={
 "borderlands-1":"Borderlands","borderlands-2":"Borderlands 2",
 "borderlands-tps":"Borderlands: The Pre-Sequel","borderlands-3":"Borderlands 3",
 "wonderlands":"Tiny Tina's Wonderlands","borderlands-4":"Borderlands 4"
}
LABELS={"class-mods":"Class Mods","melee":"Melee Weapons","melee-weapons":"Melee Weapons",
 "repkits":"Repkits","ordnance":"Ordnance","enhancements":"Enhancements",
 "spellbooks":"Spellbooks","shields":"Shields","weapons":"Weapons",
 "grenades":"Grenades","relics":"Relics","artifacts":"Artifacts","armor":"Armor"}

def get(url):
 r=SESSION.get(url,timeout=45); r.raise_for_status(); return r.text

def load():
 if not CATALOG.exists(): return {"schemaVersion":1,"updatedAt":None,"games":[],"items":[]}
 try: data=json.loads(CATALOG.read_text(encoding="utf-8"))
 except Exception as e: raise RuntimeError(f"Invalid catalog; refusing to overwrite: {e}")
 if not isinstance(data,dict) or not isinstance(data.get("items",[]),list):
  raise RuntimeError("Unexpected catalog structure; refusing to overwrite")
 return data

def backup():
 if not CATALOG.exists(): return
 BACKUPS.mkdir(parents=True,exist_ok=True)
 path=BACKUPS/("catalog-"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")+".json")
 path.write_bytes(CATALOG.read_bytes())
 copies=sorted(BACKUPS.glob("catalog-*.json"))
 for old in copies[:-30]: old.unlink()
 print("Backup:",path.relative_to(ROOT))

def discover():
 pending=[BASE+"/sitemap.xml",BASE+"/sitemap_index.xml"]; seen=set(); routes=set()
 while pending:
  url=pending.pop(0)
  if url in seen: continue
  seen.add(url)
  try: soup=BeautifulSoup(get(url),"xml")
  except Exception: continue
  for node in soup.find_all("loc"):
   loc=node.get_text(strip=True)
   if not loc: continue
   if urlparse(loc).path.endswith(".xml"):
    if loc not in seen: pending.append(loc)
    continue
   match=re.fullmatch(r"/db/([^/]+)/([^/]+)/?",urlparse(loc).path)
   if match:
    game,category=match.groups()
    if game not in EXCLUDED: routes.add((game,category,loc))
 return routes

def label(slug):
 return LABELS.get(slug,re.sub(r"[-_]+"," ",slug).title())

def parse_page(url,game,category):
 soup=BeautifulSoup(get(url),"html.parser"); found=[]
 for table in soup.find_all("table"):
  rows=table.find_all("tr")
  if len(rows)<2: continue
  headers=[" ".join(c.stripped_strings).lower() for c in rows[0].find_all(["th","td"])]
  if not any("name" in h for h in headers): continue
  ni=next(i for i,h in enumerate(headers) if "name" in h)
  for row in rows[1:]:
   cells=row.find_all(["td","th"])
   if len(cells)<=ni: continue
   cell=cells[ni]; link=cell.find("a",href=True)
   name=link.get_text(" ",strip=True) if link else cell.get_text(" ",strip=True)
   if not name or name.lower()=="name": continue
   vals={headers[i]:" ".join(c.stripped_strings) for i,c in enumerate(cells[:len(headers)])}
   def val(*keys):
    return next((v for k,v in vals.items() if any(x in k for x in keys) and v),None)
   img=row.find("img"); image=None
   if img:
    image=img.get("data-src") or img.get("data-lazy-src") or img.get("data-original") or img.get("src")
    if image and image.startswith("data:"): image=img.get("data-src") or img.get("data-lazy-src")
    if image: image=urljoin(BASE,image)
   href=urljoin(BASE,link["href"]) if link else url
   ident=hashlib.sha1(f"{game}|{category}|{href}".encode()).hexdigest()[:20]
   found.append({"id":ident,"gameId":game,"category":label(category),"name":name,
    "type":val("weapon type","item type","type"),"rarity":val("rarity"),
    "manufacturer":val("manufacturer","manu-"),"content":val("content"),
    "image":image,"url":href,"archived":False})
 if not found: raise ValueError("No recognizable item rows")
 return found,soup

def parse_route(url,game,category):
 rows,soup=parse_page(url,game,category); urls={url}
 for a in soup.find_all("a",href=True):
  candidate=urljoin(url,a["href"]); p=urlparse(candidate)
  if p.netloc.endswith("lootlemon.com") and p.path==urlparse(url).path and re.search(r"(?:_page|page)[^=]*=",p.query,re.I):
   urls.add(candidate)
 all_rows={}
 for page in sorted(urls):
  page_rows,_=parse_page(page,game,category)
  all_rows.update({x["id"]:x for x in page_rows})
  time.sleep(.2)
 return list(all_rows.values())

def main():
 old=load(); routes=discover()
 if not routes: raise RuntimeError("No database routes discovered in Lootlemon sitemaps; catalog unchanged")
 backup()
 old_games={g["id"]:g for g in old.get("games",[]) if isinstance(g,dict) and g.get("id")}
 for slug,name in GAMES.items(): old_games[slug]={"id":slug,"name":name}
 existing={x["id"]:x for x in old.get("items",[]) if isinstance(x,dict) and x.get("id")}
 fresh={}; successful=set(); warnings=[]
 for game,category,url in sorted(routes):
  try:
   rows=parse_route(url,game,category); fresh.update({x["id"]:x for x in rows})
   successful.add((game,label(category))); print(f"OK {game}/{category}: {len(rows)}")
  except Exception as e:
   warnings.append(f"{url}: {e}"); print(f"WARN {url}: {e}",file=sys.stderr)
  time.sleep(.25)
 if not fresh: raise RuntimeError("No pages parsed successfully; original catalog retained")
 for ident,item in existing.items():
  if ident not in fresh:
   if (item.get("gameId"),item.get("category")) in successful: item["archived"]=True
   fresh[ident]=item
 for game,_,_ in routes:
  if game not in EXCLUDED and game not in old_games:
   old_games[game]={"id":game,"name":game.replace("-"," ").title(),"autoDiscovered":True}
 result={"schemaVersion":1,"updatedAt":datetime.now(timezone.utc).isoformat(),
  "games":sorted(old_games.values(),key=lambda x:x["name"].lower()),
  "items":sorted(fresh.values(),key=lambda x:(x.get("gameId",""),x.get("category",""),x.get("name","").lower())),
  "sync":{"routesDiscovered":len(routes),"routesSucceeded":len(successful),"warnings":warnings}}
 DATA.mkdir(parents=True,exist_ok=True); tmp=CATALOG.with_suffix(".tmp")
 tmp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
 json.loads(tmp.read_text(encoding="utf-8")); tmp.replace(CATALOG)
 print(f"Saved {len(result['items'])} items; {len(successful)}/{len(routes)} routes succeeded.")
if __name__=="__main__":
 try: main()
 except Exception as exc:
  print("ERROR:",exc,file=sys.stderr); raise
