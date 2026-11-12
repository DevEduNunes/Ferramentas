# Ferramentas

Ferramentas gratuitas que rodam 100% no navegador (sem upload, sem cadastro).
Publicado em **https://eduardonunes.dev/Ferramentas/**

```
index.html          landing page com a lista de ferramentas
pdf/index.html      PDF Local (gerado; arquivo único e offline)
src/pdf/            código-fonte do PDF Local + bibliotecas + build.py
.nojekyll           impede o GitHub de processar o site com Jekyll
```

## Publicar (GitHub Pages)
Pré-requisito: o site principal já é servido pelo GitHub Pages com o domínio eduardonunes.dev.

1. Repositório chamado exatamente **`Ferramentas`** (a maiúscula vira parte da URL).
2. *Settings → Pages → Deploy from a branch → `main` / `(root)`*.
3. **Não crie `CNAME` aqui**: o repositório herda o domínio do site principal.
4. No menu do site principal, link `/Ferramentas/`.

## Adicionar uma nova ferramenta
1. Crie `nome/index.html` (HTML puro) na raiz.
2. Em `index.html`, troque o card "Em breve" (ou copie o card do PDF) por `<a class="card" href="nome/">…</a>`.
3. Inclua um link de volta `href="../"` na nova página.

## Atualizar o PDF Local
Edite `src/pdf/template.html` e rode, na raiz do repositório:

```bash
python src/pdf/build.py
```
