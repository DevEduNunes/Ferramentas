"""Gera ../../pdf/index.html (arquivo único, offline) embutindo as bibliotecas desta pasta."""
import pathlib, re

here = pathlib.Path(__file__).parent
out = here.parent.parent / "pdf" / "index.html"

def lib(name):
    s = (here / name).read_text(encoding="utf-8")
    s = re.sub(r"</(script)", r"<\/\1", s, flags=re.I)   # não fechar a tag <script>
    return s.replace("<!--", "<\\!--")                   # evita o modo "script escaped" do parser HTML

html = (here / "template.html").read_text(encoding="utf-8")
for key, name in [("PDFLIB", "pdf-lib.min.js"), ("PDFJS", "pdf.min.js"),
                  ("JSZIP", "jszip.min.js"), ("PDFWORKER", "pdf.worker.min.js")]:
    html = html.replace(f"/*__{key}__*/", lib(name))

import base64
def font_face(family, weight, fname):
    data = base64.b64encode((here.parent.parent / "assets" / "fonts" / fname).read_bytes()).decode()
    return ("@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:swap;"
            "src:url(data:font/woff2;base64,%s) format('woff2')}" % (family, weight, data))
fonts = font_face("Space Grotesk", "300 700", "spacegrotesk-latin.woff2") + "\n" + font_face("Roboto Slab", "300 900", "robotoslab-latin.woff2")
html = html.replace("/*__FONTS__*/", fonts)

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding="utf-8")
print("OK ->", out, round(out.stat().st_size / 1e6, 2), "MB")
