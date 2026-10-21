#!/bin/bash
# usage: cropall.sh pose1 pose2 ...
export LD_LIBRARY_PATH=/tmp/libs/ext/usr/lib/x86_64-linux-gnu
for pose in "$@"; do
  node /workspace/tests/tools/shot.js "$pose" >/dev/null
  POSE=$pose python3 -c "
import json,os
from PIL import Image
d=json.load(open('/tmp/crop.json'))
im=Image.open('/tmp/full.png').crop((d['cx'],d['cy'],d['cx']+d['w'],d['cy']+d['h']))
im.save('/workspace/tests/shots/%s.png'%os.environ['POSE'])
"
done
echo done
