#!/usr/bin/env python3
import argparse, datetime as dt, hashlib, html, json, os, re, subprocess, sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://dailyintelligence.lacbgrey.com.au"
TZ = "Australia/Sydney"

def slugify(s, limit=80):
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return (s[:limit].rstrip("-") or "item")

def norm_url(u):
    p = urlsplit(u)
    path = p.path.rstrip('/') or p.path
    return urlunsplit((p.scheme, p.netloc.lower(), path, '', ''))

def utc_for_date(date_s):
    d = dt.date.fromisoformat(date_s)
    prev = d - dt.timedelta(days=1)
    return f"{prev.isoformat()}T20:00:00Z"

def now_utc():
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def validate(issue):
    req = ["date","intro_title","intro","friendly_intro_title","friendly_intro","items"]
    for k in req:
        if k not in issue: raise SystemExit(f"missing {k}")
    if len(issue["items"]) != 13: raise SystemExit("issue must have 13 items")
    gh = [it for it in issue['items'] if it.get('kind') == 'github']
    if len(gh) != 3: raise SystemExit("issue must have exactly 3 github items")
    seen=set()
    for it in issue['items']:
        for k in ["title","url","source","kind","summary","friendly_title","friendly_summary"]:
            if not it.get(k): raise SystemExit(f"missing {k} in {it.get('title')}")
        n=norm_url(it['url'])
        if n in seen: raise SystemExit(f"duplicate URL in issue: {n}")
        seen.add(n)
        if it['kind']=='github':
            if not it.get('how_its_useful') or not it.get('friendly_useful'):
                raise SystemExit(f"github missing useful fields: {it['title']}")
        else:
            if not it.get('why_it_matters') or not it.get('friendly_why'):
                raise SystemExit(f"non-github missing why fields: {it['title']}")

def content_item(date_s, pos, it, captured):
    canonical = norm_url(it['url'])
    h = hashlib.sha1(canonical.encode()).hexdigest()[:8]
    sid = f"content-item_{date_s}_{pos:02d}_{slugify(it['title'])}_{h}"
    d = {
        "schemaVersion": 1,
        "recordType": "ContentItem",
        "id": sid,
        "sourceKind": it['kind'],
        "sourceName": it['source'],
        "sourceUrl": it['url'],
        "canonicalUrl": canonical,
        "credit": it.get('credit') or None,
        "sourcePublishedAtUtc": None,
        "capturedAtUtc": captured,
        "createdAtUtc": captured,
        "updatedAtUtc": captured,
        "title": it['title'],
        "friendlyTitle": it['friendly_title'],
        "summary": it['summary'],
        "friendlySummary": it['friendly_summary'],
        "whyItMatters": it.get('why_it_matters') or it.get('how_its_useful'),
        "friendlyWhyItMatters": it.get('friendly_why') or it.get('friendly_useful'),
        "tags": [],
        "metadata": {"legacyKind": it['kind'], "legacyPublicationSlug": date_s}
    }
    if it['kind']=='github':
        d['howItsUseful'] = it['how_its_useful']
        d['friendlyHowItsUseful'] = it['friendly_useful']
    return sid,d

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False)+"\n", encoding='utf-8')

def shell_html(date_s, title, desc, latest=False):
    canonical = f"{BASE}/" if latest else f"{BASE}/issues/{date_s}.html"
    css = "styles.css" if latest else "../styles.css"
    data_root = "data/" if latest else "../data/"
    asset = "" if latest else "../"
    slug = "latest" if latest else date_s
    e = html.escape
    return f'''<!DOCTYPE html>
<html lang="en" data-theme="blueprint">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>The Daily Intelligence — {e(date_s)}</title>
  <meta name="description" content="Daily AI brief for {e(date_s)}: {e(desc[:240])}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="theme-color" content="#060708" />
  <link rel="canonical" href="{canonical}" />
  <meta property="og:site_name" content="The Daily Intelligence" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="The Daily Intelligence — {e(date_s)}" />
  <meta property="og:description" content="Daily AI brief for {e(date_s)}: {e(desc[:240])}" />
  <meta property="og:url" content="{canonical}" />
  <meta property="og:image" content="{BASE}/og-image.png" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="The Daily Intelligence by LACB Grey — daily AI brief." />
  <meta property="og:locale" content="en_AU" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="The Daily Intelligence — {e(date_s)}" />
  <meta name="twitter:description" content="Daily AI brief for {e(date_s)}: {e(desc[:240])}" />
  <meta name="twitter:image" content="{BASE}/og-image.png" />
  <meta name="twitter:image:alt" content="The Daily Intelligence by LACB Grey — daily AI brief." />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="{css}" />
  <script defer data-domain="dailyintelligence.lacbgrey.com.au" src="https://plausible.io/js/script.js"></script>
</head>
<body data-mode="current">
  <div id="app" data-view="daily" data-data-root="{data_root}" data-asset-prefix="{asset}" data-publication-slug="{slug}">
    <div class="site-frame"><p class="mode-hint">Loading The Daily Intelligence.</p></div>
  </div>
  <script src="{asset}assets/daily-page.js"></script>
</body>
</html>
'''

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('issue_json')
    ap.add_argument('--push', action='store_true')
    args=ap.parse_args()
    issue=json.loads(Path(args.issue_json).read_text())
    validate(issue)
    date_s=issue['date']; captured=now_utc()
    refs=[]
    for i,it in enumerate(issue['items'],1):
        sid,d=content_item(date_s,i,it,captured)
        write_json(ROOT/'data/content-items'/f'{sid}.json',d)
        refs.append({"contentItemId": sid, "position": i, "displayRole":"primary", "overrideTitle":None, "overrideFriendlyTitle":None, "overrideSummary":None, "overrideFriendlySummary":None, "overrideWhyItMatters":None, "overrideFriendlyWhyItMatters":None})
    pub={"schemaVersion":1,"recordType":"DailyPublication","id":f"daily-publication_{date_s}","slug":date_s,"status":"published","publicationDateUtc":utc_for_date(date_s),"displayTimeZone":TZ,"header":issue['intro_title'],"friendlyHeader":issue['friendly_intro_title'],"summary":issue['intro'],"friendlySummary":issue['friendly_intro'],"contentItemRefs":refs,"createdAtUtc":captured,"updatedAtUtc":captured,"metadata":{"legacySource":Path(args.issue_json).name,"itemCount":len(refs)}}
    write_json(ROOT/'data/daily-publications'/f'{date_s}.json',pub)
    # Update indexes
    idx_path=ROOT/'data/index/publications.json'
    if idx_path.exists(): idx=json.loads(idx_path.read_text())
    else: idx={"schemaVersion":1,"recordType":"PublicationIndex","items":[]}
    entry={"id":pub['id'],"slug":date_s,"status":"published","publicationDateUtc":pub['publicationDateUtc'],"displayTimeZone":TZ,"header":pub['header'],"friendlyHeader":pub['friendlyHeader'],"summary":pub['summary'],"friendlySummary":pub['friendlySummary'],"itemCount":len(refs),"href":f"issues/{date_s}.html","dataUrl":f"data/daily-publications/{date_s}.json"}
    idx['items']=[x for x in idx.get('items',[]) if x.get('slug')!=date_s]
    idx['items'].insert(0,entry); idx['generatedAtUtc']=captured
    write_json(idx_path,idx)
    arch={**idx,"recordType":"ArchiveIndex","limit":20,"items":idx['items'][:20]}
    write_json(ROOT/'data/index/archive.json',arch)
    (ROOT/'issues').mkdir(exist_ok=True)
    (ROOT/'issues'/f'{date_s}.html').write_text(shell_html(date_s, issue['intro_title'], issue['intro'], False), encoding='utf-8')
    (ROOT/'index.html').write_text(shell_html(date_s, issue['intro_title'], issue['intro'], True), encoding='utf-8')
    if args.push:
        subprocess.run(['git','add','workspace', 'scripts/render_publish_issue.py','data','issues','index.html'], cwd=ROOT, check=True)
        subprocess.run(['git','commit','-m',f'publish: daily intelligence {date_s}'], cwd=ROOT, check=True)
        subprocess.run(['git','push'], cwd=ROOT, check=True)
    print(f"Published {date_s}: {BASE}/issues/{date_s}.html")

if __name__ == '__main__':
    main()
