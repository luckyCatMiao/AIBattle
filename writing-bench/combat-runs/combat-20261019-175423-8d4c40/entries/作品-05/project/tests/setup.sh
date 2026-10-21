#!/bin/bash
# Recreates the headless-test toolchain in /tmp (the workspace fs denies npm chmod).
set -e
export PATH=/usr/local/bin:$PATH
mkdir -p /tmp/pw /tmp/libs/ext
if [ ! -d /tmp/pw/node_modules/playwright ]; then
  cd /tmp/pw && npm init -y >/dev/null 2>&1 || true
  npm i playwright@1.64.1 >/dev/null 2>&1 || true
  npx playwright install chromium >/dev/null 2>&1 || true
fi
cd /tmp/libs
for p in "n/nss/libnss3_3.110-1+deb13u4_amd64.deb" "n/nspr/libnspr4_4.36-1_amd64.deb" "a/alsa-lib/libasound2_1.2.8-1+b1_amd64.deb"; do
  f=$(basename $p)
  [ -f $f ] || curl -sSLO "http://deb.debian.org/debian/pool/main/$p" || true
  dpkg-deb -x $f ext 2>/dev/null || (ar x $f 2>/dev/null && tar -xf data.tar.* -C ext) || true
done
echo ready
