# Ferramentas

Ferramentas gratuitas que rodam **100% no navegador**: sem upload, sem cadastro, sem servidor.

**Site:** https://eduardonunes.dev/Ferramentas/

| | |
|---|---|
| **Privacidade** | Nada sai do seu computador. Cada página bloqueia requisições de rede (veja [Privacidade](#privacidade)). |
| **Tecnologia** | HTML, CSS e JavaScript puros, sem framework e sem etapa de build (exceto o PDF Local). |
| **Hospedagem** | GitHub Pages, no caminho `/Ferramentas`. |

## Ferramentas

| Ferramenta | Endereço | O que faz |
|---|---|---|
| **PDF Local** | [`/pdf/`](https://eduardonunes.dev/Ferramentas/pdf/) | 28 ferramentas para PDF, ver [abaixo](#pdf-local). Funciona offline. |
| **Fórmulas do Excel** | [`/excel/`](https://eduardonunes.dev/Ferramentas/excel/) | Receitas para preencher, catálogo de 100 funções e conversor de fórmulas entre português (`;`) e inglês (`,`). |
| **Fórmulas DAX** | [`/dax/`](https://eduardonunes.dev/Ferramentas/dax/) | Receitas de medidas para Power BI, catálogo de 109 funções e formatador com conversão de separador (`,` ⇄ `;`). |
| **Consultas SQL** | [`/sql/`](https://eduardonunes.dev/Ferramentas/sql/) | 35 receitas, catálogo de 73 comandos e formatador que explica a consulta passo a passo e converte entre SQLite, T-SQL e PostgreSQL. **Não executa SQL**: não há banco conectado. |
| **Power Query (M)** | [`/powerquery/`](https://eduardonunes.dev/Ferramentas/powerquery/) | 30 receitas de consultas (fontes de dados, limpeza, colunas, linhas, combinar, datas), catálogo de 165 funções da linguagem M e formatador que organiza a consulta e explica cada passo. **Não executa M**: gera e analisa o código. |

As páginas de Excel, DAX, SQL e Power Query aceitam links diretos, por exemplo `/excel/#receitas/ses`, `/dax/#catalogo`, `/sql/#explicar` e `/powerquery/#receitas/csv`.

### PDF Local

| Grupo | Ferramentas |
|---|---|
| Organizar | juntar, dividir, organizar páginas, girar, recortar, números de página |
| Converter e criar | PDF → imagens, imagens → PDF, digitalizar (fotos → PDF), texto → PDF, PDF → texto / Markdown, PDF → Word (só o texto), comprimir |
| Editar e revisar | editar (texto, formas, desenho, imagens, campos), assinar, preencher formulário, marca d'água, ocultar (redação definitiva), comparar |
| Assinatura digital | criar certificado (`.pfx`), assinar digitalmente (PKCS#7), assinar em lote, validar assinaturas |
| Segurança e reparo | proteger com senha (AES-256), remover senha, metadados, reparar |

**Fora do escopo de propósito** (dependem de servidor, de IA ou de modelos pesados): Word, PowerPoint e Excel → PDF, PDF → PowerPoint e Excel, OCR, resumir e traduzir com IA, HTML → PDF por URL e PDF/A. A própria página explica cada caso em "O que não dá para fazer aqui".

## Estrutura

```
index.html          landing page com a lista de ferramentas
pdf/index.html      PDF Local (GERADO por build.py; arquivo único e offline)
excel/index.html    Fórmulas do Excel (HTML único, sem build)
dax/index.html      Fórmulas DAX (HTML único, sem build)
sql/index.html      Consultas SQL (HTML único, sem build)
powerquery/index.html  Power Query / linguagem M (HTML único, sem build)
assets/tema.css     tema compartilhado (landing, Excel, DAX, SQL e Power Query)
assets/fonts/       Space Grotesk e Roboto Slab (as mesmas do eduardonunes.dev)
assets/favicon.svg  ícone do site
src/pdf/            código-fonte do PDF Local (veja abaixo)
.nojekyll           impede o GitHub de processar o site com Jekyll
```

```
src/pdf/
  template.html     CSS, utilitários, ferramentas originais, menu (MENU) e navegação
  tools-core.js     visualizador de página com camada de desenho, rasterização, texto invisível
  tools-basic.js    girar, recortar, números, metadados, reparar, texto → PDF, digitalizar
  tools-convert.js  PDF → texto / Markdown, PDF → Word
  tools-view.js     editar (inclui texto já existente), assinar (visual), formulários, ocultar, comparar
  tools-sign.js     criar certificado (.pfx), assinar digitalmente (PKCS#7, individual e em lote) e validar assinaturas (um ou vários PDFs)
  tools-secure.js   proteger (AES-256), remover senha, página de limites
  build.py          gera pdf/index.html
  *.min.js          pdf-lib, pdf.js (+ worker), JSZip e node-forge
```

## Privacidade

- Todo o processamento acontece no navegador. Não existe backend, banco de dados nem login.
- Cada página declara uma Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) que impede requisições de rede. As páginas de landing, Excel, DAX, SQL e Power Query só carregam CSS e fontes do próprio site (`style-src 'self'`, `font-src 'self'`). O PDF Local não depende de nenhum arquivo externo: as bibliotecas e as fontes estão embutidas nele.
- Para conferir: abra as ferramentas de desenvolvedor (F12), aba *Network*, e use uma ferramenta. Nenhum upload deve aparecer.
- No console aparecem dois avisos de CSP do Cloudflare (`beacon.min.js` e `cdn-cgi/challenge-platform`). São esperados e inofensivos: a política os bloqueia de propósito, e por isso o Web Analytics do Cloudflare não conta visitas aqui.

## Visual

O padrão é o tema escuro, igual ao eduardonunes.dev, e cada página tem um botão **Modo claro / Modo escuro** (no cabeçalho; no PDF Local, na barra lateral). A escolha fica guardada no navegador (`localStorage`, chave `ferramentas-tema`) e vale para todas as ferramentas. O tema escuro segue o eduardonunes.dev: fundo `#030305`, acento roxo `#8a5bd8` / `#a58be6`, cantos retos, bordas de 1px, títulos em Roboto Slab e rótulos em caixa-alta espaçada. As cores e fontes ficam em variáveis no início de `assets/tema.css`; o modo claro redefine as mesmas variáveis em `html[data-theme=light]`. Use `var(--on)` (e não `#fff`) para texto em destaque ao passar o mouse, senão o contraste quebra no modo claro.

- **Landing, Excel, DAX, SQL e Power Query** usam o `assets/tema.css`.
- **PDF Local** é um único arquivo: o CSS fica dentro do `src/pdf/template.html` e o `build.py` embute as fontes (latin) em base64.
- Se mudar a paleta (escura ou clara), atualize os dois lugares.
- **Cache:** o CSS é carregado com versão (`tema.css?v=3`). Ao alterar o `tema.css`, incremente o número nas cinco páginas (landing, Excel, DAX, SQL e Power Query), senão alguns navegadores mostram o site sem estilo.

## Rodar localmente

Qualquer servidor estático serve:

```bash
python -m http.server 8000
```

Depois abra `http://127.0.0.1:8000/`. Abrir os arquivos por `file://` não foi testado, exceto o `pdf/index.html`, que é autônomo.

## Manter as ferramentas

### PDF Local

Edite o código-fonte em `src/pdf/` e rode, na raiz do repositório:

```bash
python src/pdf/build.py
```

Isso regenera `pdf/index.html` embutindo bibliotecas, fontes e módulos. **Não edite `pdf/index.html` à mão.**

Para criar uma ferramenta nova: adicione `tools.push({ id, title, desc, mount(root) { ... } })` em um dos módulos, inclua o `id` na constante `MENU` do `template.html` e, se criar um módulo novo, acrescente-o à lista `TOOL_FILES` do `build.py`. Os módulos compartilham o escopo global da página, então `tools-core.js` (utilitários e visualizador) vem sempre primeiro.

### Excel, DAX, SQL e Power Query

Arquivos únicos: edite `excel/index.html`, `dax/index.html`, `sql/index.html` ou `powerquery/index.html` diretamente.

- **Catálogo:** array `F` no início do script. No Excel, cada entrada traz o nome em inglês e em português (os nomes em português seguem o Excel do Brasil; **confirme novos nomes em um Excel em português de verdade**, não na documentação: a lista oficial mistura nomes traduzidos e não traduzidos, e a documentação já levou a erros, como `PROCURAR`/`LOCALIZAR` invertidos. Veja a [verificação contra o Excel](#validação)). No SQL, as entradas são criadas com `E(nome, categoria, dialetos, descrição, sintaxe, exemplo, dica, equivalentes)`, em que `dialetos` é uma string com `s` (SQLite), `t` (T-SQL) e `p` (PostgreSQL).
- **Receitas:** array `R`. No Excel e no DAX as fórmulas ficam em formato canônico (inglês, vírgula) com marcadores `{campo}` (Excel) ou `⟨campo⟩` (DAX). No SQL, os modelos usam `⟨campo⟩` e podem ser um texto ou um objeto por dialeto (`s`, `t`, `p`, `sp`, `st`, `tp`, `c`). No Power Query, cada receita é `kind: 'full'` (consulta completa) ou `kind: 'step'` (passo para colar antes do `in`) e os marcadores aceitam filtros, como `⟨campo|list⟩` (lista de textos), `⟨campo|id⟩`, `⟨campo|types⟩`, `⟨campo|sort⟩` e `⟨campo|aggs⟩`.
- **Conversão:** no Excel e no DAX, `convert()` troca nomes de função (só no Excel), separadores e decimais, sem mexer em textos entre aspas, nomes entre colchetes ou marcadores. No SQL, `convertSql()` cobre limite de linhas, funções de texto, nulos, data atual, concatenação e aspas de identificadores, e avisa sobre o que não converte. O Power Query não tem conversão (o código M é igual em qualquer idioma); em vez disso, o formatador de M divide a consulta em passos, organiza as linhas, explica cada passo com os argumentos rotulados e aponta problemas (parênteses, vírgula faltando, nome repetido, passo sem uso).
- **Verificação rápida** (console, antes de publicar): todos os exemplos do catálogo com parênteses balanceados; conversão de ida e volta devolvendo o mesmo texto (Excel e DAX); todas as receitas do SQL nos três dialetos e as do Power Query sem sobrar `⟨` e com parênteses balanceados.

### Nova ferramenta de página única

1. Crie `nome/index.html` com a mesma Content-Security-Policy das páginas Excel, DAX e SQL.
2. Carregue `../assets/tema.css` (com a mesma versão `?v=`), use o cabeçalho `header.topbar` e o "kicker" das outras e deixe o logo apontando para `../`.
3. Em `index.html`, adicione um `<a class="tool" href="nome/">…</a>` copiando o formato dos existentes e inclua o link no menu (`header.topbar`) da landing, de Excel, DAX, SQL e Power Query.
4. Atualize a numeração dos kickers (`02 / 05` e semelhantes) e este README.

## Publicar (GitHub Pages)

Pré-requisito: o site principal já é servido pelo GitHub Pages com o domínio eduardonunes.dev.

1. Repositório chamado exatamente **`Ferramentas`** (a maiúscula vira parte da URL).
2. *Settings → Pages → Deploy from a branch → `main` / `(root)`*. Em conta gratuita, o repositório precisa ser público.
3. **Não crie `CNAME` aqui**: o repositório herda o domínio do site principal.
4. No menu do site principal, link para `/Ferramentas/`.

Cada `git push` na `main` republica o site em cerca de 1 a 3 minutos. Evite abrir uma URL nova antes do deploy terminar: a CDN pode guardar o 404 por alguns minutos (teste com `?x=aleatório`).

## Limitações conhecidas

- **PDF Local:**
  - "Remover senha", o plano B do "Reparar" e "Comprimir" refazem as páginas como imagem (o pdf-lib não abre PDF criptografado). As duas primeiras mantêm uma camada de texto invisível para busca; "Comprimir" não.
  - "Ocultar" também rasteriza as páginas afetadas, de propósito, para o texto escondido sumir de verdade.
  - "Proteger" usa uma implementação própria de AES-256 (revisão 6), conferida com o pdf.js; ainda não foi aberta no Adobe Reader.
  - "PDF → Word" e "PDF → Texto" só extraem texto: tabelas, colunas e imagens não são reconstruídas.
  - "Assinar PDF" é uma assinatura visual (imagem), sem valor criptográfico.
  - "Assinar digitalmente" grava uma assinatura PKCS#7 destacada (adbe.pkcs7.detached) com um certificado `.pfx`/`.p12`. Foi conferida com o OpenSSL (assinatura válida; arquivo adulterado é rejeitado), mas ainda não aberta no Adobe Reader. Não há carimbo de tempo de uma autoridade (a data é a do relógio do computador) nem suporte a A3 (token/cartão). Reescrever o PDF invalida assinaturas anteriores.
  - "Validar assinatura" confere o resumo e a assinatura RSA (PKCS#7 com RSA e SHA-1/256/384/512) e mostra o certificado do assinante. Não valida a cadeia de confiança até uma autoridade (para ICP-Brasil use validar.iti.gov.br); ECDSA e carimbos de tempo não são suportados.
  - "Assinar em lote" assina vários PDFs com o mesmo `.pfx` e entrega um ZIP; o carimbo visível usa um canto da primeira ou da última página (páginas giradas são assinadas sem carimbo). Cada arquivo é conferido antes de entrar no ZIP e os que falham aparecem com o motivo. "Validar assinatura" aceita vários PDFs, mostra uma tabela-resumo e gera um relatório CSV. Tudo fica na memória do navegador: para lotes muito grandes, divida em partes.
  - "Criar certificado" gera um certificado **autoassinado**: protege a integridade, mas nenhuma autoridade atesta a identidade. Para valor jurídico pleno no Brasil use um certificado ICP-Brasil A1.
  - Em "Editar PDF", a edição de texto existente cobre o original e escreve o novo por cima (fonte aproximada); o texto antigo continua no arquivo. Use "Ocultar" para removê-lo de verdade.
  - Textos novos usam fontes padrão do PDF (Helvetica, Times e Courier): letras latinas e acentos comuns.
- **Excel:** as fórmulas foram conferidas em um Excel 16 em português do Brasil. Funções marcadas como 365/2019 dependem da versão, e os exemplos usam dados genéricos, então o resultado do seu arquivo pode ser outro.
- **DAX:** os exemplos não foram executados no Power BI. O formatador não reorganiza código com comentários (`//` ou `--`); ele só converte o separador.
- **SQL:** as receitas foram executadas em SQLite, mas **não** em SQL Server nem em PostgreSQL. A conversão entre dialetos cobre só os casos comuns; datas e tipos de coluna viram avisos.
- **Power Query:** as consultas foram executadas no Excel, exceto a de SharePoint (sem acesso para testar); não foram abertas no Power BI. A página não executa M.

## Validação

Conferido em 13/11/2026 por automação, em um Excel 16 em português (Brasil) e no SQLite 3.50 do Python:

| Ferramenta | O que foi conferido | Resultado |
|---|---|---|
| Excel | 149 fórmulas (receitas e exemplos do catálogo) em inglês e em português; tradução comparada com a do próprio Excel (`Formula2` × `Formula2Local`) | 7 nomes em português corrigidos; depois disso, 0 divergências e conversão de ida e volta igual nas 149 |
| Power Query | 92 variantes das 30 receitas executadas no Excel | Todas carregam, exceto SharePoint (não testado) |
| SQL | 68 variantes de receita em SQLite | Todas rodam |
| DAX, T-SQL, PostgreSQL | não conferidos (sem Power BI, SQL Server ou PostgreSQL à mão) | pendente |

## Licença das bibliotecas e fontes

O PDF Local embute pdf-lib (MIT), pdf.js (Apache-2.0) e JSZip (MIT ou GPL-3.0) e node-forge (BSD-3-Clause ou GPL-2.0). Os arquivos originais ficam em `src/pdf/`. As fontes Space Grotesk e Roboto Slab (SIL Open Font License) ficam em `assets/fonts/`.
