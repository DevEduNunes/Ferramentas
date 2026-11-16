"""Gera ../../curriculo/index.html (arquivo único) embutindo o JSZip usado pelo PDF Local."""
import pathlib, re

here = pathlib.Path(__file__).parent
root = here.parent.parent
out = root / "curriculo" / "index.html"

def lib(path):
    s = path.read_text(encoding="utf-8")
    s = re.sub(r"</(script)", r"<\/\1", s, flags=re.I)   # não fechar a tag <script>
    return s.replace("<!--", r"<\!--")                  # evita o modo "script escaped" do parser HTML

html = (here / "template.html").read_text(encoding="utf-8")
html = html.replace("/*__JSZIP__*/", lib(root / "src" / "pdf" / "jszip.min.js"))
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8", newline="\n")
print("ok:", out, len(html), "bytes")
