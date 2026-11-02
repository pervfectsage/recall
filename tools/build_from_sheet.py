"""Build a release directory from Cards-tab CSV or RecallExport JSON. Standard library only."""
import argparse,csv,json,math,shutil,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def convert(rows, baseline):
    existing={c['id']:c for c in baseline}; ids=set();topics=set();orders=set();out=[];chapters={};sections={}
    for n,r in enumerate(rows,2):
        if not any(str(v).strip() for v in r.values()):continue
        status=str(r.get('Status','')).strip()
        if status not in ('Draft','Published'):raise ValueError(f'Row {n}: choose Draft or Published')
        cid=str(r.get('Card ID','')).strip();tid=str(r.get('Topic ID','')).strip()
        if not cid or not tid:raise ValueError(f'Row {n}: missing IDs; use Recall menu to assign IDs first')
        if cid in ids or tid in topics:raise ValueError(f'Row {n}: duplicate card or topic ID')
        ids.add(cid);topics.add(tid)
        if status=='Draft':continue
        def text(k):
            v=str(r.get(k,'')).strip()
            if not v:raise ValueError(f'Row {n}: missing {k}')
            return v
        def integer(k,minimum=0):
            v=float(text(k))
            if not math.isfinite(v) or not v.is_integer() or v<minimum:raise ValueError(f'Row {n}: invalid {k}')
            return int(v)
        ch=integer('Chapter No',1);name=text('Chapter Name');section=text('Section No');sname=text('Section Name');order=integer('Order',1)
        if (ch,order) in orders:raise ValueError(f'Row {n}: duplicate order in chapter')
        orders.add((ch,order))
        if ch in chapters and chapters[ch]!=name:raise ValueError(f'Row {n}: conflicting chapter name')
        chapters[ch]=name
        if (ch,section) in sections and sections[ch,section]!=sname:raise ValueError(f'Row {n}: conflicting section name')
        sections[ch,section]=sname
        papers=integer('Papers');eligible=integer('Eligible Papers',1)
        if papers>eligible:raise ValueError(f'Row {n}: Papers exceeds Eligible Papers')
        points=[s.strip() for s in text('Answer Points').splitlines() if s.strip()]
        c=dict(existing.get(cid,{}));title=text('Topic')
        if cid in existing and text('Answer Points')=='\n'.join(existing[cid]['points']).strip():points=existing[cid]['points']
        c.update(id=cid,topicId=tid,topicIds=[tid],chapter=ch,chapterName=name,section=section,sectionName=sname,title=title,question=title,points=points,advice=str(r.get('Examiner Advice','')).strip(),papers=papers,eligible=eligible,frequency=math.floor(100*papers/eligible+.5),sheetSourceReferences=str(r.get('Source References','')).strip())
        c.setdefault('adviceSources',[]);c.setdefault('answerSources',[])
        out.append((ch,order,c))
    if not out:raise ValueError('No Published cards: release refused')
    return [x[2] for x in sorted(out,key=lambda x:x[:2])]
def build(source,dest):
    if source.suffix.lower()=='.csv':
        with source.open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
    else:
        data=json.loads(source.read_text());rows=[dict(zip(data['heads'],row)) for row in data['rows']]
    cards=convert(rows,json.loads((ROOT/'cards.json').read_text()))
    if dest.resolve()==ROOT.resolve() or dest.resolve() in ROOT.resolve().parents:raise ValueError('Choose a separate release folder')
    dest.mkdir(parents=True,exist_ok=True)
    for f in ['index.html','style.css','app.js','favicon.svg']:shutil.copy2(ROOT/f,dest/f)
    chapters=[{'number':ch,'name':next(c['chapterName'] for c in cards if c['chapter']==ch)} for ch in sorted({c['chapter'] for c in cards})]
    (dest/'cards.json').write_text(json.dumps(cards,ensure_ascii=False,indent=2))
    (dest/'cards.js').write_text('const CHAPTERS = '+json.dumps(chapters,ensure_ascii=False)+';\nconst CARDS = '+json.dumps(cards,ensure_ascii=False).replace('</','<\\/')+';\n')
    h=(dest/'index.html').read_text().replace('<link rel="stylesheet" href="style.css">','<style>'+(dest/'style.css').read_text()+'</style>')
    import urllib.parse
    h=h.replace('href="favicon.svg"','href="data:image/svg+xml,'+urllib.parse.quote((dest/'favicon.svg').read_text(),safe='')+'"')
    for f in ['cards.js','app.js']:h=h.replace('<script src="'+f+'"></script>','<script>'+(dest/f).read_text().replace('</','<\\/')+'</script>')
    (dest/'Recall.html').write_text(h)
    print(f'Built {len(cards)} cards across {len(chapters)} chapters in {dest}')
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('--output',type=Path,default=ROOT/'release');a=p.parse_args();build(a.source,a.output)
