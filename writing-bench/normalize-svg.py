"""Align duplicate ID lookup with browser first-match lookup; keep source intact."""
import json
import re
import sys
import xml.etree.ElementTree as ET

source=open(sys.argv[1],encoding='utf-8').read()
root=ET.fromstring(source)
seen=set();duplicates=[]
for element in root.iter():
    ident=element.get('id')
    if ident:
        if ident in seen:duplicates.append((element,ident))
        seen.add(ident)
adjustments=[]
if duplicates:
    styles='\n'.join(e.text or '' for e in root.iter() if e.tag.split('}')[-1]=='style')
    selectors=re.sub(r'url\s*\([^)]*\)','',styles)
    for element,ident in duplicates:
        if re.search(r'#'+re.escape(ident)+r'(?![\w-])',selectors):
            raise ValueError('Duplicate ID used by CSS selector needs native-browser review')
        del element.attrib['id']
        adjustments.append({'duplicate_id':ident,'action':'use first occurrence for reference lookup, as in Chrome'})
    ET.register_namespace('','http://www.w3.org/2000/svg')
    ET.register_namespace('xlink','http://www.w3.org/1999/xlink')
    rendered_source=ET.tostring(root,encoding='unicode')
else:
    rendered_source=source
print(json.dumps({'svg':rendered_source,'compatibility_adjustments':adjustments},ensure_ascii=True))
