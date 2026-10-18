#!/usr/bin/env python3
"""Apply a CSS-only skin to the SHA-pinned Pitlane 0.7.2 APK.

The APK is resigned by the CI job using the SAME identity as the published
0.7.2 release. All non-presentation entries are checked byte-for-byte.
"""
import hashlib
import io
import copy
from pathlib import Path
import struct
import sys
import zipfile

EXPECTED_SHA = "916734959964e1333d38a5af83d231c18f51386f76845816749576c44d915a7f"
CSS_ENTRY = "assets/pitlane_website_skin_v073.css"

def u16(data, pos): return struct.unpack_from("<H",data,pos)[0]
def u32(data, pos): return struct.unpack_from("<I",data,pos)[0]

def replace_version(manifest):
    b = bytearray(manifest)
    if u16(b,0)!=3 or u32(b,4)!=len(b):
        raise ValueError("Not a compiled Android manifest")
    old, new = "0.7.2".encode("utf-16le"), "0.7.3".encode("utf-16le")
    if b.count(old)!=1:
        raise ValueError("Version name not unambiguous")
    b = b.replace(old,new,1)
    names = []
    pos = 8
    while pos<len(b):
        typ, head, length=struct.unpack_from("<HHI",b,pos)
        if length<head or length==0: raise ValueError("Invalid Android XML chunk")
        if typ==1:
            count,flags,start=u32(b,pos+8),u32(b,pos+16),u32(b,pos+20)
            for n in range(count):
                cur=pos+start+u32(b,pos+head+4*n)
                if flags&0x100:
                    def len8(i):
                        x=b[i]
                        return ((((x&127)<<8)|b[i+1]),i+2) if x&128 else (x,i+1)
                    _,cur=len8(cur)
                    size,cur=len8(cur)
                    name=bytes(b[cur:cur+size]).decode("utf-8")
                else:
                    size=u16(b,cur);cur+=2
                    if size&32768:
                        size=((size&32767)<<16)|u16(b,cur);cur+=2
                    name=bytes(b[cur:cur+size*2]).decode("utf-16le")
                names.append(name)
        pos+=length
    pos=8
    found=0
    while pos<len(b):
        typ,head,length=struct.unpack_from("<HHI",b,pos)
        if typ==0x0102:
            start,size,count=struct.unpack_from("<HHH",b,pos+24)
            for n in range(count):
                attr=pos+16+start+n*size
                index=u32(b,attr+4)
                if index<len(names) and names[index]=="versionCode":
                    if b[attr+15]!=0x10 or u32(b,attr+16)!=28:
                        raise ValueError("Unexpected version code")
                    struct.pack_into("<I",b,attr+16,29)
                    found+=1
        pos+=length
    if found!=1: raise ValueError("versionCode not found exactly once")
    return bytes(b)

def main(apk_file,css_file,out_file):
    apk_data=Path(apk_file).read_bytes()
    got=hashlib.sha256(apk_data).hexdigest()
    if got!=EXPECTED_SHA: raise ValueError(f"Unexpected input APK SHA256: {got}")
    css=Path(css_file).read_bytes()
    with zipfile.ZipFile(io.BytesIO(apk_data)) as original:
        entries=original.namelist()
        html=original.read("assets/index.html").decode("utf-8")
        if html.count("</head>")!=1 or "pitlane_website_skin_v073.css" in html:
            raise ValueError("Unexpected Pitlane entry HTML")
        updated=html.replace("</head>",
            '<link rel="stylesheet" href="pitlane_website_skin_v073.css">\n</head>',1).encode("utf-8")
        manifest=replace_version(original.read("AndroidManifest.xml"))
        with zipfile.ZipFile(out_file,"w") as dst:
            for info in original.infolist():
                name=info.filename
                if name.startswith("META-INF/") and name.upper().endswith((".SF",".RSA",".DSA",".EC",".MF")):
                    continue
                content=(manifest if name=="AndroidManifest.xml" else
                         updated if name=="assets/index.html" else
                         original.read(name))
                dst.writestr(copy.copy(info),content)
            dst.writestr(CSS_ENTRY,css,compress_type=zipfile.ZIP_DEFLATED)
        with zipfile.ZipFile(out_file) as output:
            assert output.read(CSS_ENTRY)==css
            assert "0.7.3".encode("utf-16le") in output.read("AndroidManifest.xml")
            for name in entries:
                if name in ("AndroidManifest.xml","assets/index.html"): continue
                if name.startswith("META-INF/") and name.upper().endswith((".SF",".RSA",".DSA",".EC",".MF")): continue
                if output.read(name)!=original.read(name):
                    raise ValueError("Unexpected change to existing APK asset "+name)
    print("Validated visual-only patch of Pitlane 0.7.2 to version 0.7.3/29.")
if __name__=="__main__":
    if len(sys.argv)!=4: raise SystemExit("Usage: patch.py input.apk skin.css unsigned.apk")
    main(*sys.argv[1:])
