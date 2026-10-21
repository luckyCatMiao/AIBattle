#!/bin/bash
export LD_LIBRARY_PATH=/tmp/libs/ext/usr/lib/x86_64-linux-gnu
node /workspace/tests/tools/shot.js "$@" >/dev/null && python3 -c "
import json
from PIL import Image
d=json.load(open('/tmp/crop.json'))
im=Image.open('/tmp/full.png').crop((d['cx'],d['cy'],d['cx']+d['w'],d['cy']+d['h']))
im.save('/workspace/tests/shots/'+__import__('sys').argv[1]+'.png') if False else None
" 
