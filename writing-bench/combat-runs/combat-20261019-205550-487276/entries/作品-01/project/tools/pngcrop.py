import sys, zlib, struct

def read_png(path):
    d=open(path,'rb').read()
    assert d[:8]==b'\x89PNG\r\n\x1a\n'
    i=8; idat=b''; w=h=bd=ct=None; plte=None
    while i<len(d):
        ln=struct.unpack('>I',d[i:i+4])[0]; typ=d[i+4:i+8]; data=d[i+8:i+8+ln]; i+=12+ln
        if typ==b'IHDR':
            w,h,bd,ct,comp,filt,inter=struct.unpack('>IIBBBBB',data)
            assert bd==8 and inter==0, (bd,inter)
        elif typ==b'IDAT': idat+=data
        elif typ==b'PLTE': plte=data
        elif typ==b'IEND': break
    ch={0:1,2:3,3:1,4:2,6:4}[ct]
    raw=zlib.decompress(idat)
    stride=w*ch
    out=bytearray(h*stride)
    prev=bytearray(stride)
    p=0
    for y in range(h):
        f=raw[p]; p+=1
        line=bytearray(raw[p:p+stride]); p+=stride
        if f==1:
            for x in range(ch,stride): line[x]=(line[x]+line[x-ch])&255
        elif f==2:
            for x in range(stride): line[x]=(line[x]+prev[x])&255
        elif f==3:
            for x in range(stride):
                a=line[x-ch] if x>=ch else 0
                line[x]=(line[x]+((a+prev[x])>>1))&255
        elif f==4:
            for x in range(stride):
                a=line[x-ch] if x>=ch else 0
                b=prev[x]; c=prev[x-ch] if x>=ch else 0
                pp=a+b-c; pa=abs(pp-a); pb=abs(pp-b); pc=abs(pp-c)
                pr=a if (pa<=pb and pa<=pc) else (b if pb<=pc else c)
                line[x]=(line[x]+pr)&255
        out[y*stride:(y+1)*stride]=line
        prev=line
    return w,h,ch,ct,plte,out

def write_png(path,w,h,rgb):
    raw=b''.join(b'\x00'+rgb[y*w*3:(y+1)*w*3] for y in range(h))
    def chunk(t,data):
        return struct.pack('>I',len(data))+t+data+struct.pack('>I',zlib.crc32(t+data)&0xffffffff)
    d=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b'')
    open(path,'wb').write(d)

def main(src,dst,x0,y0,x1,y1,scale=1):
    w,h,ch,ct,plte,px=read_png(src)
    x0=max(0,int(x0)); y0=max(0,int(y0)); x1=min(w,int(x1)); y1=min(h,int(y1))
    cw=x1-x0; chh=y1-y0
    ow,oh=cw*scale,chh*scale
    rgb=bytearray(ow*oh*3)
    for yy in range(oh):
        sy=y0+yy//scale
        for xx in range(ow):
            sx=x0+xx//scale
            o=(sy*w+sx)*ch
            if ct==6: r,g,b=px[o],px[o+1],px[o+2]
            elif ct==2: r,g,b=px[o],px[o+1],px[o+2]
            elif ct==3:
                idx=px[o]*3; r,g,b=plte[idx],plte[idx+1],plte[idx+2]
            elif ct==0: r=g=b=px[o]
            else: r=g=b=px[o]
            q=(yy*ow+xx)*3; rgb[q]=r; rgb[q+1]=g; rgb[q+2]=b
    write_png(dst,ow,oh,rgb)
    print(dst,ow,oh)

if __name__=='__main__':
    a=sys.argv
    main(a[1],a[2],int(a[3]),int(a[4]),int(a[5]),int(a[6]),int(a[7]) if len(a)>7 else 1)
