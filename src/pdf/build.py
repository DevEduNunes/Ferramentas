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

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding="utf-8")
print("OK ->", out, round(out.stat().st_size / 1e6, 2), "MB")
