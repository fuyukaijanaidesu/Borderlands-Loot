#!/usr/bin/env python3
"""Safely sync all discoverable Lootlemon database routes."""
# Scraper updates are validated automatically by GitHub Actions on push.
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

def inspect_page(url,html):
 soup=BeautifulSoup(html,"html.parser")
 title=soup.title.get_text(" ",strip=True) if soup.title else "(no title)"
 classes={}
 for node in soup.find_all(True):
  value=node.get("class")
  if value:
   key=".".join(value)
   classes[key]=classes.get(key,0)+1
 top=sorted(classes.items(),key=lambda x:x[1],reverse=True)[:12]
 scripts=[x.get_text(" ",strip=True)[:180] for x in soup.find_all("script") if x.get_text(strip=True)]
 print("DIAG",url,"title=",title[:120],"html_bytes=",len(html),
       "tables=",len(soup.find_all("table")),"links=",len(soup.find_all("a",href=True)),
       "images=",len(soup.find_all("img")),"top_classes=",top[:12],
       "body_text=",(soup.body.get_text(" ",strip=True)[:260] if soup.body else soup.get_text(" ",strip=True)[:260]),
       "script_samples=",scripts[:2],file=sys.stderr)

def load():
 if not CATALOG.exists(): return {"schemaVersion":1,"updatedAt":None,"games":[],"items":[]}
 try: data=json.loads(CATALOG.read_text(encoding="utf-8"))
 except Exception as e: raise RuntimeError(f"Invalid catalog; refusing to overwrite: {e}")
 if not isinstance(data,dict) or not isinstance(data.get("items",[]),list):
  raise RuntimeError("Unexpected catalog structure; refusing to overwrite")
 return data

def backup(old_catalog=None, reason="before-sync"):
 if not CATALOG.exists(): return
 BACKUPS.mkdir(parents=True,exist_ok=True)
 stamp=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
 path=BACKUPS/("backup-"+stamp+".json")
 snapshot={"backupVersion":1,"createdAt":datetime.now(timezone.utc).isoformat(),
           "reason":reason,"catalog":old_catalog if old_catalog is not None else load()}
 tmp=path.with_suffix(".tmp")
 tmp.write_text(json.dumps(snapshot,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
 tmp.replace(path)
 copies=sorted(BACKUPS.glob("backup-*.json"))
 for old_path in copies[:-30]: old_path.unlink()
 for legacy in BACKUPS.glob("catalog-*.json"): legacy.unlink()
 print("Full catalog backup:",path.relative_to(ROOT))

def discover():
 # Lootlemon's homepage contains the authoritative game/category navigation.
 # The sitemap endpoint may respond with an RSS content type and is not reliable
 # for database routes, so discover links from the rendered site's source first.
 routes=set()
 try:
  home=BeautifulSoup(get(BASE+"/"),"html.parser")
  for anchor in home.find_all("a",href=True):
   href=urljoin(BASE,anchor["href"])
   path=urlparse(href).path.rstrip("/")
   match=re.fullmatch(r"/db/([^/]+)/([^/]+)",path)
   if match:
    game,category=match.groups()
    if game not in EXCLUDED:
     routes.add((game,category,BASE+path))
 except Exception as exc:
  print(f"WARN homepage navigation unavailable: {exc}",file=sys.stderr)

 # Sitemaps remain a supplemental source; do not make their availability mandatory.
 for sitemap in (BASE+"/sitemap.xml",BASE+"/sitemap_index.xml"):
  try:
   response=SESSION.get(sitemap,timeout=30)
   response.raise_for_status()
   # Parse sitemap locations without requiring an optional XML parser.
   locs=re.findall(r"<loc[^>]*>\\s*(.*?)\\s*</loc>",response.text,re.I|re.S)
   locs=[re.sub(r"&amp;","&",x.strip()) for x in locs]
   for loc in locs:
    if urlparse(loc).path.endswith(".xml"):
     try:
      nested_html=get(loc)
      locs.extend(re.findall(r"<loc[^>]*>\\s*(.*?)\\s*</loc>",nested_html,re.I|re.S))
     except Exception:
      continue
    match=re.fullmatch(r"/db/([^/]+)/([^/]+)/?",urlparse(loc).path)
    if match:
     game,category=match.groups()
     if game not in EXCLUDED:
      routes.add((game,category,loc))
  except Exception as exc:
   print(f"INFO sitemap skipped ({sitemap}): {exc}",file=sys.stderr)
 return routes

def label(slug):
 return LABELS.get(slug,re.sub(r"[-_]+"," ",slug).title())

def parse_page(url,game,category):
 html=get(url)
 soup=BeautifulSoup(html,"html.parser")
 found=[]
 cards=soup.select(".db_item.w-dyn-item")
 if not cards:
  inspect_page(url,html)
  raise ValueError("No Lootlemon .db_item.w-dyn-item cards found")
 rarity_names={"common","uncommon","rare","very rare","epic","legendary","pearlescent"}
 def text_of(node):
  return " ".join(node.stripped_strings).strip() if node else ""
 def labels_of(node):
  out=[]
  if not node: return out
  for el in [node,*node.find_all(True)]:
   for key in ("alt","title","aria-label","data-name","data-filter"):
    value=el.get(key)
    if value and value.strip() not in out: out.append(value.strip())
   for cls in el.get("class") or []:
    clean=re.sub(r"[-_]+"," ",cls).strip()
    if clean and clean.lower() not in {"db cell","image","icon grid","w dyn item"} and clean not in out:
     out.append(clean)
  return out
 def split_values(node):
  value=text_of(node)
  return [x.strip() for x in re.split(r"\s*[•·,]\s*",value) if x.strip()]
 for card in cards:
  cells=[]
  for node in card.select(".db_cell"):
   parent=node.parent; nested=False
   while parent is not None and parent is not card:
    if parent in cells: nested=True; break
    parent=parent.parent
   if not nested: cells.append(node)
  title_cell=next((c for c in cells if "large" in (c.get("class") or []) and "image" not in (c.get("class") or []) and text_of(c)),None)
  if title_cell is None:
   title_cell=next((c for c in cells if text_of(c) and not ({"image","icon-grid","sources-cell"} & set(c.get("class") or []))),None)
  name=text_of(title_cell)
  if not name: continue
  item_link=card.select_one("a.link-overlay[href]")
  if item_link is None:
   for a in card.select("a[href]"):
    candidate=urljoin(BASE,a.get("href","")); path=urlparse(candidate).path
    if path.startswith("/") and path != urlparse(url).path and "/db/" not in path:
     item_link=a; break
  href=urljoin(BASE,item_link["href"]) if item_link else None
  image=None
  image_node=card.select_one(".db_cell.image img, .db_cell.image source, img")
  if image_node:
   for key in ("data-src","data-lazy-src","data-original","src"):
    value=image_node.get(key)
    if value and not value.startswith("data:"):
     image=urljoin(BASE,value); break
   if not image and image_node.get("srcset"):
    image=urljoin(BASE,image_node["srcset"].split(",")[0].strip().split(" ")[0])
  idx=cells.index(title_cell) if title_cell in cells else -1
  before=cells[:idx] if idx>=0 else []
  after=cells[idx+1:] if idx>=0 else []
  rarity=None
  for c in before:
   for value in [text_of(c),*labels_of(c)]:
    low=value.lower().strip()
    if low in rarity_names or any(x in low for x in ("legendary","pearlescent","very rare")):
     rarity=value.strip().title(); break
   if rarity: break
  if rarity is None and before:
   cls=" ".join(before[-1].get("class") or []).lower()
   m=re.search(r"(legendary|pearlescent|very[-_ ]?rare|epic|rare|uncommon|common)",cls)
   if m: rarity=m.group(1).replace("-"," ").title()
  values=[text_of(c) for c in after if text_of(c)]
  metadata=[]
  for c in cells:
   if c is title_cell or "image" in (c.get("class") or []): continue
   v=text_of(c)
   if v and v not in metadata: metadata.append(v)
  cat=label(category); type_value=manufacturer=content=None; elements=[]; sources=[]
  if cat=="Weapons":
   if len(after)>0: type_value=text_of(after[0]) or None
   if len(after)>1: manufacturer=text_of(after[1]) or None
   if len(after)>2: elements=labels_of(after[2])
   if len(after)>3: content=text_of(after[3]) or None
   if len(after)>4: sources=split_values(after[4])
  else:
   for c in after:
    cls=" ".join(c.get("class") or []).lower(); v=text_of(c)
    if "content" in cls and v: content=v
    if "source" in cls and v: sources=split_values(c)
    if "element" in cls: elements=labels_of(c)
   for v in values:
    low=v.lower()
    if not type_value and any(t in low for t in ("assault rifle","pistol","shotgun","smg","sniper","launcher")):
     type_value=v
  known={"daedalus","jakobs","maliwan","order","ripper","tediore","torgue","vladof","bandit","dahl","hyperion","s&s","atlas","cov","eridian","pangolin"}
  if not manufacturer: manufacturer=next((v for v in values if v.lower() in known),None)
  if not content: content=next((v for v in values if v.lower() in {"base game","dlc","vault card","gilded glory pack","vault of the damned"}),None)
  clean_name=re.sub(r"\s+"," ",name).strip().casefold()
  identity=f"{game}|{category}|{href}" if href else f"{game}|{category}|{clean_name}"
  ident=hashlib.sha1(identity.encode("utf-8")).hexdigest()[:20]
  found.append({"id":ident,"gameId":game,"category":cat,"name":name,"type":type_value,
   "rarity":rarity,"manufacturer":manufacturer,"content":content,"elements":elements,
   "sources":sources,"metadata":metadata,"image":image,"url":href,"archived":False})
 if not found:
  inspect_page(url,html)
  print("DIAG first_card_html=",cards[0].prettify()[:3200],file=sys.stderr)
  raise ValueError("Lootlemon cards found, but item names could not be extracted")
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
 backup(old, reason='before-sync')
 old_games={g["id"]:g for g in old.get("games",[]) if isinstance(g,dict) and g.get("id")}
 for slug,name in GAMES.items(): old_games[slug]={"id":slug,"name":name}
 existing={x["id"]:x for x in old.get("items",[]) if isinstance(x,dict) and x.get("id")}
 fresh={}; successful=set(); warnings=[]
 for game,category,url in sorted(routes):
  try:
   rows=parse_route(url,game,category)
   previous=[x for x in existing.values() if x.get("gameId")==game and x.get("category")==label(category) and not x.get("archived")]
   if previous and len(rows)<max(1,int(len(previous)*0.5)):
    raise ValueError(f"Suspiciously low item count ({len(rows)} vs previous {len(previous)}); preserving previous category")
   fresh.update({x["id"]:x for x in rows})
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
