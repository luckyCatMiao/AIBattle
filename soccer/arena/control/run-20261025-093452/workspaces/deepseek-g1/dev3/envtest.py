import os, sys
sys.stderr.write("SHOTM=%r OUTLET=%r AGG=%r\n" % (os.environ.get("SOCCER_SHOTM"), os.environ.get("SOCCER_OUTLET"), os.environ.get("SOCCER_AGG")))
