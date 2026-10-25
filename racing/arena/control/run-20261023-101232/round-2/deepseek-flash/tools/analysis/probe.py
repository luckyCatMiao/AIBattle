import json,gzip,sys
d=json.load(gzip.open(sys.argv[1],'rt',encoding='utf-8'))
fr=d["frames"]
a,b=int(sys.argv[2]),int(sys.argv[3])
for f in fr[a:b]:
    c0,c1=f["cars"][0],f["cars"][1]
    print("f%3d t%6.2f | p0 lap%d cp%2d prog%7.2f spd%5.2f x%6.2f y%6.2f dr%d bo%d off%d | p1 lap%d cp%2d prog%7.2f spd%5.2f x%6.2f y%6.2f dr%d bo%d off%d" % (
        f["frame"], f["frame"]/20-1.5, c0["lap"],c0["nextCp"],c0["progress"],c0["speed"],c0["x"],c0["y"],c0["drifting"],c0["boosting"],c0["offRoad"],
        c1["lap"],c1["nextCp"],c1["progress"],c1["speed"],c1["x"],c1["y"],c1["drifting"],c1["boosting"],c1["offRoad"]))
