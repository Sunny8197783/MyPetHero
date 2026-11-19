"""폰트에서 게임에 쓰는 글자만 남기고 글꼴 이름을 바꾼다 (OFL 예약 글꼴 이름 조항).
사용: python3 -I scripts/subset-font.py <원본> <글자 목록 파일> <출력.woff> <새 이름>
"""
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

src, text_file, out, name = sys.argv[1:5]
options = subset.Options()
options.layout_features = ["*"]
options.hinting = False
options.notdef_outline = True
options.name_IDs = ["*"]
font = TTFont(src)
with open(text_file, encoding="utf-8") as f:
    text = f.read()
subsetter = subset.Subsetter(options)
subsetter.populate(text=text)
subsetter.subset(font)
for record in font["name"].names:
    if record.nameID in (1, 4, 16):
        record.string = name
    elif record.nameID == 6:
        record.string = name.replace(" ", "")
    elif record.nameID == 3:
        record.string = name + " (subset)"
if "CFF " in font:
    cff = font["CFF "].cff
    cff.fontNames[0] = name.replace(" ", "")
    top = cff.topDictIndex[0]
    for key in ("FullName", "FamilyName"):
        if hasattr(top, key):
            setattr(top, key, name)
font.flavor = "woff"
font.save(out)
