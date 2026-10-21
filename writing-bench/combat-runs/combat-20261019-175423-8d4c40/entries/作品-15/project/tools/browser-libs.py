import urllib.request, re, pathlib, subprocess
base = pathlib.Path('/tmp/rust-browser-libs')
base.mkdir(exist_ok=True)
packages = [
 ('nspr','https://deb.debian.org/debian/pool/main/n/nspr/',r'libnspr4_4\.35-1_amd64\.deb'),
 ('nss','https://deb.debian.org/debian/pool/main/n/nss/',r'libnss3_3\.87\.1-[^"<>]*_amd64\.deb'),
 ('alsa','https://deb.debian.org/debian/pool/main/a/alsa-lib/',r'libasound2_1\.2\.8-[^"<>]*_amd64\.deb')
]
for name, url, pat in packages:
 page = urllib.request.urlopen(url).read().decode()
 matches = re.findall(r'href="('+pat+')"', page)
 if not matches:
  print(name, 'available', re.findall(r'href="([^"<>]*amd64.deb)"',page));continue
 item = matches[-1]
 folder = base / name
 folder.mkdir(exist_ok=True)
 archive = folder / 'package.deb'
 urllib.request.urlretrieve(url+item,archive)
 out = folder / 'extracted'
 out.mkdir(exist_ok=True)
 subprocess.run(['dpkg-deb','-x',str(archive),str(out)], check=True)
 print(name, archive)
