#!/bin/bash
export LD_LIBRARY_PATH="/workspace/test/libs/db/alsa/x/usr/lib/x86_64-linux-gnu:/workspace/test/libs/db/libnspr4/usr/lib/x86_64-linux-gnu:/workspace/test/libs/db/libnss3/usr/lib/x86_64-linux-gnu"
node /workspace/test/run.mjs "$@"
