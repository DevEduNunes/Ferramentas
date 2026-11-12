# Ferramentas

Ferramentas gratuitas que rodam 100% no navegador: sem upload, sem cadastro, sem servidor.
Publicado em **https://eduardonunes.dev/Ferramentas/**

## Ferramentas disponíveis

| Ferramenta | Endereço | O que faz |
|---|---|---|
| **PDF Local** | `/Ferramentas/pdf/` | Juntar, dividir, organizar páginas, comprimir, imagens ⇄ PDF e marca d'água. Funciona offline. |
| **Fórmulas do Excel** | `/Ferramentas/excel/` | Receitas para preencher, catálogo de 100 funções e explicador/conversor de fórmulas entre português (`;`) e inglês (`,`). |
| **Fórmulas DAX** | `/Ferramentas/dax/` | Receitas de medidas para Power BI, catálogo de 109 funções e formatador com conversão de separador (`,` ⇄ `;`). |

## Estrutura

```
index.html          landing page com a lista de ferramentas
pdf/index.html      PDF Local (gerado; arquivo único e offline)
excel/index.html    Fórmulas do Excel (HTML único, sem build)
dax/index.html      Fórmulas DAX (HTML único, sem build)
src/pdf/            código-fonte do PDF Local + bibliotecas + build.py
.nojekyll           impede o GitHub de processar o site com Jekyll
```

## Privacidade

- Todo o processamento acontece no navegador. Não existe backend, banco de dados nem login.
- Cada página declara uma Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) que impede requisições de rede. No PDF Local, as bibliotecas (pdf-lib, pdf.js e JSZip) estão embutidas no próprio arquivo.
- Para conferir: abra as ferramentas de desenvolvedor (F12), aba *Network*, e use uma ferramenta. Nenhum upload deve aparecer.

## Publicar (GitHub Pages)

Pré-requisito: o site principal já é servido pelo GitHub Pages com o domínio eduardonunes.dev.

1. Repositório chamado exatamente **`Ferramentas`** (a maiúscula vira parte da URL).
2. *Settings → Pages → Deploy from a branch → `main` / `(root)`*. Em conta gratuita, o repositório precisa ser público.
3. **Não crie `CNAME` aqui**: o repositório herda o domínio do site principal.
4. No menu do site principal, link `/Ferramentas/`.

Cada `git push` na `main` republica o site em cerca de 1 minuto.

## Testar localmente

Qualquer servidor estático serve. Por exemplo:

```bash
python -m http.server 8000
```

Depois abra `http://127.0.0.1:8000/`.

## Adicionar uma nova ferramenta

1. Crie `nome/index.html` (HTML puro) na raiz, com a mesma Content-Security-Policy das demais.
2. Inclua um link de volta `href="../"` na nova página.
3. Em `index.html`, adicione um card `<a class="card" href="nome/">…</a>` copiando o formato dos existentes (use a classe `card soon` para um "Em breve").

## Manter as ferramentas

### PDF Local
Edite `src/pdf/template.html` e rode, na raiz do repositório:

```bash
python src/pdf/build.py
```

Isso regenera `pdf/index.html` embutindo as bibliotecas. Não edite `pdf/index.html` diretamente.

### Fórmulas do Excel e DAX
São arquivos únicos: edite `excel/index.html` ou `dax/index.html` diretamente.

- **Catálogo:** array `F` no início do script de cada página. No Excel, cada entrada traz o nome em inglês e em português; os nomes em português seguem o Excel em português do Brasil. Confirme novos nomes na documentação da Microsoft antes de incluir (a lista oficial por ordem alfabética mistura nomes traduzidos e não traduzidos, então não use como fonte única).
- **Receitas:** array `R`. As fórmulas ficam em formato canônico (inglês, separador vírgula) com marcadores `{campo}` no Excel e `⟨campo⟩` no DAX. A página converte para o idioma ou separador escolhido na hora.
- **Conversão:** a função `convert()` troca nomes de função (só no Excel), separadores e decimais, sem mexer em textos entre aspas, nomes entre colchetes ou marcadores de campo.
- **Verificação rápida:** antes de publicar, abra a página e confira no console que todos os exemplos do catálogo têm parênteses balanceados e que a conversão de ida e volta devolve o mesmo texto.

## Limitações conhecidas

- **PDF Local:** não abre PDFs protegidos por senha. "Comprimir" converte páginas em imagens (o texto deixa de ser selecionável). A marca d'água usa a fonte Helvetica (letras latinas e acentos comuns).
- **Excel:** os nomes em português foram conferidos na documentação, mas não em um Excel instalado. Funções marcadas como 365/2019 dependem da versão.
- **DAX:** os exemplos não foram executados no Power BI. O formatador não reorganiza código com comentários (`//` ou `--`); ele só converte o separador.

## Licença das bibliotecas

O PDF Local embute pdf-lib (MIT), pdf.js (Apache-2.0) e JSZip (MIT ou GPL-3.0). Os arquivos originais ficam em `src/pdf/`.
