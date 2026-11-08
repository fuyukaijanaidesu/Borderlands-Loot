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

def backup():
 if not CATALOG.exists(): return
 BACKUPS.mkdir(parents=True,exist_ok=True)
 path=BACKUPS/("catalog-"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")+".json")
 path.write_bytes(CATALOG.read_bytes())
 copies=sorted(BACKUPS.glob("catalog-*.json"))
 for old in copies[:-30]: old.unlink()
 print("Backup:",path.relative_to(ROOT))

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

 for card in cards:
  # Lootlemon uses Webflow collection cards, not HTML table rows.
  # Keep only db_cell elements whose closest db_cell parent is the card.
  cells=[]
  for node in card.select(".db_cell"):
   parent=node.parent
   nested=False
   while parent is not None and parent is not card:
    if parent in cells:
     nested=True
     break
    parent=parent.parent
   if not nested:
    cells.append(node)

  def cell_text(node):
   return " ".join(node.stripped_strings).strip()

  # The item title is in the prominent large text cell; the overlay link
  # on the same card carries the canonical item URL.
  title_cell=next((c for c in cells if "large" in (c.get("class") or []) and
                   "image" not in (c.get("class") or []) and cell_text(c)),None)
  if title_cell is None:
   title_cell=next((c for c in cells if cell_text(c) and
                    not ({"image","icon-grid","sources-cell"} & set(c.get("class") or []))),None)
  name=cell_text(title_cell) if title_cell else ""
  if not name:
   continue

  # The overlay is the card's primary item link; other links may point to
  # character skills, source locations, or filters.
  item_link=card.select_one("a.link-overlay[href]")
  if item_link is None:
   for a in card.select("a[href]"):
    href=urljoin(BASE,a.get("href",""))
    path=urlparse(href).path
    if path.startswith("/") and path != urlparse(url).path and "/db/" not in path:
     item_link=a
     break
  href=urljoin(BASE,item_link["href"]) if item_link else url

  # Extract remaining cells in DOM order. The first prominent text cell is
  # the name; other non-image cells contain type/manufacturer/content metadata.
  metadata=[]
  for c in cells:
   classes=set(c.get("class") or [])
   if c is title_cell or {"image","icon-grid","sources-cell"} & classes:
    continue
   value=cell_text(c)
   if value and value != name and value not in metadata:
    metadata.append(value)

  image=None
  image_node=card.select_one(".db_cell.image img, .db_cell.image source, img")
  if image_node:
   image=(image_node.get("src") or image_node.get("data-src") or
          image_node.get("data-lazy-src") or image_node.get("data-original") or
          image_node.get("srcset","").split(" ")[0])
   if image and image.startswith("data:"):
    image=(image_node.get("data-src") or image_node.get("data-lazy-src") or
           image_node.get("data-original"))
   if image:
    image=urljoin(BASE,image)

  rarity=None
  rarity_node=card.select_one("[class*=rarity], [class*=legendary]")
  if rarity_node:
   rarity=cell_text(rarity_node) or next(iter(rarity_node.get("class") or []),None)

  # Column positions vary by game/category. Preserve the source values while
  # assigning the common weapon fields when their labels are recognizable.
  type_value=None
  manufacturer=None
  for value in metadata:
   low=value.lower()
   if any(token in low for token in ("assault rifle","pistol","shotgun","smg","sniper","launcher")):
    type_value=value
   if value in {"Daedalus","Jakobs","Maliwan","Order","Ripper","Tediore","Torgue","Vladof",
                "Bandit","Dahl","Hyperion","S&S","Tediore","Torgue","Vladof","Anshin",
                "Atlas","COV","Eridian","Pangolin","Vladof"}:
    manufacturer=value

  ident=hashlib.sha1(f"{game}|{category}|{href}".encode()).hexdigest()[:20]
  found.append({"id":ident,"gameId":game,"category":label(category),"name":name,
   "type":type_value,"rarity":rarity,"manufacturer":manufacturer,
   "content":None,"image":image,"url":href,"archived":False})

 if not found:
  inspect_page(url,html)
  sample=cards[0].prettify()[:2400]
  print("DIAG first_card_html=",sample,file=sys.stderr)
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
