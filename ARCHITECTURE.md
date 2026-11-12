# Church Slide — Arquitetura

Plataforma *local-first* para criar e projetar letras de louvores com animações, fundos e Motion Blur.
Roda inteira no navegador: sem servidor, sem conta, sem internet depois da primeira abertura.

> Este documento descreve o que **existe no código**. Onde a implementação difere da stack
> sugerida no briefing (seção 2) ou algo ainda não foi feito, está dito explicitamente.

## 1. Stack e decisões

| Camada | Escolha | Por quê |
|---|---|---|
| UI | React 19 + TypeScript | Tipagem forte para o modelo de dados; ecossistema estável |
| Build | **esbuild** (scripts em `scripts/`) | Um binário, sem plugins; dev server com recarga e build de produção em ~150 ms |
| Estilo | CSS puro com variáveis (`src/styles/tokens.css`) | Tema escuro por tokens; sem dependência de runtime |
| Ícones | react-icons (conjunto Lucide) | Único pacote de UI além do React |
| Estado | `createStore` próprio (~55 linhas, `src/store/`) + histórico próprio de desfazer/refazer | Seletores evitam re-render desnecessário; sem dependência |
| Animação do telão | **Motor próprio** com `requestAnimationFrame` (`src/core/anim/`) | Motion Blur real baseado em velocidade — CSS/Framer não oferecem |
| Animação da interface | Transições CSS | Suficiente para os painéis e diálogos |
| Persistência | IndexedDB com camada própria (`src/core/storage/db.ts`) | Projetos em JSON + mídia como `Blob`; funciona offline |
| Offline | Service worker próprio (`scripts/sw.template.js`) | Pré-cache do app inteiro, gerado no build |
| Testes | `node:test` + `tsx` (unitários) e Playwright (e2e) | Sem framework extra |

### Diferenças em relação à stack preferida do briefing

O briefing sugeriu Vite, Tailwind, Framer Motion, GSAP e PWA via plugin, com liberdade para mudar
"se houver solução tecnicamente melhor". O que **não** foi usado e por quê:

- **Vite → esbuild.** O projeto foi montado num ambiente sem acesso ao registro npm, então só
  `react`, `react-dom`, `esbuild`, `typescript` e `react-icons` estão instalados. O esbuild cobre o
  que o app precisa (bundle, JSX, minificação, hash de arquivos). O código é React/TS padrão: migrar
  para Vite é trocar os scripts de build, não reescrever o app.
- **Tailwind → CSS com tokens.** Mesmo motivo; a identidade visual vive em `tokens.css`.
- **Framer Motion / GSAP → motor próprio.** O Motion Blur direcional precisa conhecer a velocidade
  de cada palavra a cada quadro, o que nenhuma das duas expõe. GSAP não foi necessário.
- **vite-plugin-pwa / Workbox → service worker de ~60 linhas.** Estratégia simples e auditável.

**Limitação de verificação:** como `@types/react` não está instalado, `npm run typecheck` usa tipos
mínimos de `tools/sandbox-types/`. Ele pega erros de lógica e de modelo de dados, mas é menos rigoroso
que a checagem com os tipos oficiais. Rode `npm install` numa máquina com internet para ativá-la
(o script detecta sozinho e passa a usar `tsconfig.json`).

## 2. Camadas

```
┌────────────────────────── features/ (telas) ───────────────────────────┐
│ library/  editor/  present/ (operador + telão)                          │
├──────────────── render/ (somente desenho, sem lógica de negócio) ───────┤
│ Stage · Background · TextLayerView · SlideThumb · FitBox                │
├──────────────────────── store/ (estado) ────────────────────────────────┤
│ editor (projeto aberto + undo/redo + autosave) · createStore            │
├──────────────────────── core/ (lógica pura, sem React) ─────────────────┤
│ types · defaults · themes · split · fonts · settings                    │
│ anim/(presets, easing, engine) · storage/(db, projects, media, exchange)│
│ present/(channel, screens, playlist, shortcuts)                         │
└──────────────────────────────────────────────────────────────────────────┘
```

Regra: `core/` não importa React (exceto `settings.ts`, que expõe um hook); `render/` não importa
`store/`. O mesmo `Stage` desenha o editor, a prévia do operador e a janela do público — o que se vê
no editor é exatamente o que vai ao telão.

## 3. Modelo de dados (`src/core/types.ts`)

- **Project**: nome, artista, categoria, proporção, `slides[]`, `theme` (padrão de texto/fundo/animação),
  `isTemplate`, `deletedAt` (lixeira), `lyrics` + `splitMode` (última divisão usada).
- **Slide**: `layers[]` (várias camadas de texto), `background?` e `animation?` (sobrescrevem o tema),
  `duration?` (avanço automático), `label` (Verso, Refrão…), `notes` (só o operador vê).
- **TextStyle**: fonte, tamanho, cor, negrito/itálico, espaçamento de letras e linhas, alinhamento,
  posição/largura, opacidade, desfoque, sombra, contorno, brilho, ajuste automático de tamanho.
- **Background**: `solid | gradient | image | video | animated` + brilho, contraste, saturação,
  desfoque, escurecimento, escala e posição. Mídia referenciada por `mediaId`, nunca embutida no JSON.
- **AnimationConfig**: efeitos de entrada e saída combináveis (fade, slide, zoom, blur), granularidade
  (`block | line | word`), duração, velocidade, atraso, *stagger*, intensidade, direção, curva,
  `motionBlur` (0–100) e `float`.

## 4. Animação e Motion Blur real (`src/core/anim/engine.ts`)

1. Cada unidade de texto (palavra, linha ou bloco) é animada por `requestAnimationFrame`.
2. A posição/escala/opacidade vão por `transform` + `opacity` (compositor/GPU).
3. A **velocidade** instantânea de cada unidade define um `<feGaussianBlur>` com desvios diferentes
   em X e Y — o borrão segue a direção do movimento e some quando o texto para.
4. Filtros SVG vêm de um *pool* reutilizável; ao fim do movimento o `filter` é removido do elemento
   (custo zero em repouso — coberto pelo e2e).

"Blur In/Out" usam `filter: blur()` isotrópico. A transição entre trechos sobrepõe o que entra ao que
sai (crossfade): nunca há quadro vazio.

## 5. Armazenamento

- IndexedDB `church-slide` v2, stores `projects`, `media`, `snapshots` e `designs` (fundos do Estúdio; a migração da v1 só cria o store novo).
- **Autosave** com debounce de 400 ms; `pagehide` e `visibilitychange` forçam a gravação imediata.
- **Desfazer/refazer**: até 100 estados, com fusão de edições contínuas (arrastar um controle = 1 passo).
- **Recuperação**: a cada gravação boa guarda-se um *snapshot*; o projeto pode ser restaurado dele.
  Excluir manda para a **lixeira** (recuperável); só "excluir definitivamente" apaga.
- **Exportar/importar**: arquivo único com o projeto e a mídia usada (em base64) para levar a outro computador.
- Se o IndexedDB estiver indisponível (alguns modos privados) o app cai para memória e **avisa** que nada será salvo.
- Preferências (atalhos, etc.) em `localStorage` com chave `cs:*`.

## 6. Modo de apresentação com duas telas

Mecanismo, em ordem de preferência:

1. **Window Management API** (`getScreenDetails`, Chrome/Edge/Opera): lista os monitores e abre a
   janela do público já posicionada sobre o monitor externo.
2. **Fallback** (Firefox/Safari ou permissão negada): abre-se a janela do público; o operador a
   arrasta para o projetor e aperta **F** (ou clica nela) para tela cheia.
3. **Sincronização**: `BroadcastChannel` (mesma origem, offline, latência ≈ 0). O estado também é
   gravado em `localStorage`: uma janela do telão aberta *depois* já nasce no trecho certo, e serve de
   plano B se o canal não existir. A janela do público carrega projeto e mídia do próprio IndexedDB —
   só trafegam comandos (`state`, `fullscreen`, `close`). As teclas apertadas na janela do telão
   voltam ao operador.

Limitações assumidas: tela cheia exige um gesto do usuário **naquela** janela (regra dos navegadores);
Firefox/Safari não têm a Window Management API.

Recursos do operador: prévia "ao vivo" e do "próximo", roteiro de vários louvores (a troca de louvor
pré-carrega o seguinte, sem tela preta), tela preta, repetir animação, avanço automático opcional,
anotações privadas por trecho, modo "preencher" ou "barras pretas".

### Atalhos personalizáveis (`src/core/present/shortcuts.ts`)

Teclas padrão preservadas; cada ação aceita várias teclas. Regras pensadas para uso ao vivo:
**Anterior/Próximo nunca ficam sem tecla**; 1–9 (ir ao trecho) são fixas; ao dar a uma ação uma tecla
que outra já usa, a tecla é *movida* e o aviso diz quem a perdeu; Ctrl/Alt/⌘ não são aceitos. A
configuração está em `localStorage`, então operador e telão obedecem às mesmas teclas.

## 7. Exportação de vídeo (um MP4 por trecho)

Pensada para levar as letras animadas a outro programa (ex.: Holyrics). Cada trecho vira um vídeo:
**animação de entrada** + **letra parada** (tempo configurável) com o **fundo animado** continuando.
Tudo no navegador, sem servidor — `src/core/export/`:

1. `scene.tsx` monta o MESMO `TextLayerView` do editor fora da tela, no tamanho exato do vídeo, e mede
   cada palavra (posição, fonte, cor). Quebra de linha, ajuste automático e estilo por palavra saem
   idênticos ao editor. Só dados vão adiante.
2. `compose.ts` desenha o texto em canvas usando o mesmo `unitState`/`planUnits` do telão (a animação do
   vídeo é a do editor, não uma cópia). O Motion Blur é por amostragem ao longo do eixo do movimento.
3. `background.ts` redesenha o fundo (cor, degradê, aurora/bokeh/raios/ondas, imagem, vídeo) em função do tempo.
4. `encode.ts` renderiza **quadro a quadro** (mais rápido que o tempo real) e codifica com WebCodecs
   (`VideoEncoder`, H.264 Baseline → Main → High, o primeiro que o navegador aceitar).
5. `mp4.ts` é um muxer MP4 próprio; `zip.ts` monta o ZIP sem compressão (vídeos já são comprimidos).

Saída: `01 - vem sobre mim SENHOR.mp4`, `02 - …` (a numeração segue a ordem do louvor, para o Holyrics/explorador
ordenarem certo), em 720p/1080p/4K, 30 ou 60 fps. Opções: baixar tudo em `.zip`, baixar separados ou salvar
numa pasta (File System Access API, Chrome/Edge). Trechos sem texto são pulados.

Requisitos: Chrome ou Edge recentes (precisam de `VideoEncoder` com H.264). Firefox/Safari mostram um aviso.
Os vídeos saem em `yuvj420p` (faixa completa), padrão do codificador do Chrome.
Fidelidade canvas × DOM é medida por `npm run e2e:fidelity` (PSNR por caso, exige ffmpeg).

## 8. Edição por palavra e estilo "Impacto"

- **Por palavra** (`core/words.ts`, painel *Palavras*): clique numa palavra no palco (ou no chip) e ajuste fonte,
  tamanho (× da camada), peso (300–900), caixa, itálico, espaçamento entre letras, cor e uma animação própria (efeito, atraso, duração, intensidade).
  Os ajustes ficam em `TextLayer.words[índice]`; quando uma palavra tem animação própria o trecho passa a animar
  uma unidade por palavra, no editor, no telão e no vídeo.
- **Estilo automático "Impacto"** (`core/impact.ts`): a palavra-chave (nomes de Deus e termos como Santo/Aleluia
  têm prioridade; senão, a linha mais curta) ganha a própria linha, grande e em MAIÚSCULAS; o resto fica pequeno
  em minúsculas. Escolha o visual *Impacto* ao criar o louvor para aplicar a todos os trechos de uma vez, ou use os
  botões do painel *Palavras* (neste trecho / em todos). Funções puras, cobertas por `tests/impact.test.ts`.
- **Granularidade (Frase / Linha / Palavra)** é independente do efeito: trocar de preset não a desliga
  (regressão coberta em `tests/anim.test.ts`, que confere que todo efeito altera cada palavra e as palavras
  entram em sequência).

### Menu do botão direito e palavras soltas (`core/layers.ts`, `features/editor/stageMenu.tsx`)

Clique direito numa palavra do palco abre o menu: soltar a palavra (ou a linha inteira) numa camada própria para
arrastar a qualquer lugar, editar, duplicar, excluir, ordem das camadas (frente / subir / descer / trás),
centralizar, duplicar ou ocultar a camada e adicionar texto no ponto clicado. Ao soltar, a nova camada nasce
exatamente onde a palavra estava e com o mesmo tamanho: o tamanho é medido no DOM e as escalas por palavra
passam a ser relativas à maior delas (`detachedLayer`). Tudo vira um único passo de desfazer. As funções puras
(duplicar, remover, reindexar ajustes por palavra) estão cobertas por `tests/layers.test.ts`.

### Alças da caixa de texto (`features/editor/StageArea.tsx`)

Como no Canva: cantos aumentam/diminuem a letra e a largura na mesma proporção; as laterais mudam só a largura
(medida no eixo da própria caixa, então funciona com ela girada); o botão redondo embaixo gira em torno do centro
(ímã em 0°/45°/90°…, Shift anda de 15 em 15°, Alt desliga o ímã, clique duplo volta a 0°). O giro fica em
`TextStyle.rotation`; no palco é um `rotate()` na camada e no vídeo o compositor mede o texto sem giro e gira o
desenho em torno do mesmo centro (caso "caixa girada" no teste de fidelidade).

### Ímã, seleção múltipla e inverter cores

- **Ímã (`core/snap.ts`):** ao arrastar texto (editor) ou camada (Estúdio), a caixa — ou a caixa que envolve o grupo
  selecionado — gruda na borda do slide, na margem segura (5%, a linha tracejada) ou no centro quando chega a 12 px de
  tela; a guia correspondente acende. Continuar arrastando passa do ímã. O botão **Ímã** (preferência `cs:snap-enabled`,
  a mesma no editor e no Estúdio) desliga tudo; Alt desliga só durante o arraste.
- **Seleção múltipla (Ctrl + clique):** no editor, `extraLayerIds` guarda as outras camadas de texto; arrastar move
  todas pelo mesmo deslocamento (`moveLayers`) e `patchStyle` aplica o estilo a todas (posição por deslocamento).
  No Estúdio, `selectedIds` (a principal é a última): ajustes do painel, arrastar, tamanho, giro, setas, Delete e Ctrl+D
  valem para o grupo. Clicar uma palavra prefere a camada de cima quando os textos se sobrepõem.
- **Inverter cores:** `TextStyle.blend = 'difference'` vira `mix-blend-mode: difference` na camada (o palco é
  `isolation: isolate`); no vídeo, a camada é desenhada à parte e composta com `difference`. No Estúdio, o modo de
  mistura "Inverter cores" usa o mesmo operador do canvas. Casos de fidelidade cobrem os dois.

### Texto no palco, exportação em segundo plano e tamanho estável

- **Duplo clique no texto** abre uma caixa de edição por cima da camada (`InlineText` em `StageArea`); o palco acompanha
  cada letra. O botão **Texto** da barra cria um texto livre no terço de baixo e já abre essa caixa (`cs:edit-layer`).
- **Soltar várias palavras:** com palavras marcadas (Shift + clique) numa camada, o menu oferece "Soltar as N palavras
  juntas" (`readWords`/`removeWords` em `core/layers.ts`): viram uma camada só, na ordem do texto, mantendo quebras.
- **Exportação em segundo plano (`features/export/exportJob.ts`):** o trabalho vive fora do diálogo; fechar não cancela,
  dá para trocar de tela e um aviso flutuante (`ExportPill`) mostra o progresso e baixa no fim. Entre quadros o
  codificador cede a vez por `MessageChannel` (timers de abas escondidas são segurados pelo navegador). Vale também
  para o vídeo só do fundo, que agora mostra o convite de apoio no fim.
- **Tamanho estável no play:** o ajuste automático de tamanho mede o texto sem os transforms da animação
  (`.fit-measure`) e mede de novo quando a entrada termina (`cs:refit`), igual ao que o vídeo mede.
- A troca de cor saiu dos estilos prontos de animação: fica só na ferramenta "Troca de cor".

### Painel de camadas, zoom do palco, letra completa e repetidos

- **Camadas embaixo do palco (`features/editor/LayersPanel.tsx`):** a faixa de baixo do editor (`.ed-bottom`) é meio
  texto do trecho, meio lista de camadas, na ordem do palco (topo = na frente). Clique seleciona (Ctrl soma), duplo clique
  renomeia (`editor.renameLayer`), arrastar reordena (`editor.moveLayerTo`), olho oculta, e o menu "…" duplica, sobe/desce,
  traz para frente/envia para trás e exclui. A lista usa `contain: size`: a altura vem do editor de texto e ela rola.
  O painel da direita só mostra o nome da camada em edição.
- **Zoom (`features/editor/ZoomView.tsx`):** o palco fica de fato maior (sem `transform`) dentro de uma área com
  rolagem, então cliques, alças e medidas continuam batendo. Ctrl + roda (com `passive: false`, para o navegador não dar
  zoom na página) mantém sob o mouse o mesmo ponto do slide; as lupas da barra seguem degraus (50%–400%) pelo centro
  (`cs:stage-zoom`); clicar na porcentagem volta a caber na tela. Espaço com o mouse sobre o palco ativa a mãozinha:
  o `pointerdown` é tomado na fase de captura (nada do slide recebe o clique) e o `click` seguinte é descartado.
- **Letra completa com palavras soltas:** a camada criada por "Soltar" guarda `detached` (`DetachOrigin`: camada de
  origem, linha/coluna de cada palavra e linhas que ficaram vazias). `slideFullText` (em `core/layers.ts`) devolve as
  palavras ao lugar ao montar a "Letra completa", então a frase continua inteira no texto.
- **Louvor repetido (`core/duplicates.ts`):** mesmo nome e mesmo artista (sem diferenciar acentos/maiúsculas, fora
  modelos e lixeira) pedem confirmação; seguindo, o novo vira "Nome (1)", "(2)"… Sem nome digitado não há aviso, só o
  número. Renomear depois para um nome existente é permitido.
- **Lixeira com miniaturas:** cada item mostra o primeiro trecho com texto (`SlideThumb` em `LazyMount`).

### Troca de cor (`core/anim/colorfx.ts`, `render/colorRun.ts`, `features/editor/panels/ColorChange.tsx`)

A troca de cor é **sempre por palavra** (`WordOverride.colorFx`): só as palavras marcadas mudam de cor, as outras
nunca são tocadas. (Até a versão anterior ela também podia ficar na animação do trecho, `AnimationConfig.colorFx`,
e então pegava todas as palavras mesmo quando só algumas estavam selecionadas — era a causa do bug. Ao abrir um
projeto antigo, `normalizeProject` passa essa troca para cada palavra que não tinha a sua, então o resultado fica igual.)

- **Seleção:** clique nas palavras do slide (Shift/Ctrl soma). O painel *Animação → Troca de cor* (e o mesmo
  componente em *Palavras*) aplica a configuração a todas as marcadas; o menu do botão direito tem "Troca de cor…".
  Os estilos prontos do grupo *Troca de cor* vão para as palavras marcadas (sem nenhuma marcada, para todas do trecho,
  com um aviso dizendo isso).
- **Sequência de cores:** `colors: string[]` (1 a 8), partindo da cor do texto ou de `from`. Cada passo do caminho
  ocupa a mesma fração do tempo (`colorAlong`), então a ordem é sempre respeitada. Seletor de cor próprio
  (`ui/ColorPicker.tsx`: saturação/brilho, matiz, hexadecimal, cores recentes) — também usado em todos os campos de cor.
- **Começa em:** `start` em ms contados do momento em que o trecho aparece. Se cair antes do fim da entrada, a troca
  espera a entrada terminar (`colorStart`), então Fade In e troca de cor nunca brigam. Projetos antigos usam `delay`
  (depois da entrada), que continua valendo.
- **Grupos:** palavras com exatamente a mesma configuração formam um grupo (`planColors`); "uma por vez" e "letra a
  letra" contam a ordem dentro do grupo.
- **Mesma conta em todo lugar:** palco do editor, operador, telão e vídeo usam as mesmas funções puras. No editor,
  marcar/desmarcar refaz a troca na hora (`colorSignature`), sem precisar repetir a animação.

### Proporção automática

`impactLayout` quebra linhas pequenas longas em partes de comprimento parecido (`balanceWords`, até ~26 letras),
e a "igualar largura" (`core/layout.ts`) faz cada linha terminar no comprimento da palavra grande. Linhas curtas
só crescem até 62% do tamanho da palavra grande, para ela continuar mandando. Não usa IA: as regras são
determinísticas, rápidas e funcionam offline; o e2e mede as larguras reais no navegador.

### Legibilidade (`render/TextLayerView.tsx`, `TextStyle.minFont`)

Prioridade é a leitura no telão. Os ajustes automáticos nunca deixam a letra abaixo de `minFont` (padrão 4,5% da
altura do slide ≈ 49 px em Full HD; ajustável em *Texto → Legibilidade no telão*):

1. Na proporção entre linhas, uma linha que teria de ficar menor que o mínimo fica no mínimo e **quebra** em partes
   equilibradas (`data-wrap`, `text-wrap: balance`).
2. Uma palavra-chave muito curta ("PAI") não obriga as outras linhas a ficarem do tamanho dela: o comprimento-alvo
   tem piso de 36% da caixa (`minTarget`).
3. Se o texto não cabe, primeiro a caixa é alargada até 96% do slide (`--wfit`), depois a letra é reduzida até o
   mínimo; só se ainda sair da tela é que desce abaixo do mínimo (texto cortado é pior).

O tamanho que a pessoa escolhe à mão não é limitado. O vídeo mede o mesmo DOM, então sai igual.

### Estúdio de Fundos (`core/design/*`, `features/backgrounds/*`, `render/DesignCanvas.tsx`)

- **Onde fica:** item "Fundos" na barra lateral da biblioteca (`#/fundos`: modelos de partida + "Meus fundos") e o
  estúdio em tela própria (`#/fundos/<id>`, ou `#/fundos/<id>/de/<louvor>` quando aberto pelo editor, com caminho de volta).
- **Modelo:** `BackgroundDesign` = nome, duração do loop, cor de base e uma pilha de `DesignLayer` (degradê, forma,
  luz, ondas, textura, partículas). Formato plano, validado por `sanitizeDesign` ao ler do banco ou de um louvor.
- **Desenho:** `DesignPainter` (canvas 2D) desenha cada camada numa tela auxiliar e compõe com opacidade, modo de
  mistura e desfoque (desfoques grandes em meia resolução). "Recortar pela camada de baixo" usa a camada anterior como
  máscara. É o MESMO código no palco, no telão e no vídeo (`BackgroundPainter` delega para ele), e o teste de fidelidade
  compara os dois.
- **Loop sem emenda:** todo movimento (`core/design/motion.ts`) é função periódica da fase do loop com voltas inteiras;
  partículas sobem uma tela por loop; o vídeo "só o fundo" tem exatamente `loop × fps` quadros.
- **Cópia, não vínculo (decisão do produto):** aplicar um fundo grava uma cópia dentro do louvor (`Background.kind = 'design'`
  + `design`). Mudar "Meus fundos" não altera louvores prontos; o painel Fundo avisa que há versão mais nova e oferece
  "Atualizar". "Aplicar neste louvor" (vindo do editor) troca só as cópias daquele fundo, mantendo os ajustes do louvor.
- **Modelos de louvor** levam o fundo junto (é só mais um fundo dentro do projeto); "Usar num louvor" lista modelos também.

### Apoio opcional via Pix (`core/support.ts`, `features/support/SupportCard.tsx`)

O site é gratuito. Depois de gerar os vídeos, o diálogo de exportação mostra um convite discreto com o QR Code e o
"Pix copia e cola" do autor; também há o botão "Apoiar o projeto" (coração) na biblioteca. Nunca bloqueia o
download e nunca vai para dentro do vídeo. "Agora não" esconde o convite por 3 dias. O código Pix é o gerado pelo
banco (chave aleatória, sem valor fixo; CRC conferido em teste) e o QR foi desenhado uma vez como caminho SVG,
então funciona sem internet e sem biblioteca. Para trocar o Pix: substituir `PIX_CODE` e gerar o `PIX_QR` de novo.

### Idiomas e boas-vindas (`core/i18n.ts`, `i18n/en.ts`, `i18n/es.ts`, `features/onboarding/Welcome.tsx`)

- **Texto-fonte em português:** toda frase da interface passa por `tr('…')`; o português é a chave e o dicionário do
  idioma escolhido (inglês ou espanhol) devolve a tradução. Partes variáveis usam `{0}`, `{1}`
  (`tr('Trecho {0} de {1}', i, n)`), e o teste `tests/i18n.test.ts` confere que toda tradução tem os mesmos marcadores
  e que toda frase em português do código tem versão em inglês.
- **Escolha:** `cs:lang` no navegador. Sem escolha, segue o idioma do navegador (pt/en/es), senão português. Trocar
  recarrega a página, porque rótulos de módulo (temas, estilos de animação, atalhos) são lidos uma vez. O `<html lang>`, o
  corretor da caixa de letra e as datas acompanham o idioma. Grupos usados como dados (ex.: "Básicas", "Serifa") ficam em
  português no código e são traduzidos só na hora de mostrar.
- **Primeiro acesso:** a tela de boas-vindas pede idioma (os textos dela trocam na hora) e tema, com duas prévias
  desenhadas em CSS (barra lateral, slide e lista em cada tema); clicar numa prévia já aplica o tema. Depois, o idioma
  muda pelo botão de idioma da biblioteca ou em *Configurações* no editor.
- O que a pessoa digita (letras, nomes de louvores, camadas já criadas) nunca é traduzido.

## 9. Fontes embutidas

Poppins 400/500/700 (SIL OFL 1.1, recortada para caracteres latinos, ~11 KB cada) está em `src/assets/fonts/`
e é declarada em `src/styles/fonts.css`. Entra no pré-cache do modo offline. Motivo: o vídeo grava a fonte que o
navegador usou, então depender de fonte instalada faria o resultado variar de computador para computador.
**Limite conhecido:** só há os pesos 400/500/700. O peso 900 do estilo Impacto cai no 700; para um visual mais
pesado (ex.: Montserrat ExtraBold/Black) envie o `.ttf` em *Texto → Família → Enviar fonte*.

## 10. Publicação (GitHub Pages, sem instalar nada)

**Atualizações:** o service worker busca o `index.html` na rede primeiro (até 4 s) e só usa o guardado sem
internet, e é registrado com `updateViaCache: 'none'`. Assim uma versão publicada aparece no próximo acesso.
(Antes o `index.html` vinha sempre do cache: o navegador podia ficar preso numa versão antiga.) Se mesmo assim o
aplicativo não abrir, o `index.html` mostra "O Church Slide não abriu" com um botão que apaga a cópia guardada
do site e recarrega — os louvores (IndexedDB) não são tocados.


`npm run build` gera o site pronto em `docs/` (com `.nojekyll`), que é a pasta que o GitHub Pages publica em
*Settings → Pages → Deploy from a branch → main → /docs*. Todos os caminhos são relativos e as rotas usam `#`,
então o site funciona em `https://usuario.github.io/repositorio/`; o service worker registra com escopo da
subpasta. Passo a passo para o usuário no `README.md`.

### Biblioteca (tela inicial, `features/library/Library.tsx`, `styles/library.css`)

Como um player de música de mesa: barra lateral discreta (Louvores, Modelos, categorias, lixeira e o estado do
armazenamento com um ponto verde quando funciona offline); à direita, saudação pelo horário, "Continue de onde
parou" com os 4 louvores editados por último (botão redondo "Apresentar" ao passar o mouse) e a lista completa em
**tabela** (miniatura, título, artista, categoria, trechos, quando foi editado; ações ao passar o mouse; clique
duplo abre) ou em **grade** — a escolha fica lembrada. A busca fica numa barra fixa translúcida (atalho `/` ou
Ctrl+K). A luz suave do topo usa as cores do louvor recente mais colorido (clareadas para aparecer), com um grão
leve por cima; no tema claro ela é mais fraca.

### Interface e temas (`src/styles/tokens.css`, `app/theme.ts`)

Dois temas completos (claro e escuro) com os mesmos nomes de token, escolhidos por `data-theme` no `<html>`.
O botão de sol/lua fica na biblioteca, no editor e no operador; a escolha é salva no navegador (`cs:theme`), vale
para todas as janelas abertas (evento `storage`) e, sem escolha, segue o sistema. A troca tem uma transição curta
só nas cores da interface (nunca dentro do slide). O slide fica sempre sobre uma área escura (`--stage-pad`) e o
telão é sempre escuro. Títulos usam a Poppins embutida (a mesma dos slides); controles usam a fonte do sistema.
Painéis laterais acompanham a largura do monitor (`clamp`), testados de 1280×720 a 1920×1080.

## 11. Qualidade e testes

| Comando | O que faz |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (ver limitação na seção 1) |
| `npm test` | 118 testes unitários: idiomas (marcadores e cobertura do dicionário), easing, motor de animação, divisão de letras, atalhos, estilo Impacto, palavras, camadas, troca de cor (sequência, início, grupos, migração), proporção, fundos do Estúdio (loop sem emenda, validação, modelos, cópia) |
| `npm run build && npm run e2e` | 42 etapas no navegador contra o build de produção (ver abaixo) |
| `npm run e2e:fidelity` | compara o desenho em canvas (vídeo) com o DOM do editor (PSNR; exige ffmpeg) |

O e2e (`e2e/run.mjs`) cria um louvor pela interface, edita e confere a persistência após recarregar,
testa desfazer, abre operador e telão em duas páginas, confere a sincronia, mede o Motion Blur
durante a transição e a remoção do filtro em repouso, tela preta, atalhos personalizados (inclusive
apertados na janela do telão), recarga **sem rede** via service worker, o fluxo *Impacto → exportar ZIP* (valida com
ffprobe: H.264, 1920×1080, duração com a letra parada, decodifica sem erro), o menu do botão direito
(soltar e arrastar a palavra, duplicar, excluir, camadas), miniaturas dos visuais sem quebra, espaço entre linhas
que realmente aproxima, troca de cor (confere os pixels do vídeo com ffmpeg), proporção automática e o site
servido numa subpasta como no GitHub Pages, inclusive offline, troca de cor só nas palavras marcadas (quadro a quadro:
ordem da sequência, início no tempo escolhido, telão e vídeo iguais), legibilidade de frases curtas a longas em
1600×900 e 1280×720 e os dois temas (botão, preferência salva, varredura de cores que sobraram do outro tema em
biblioteca, editor, menus, diálogos e operador) e o Estúdio de Fundos (criar a partir de modelo, mover no palco, desfazer,
salvar sozinho, camadas e movimentos, vídeo só do fundo com 360 quadros e emenda invisível, cópia no louvor, "Atualizar" e a
ida e volta editor ↔ estúdio), o painel de camadas (adicionar, renomear, ocultar, reordenar, excluir), a palavra solta
que continua na "Letra completa", o zoom (Ctrl + roda no ponto do mouse, lupas, Espaço + arrastar sem mover o texto), o aviso
de louvor repetido, as miniaturas da lixeira e o primeiro acesso (boas-vindas, prévias de tema, site em inglês e espanhol
e a volta ao português). Termina conferindo que não houve erros de console.

O build **falha** se `sw.js` sair com marcadores sem substituir — um bug anterior fazia o service
worker não registrar e o modo offline nunca funcionava, sem nenhum aviso.

## 12. O que ainda não existe

- **Controle remoto pelo celular.** Exige descoberta entre dispositivos (um servidor leve de sinalização
  ou pareamento WebRTC manual por QR code). Fica para uma próxima etapa; a camada `LiveBus` já isola o
  transporte, então um canal de rede entra no lugar do `BroadcastChannel` sem tocar nas telas.
- **Biblioteca de fundos em vídeo embutida** (o app traz fundos animados e gradientes gerados por código, que não pesam; vídeos e imagens são enviados pelo usuário).
- **Estúdio de Fundos:** imagem/vídeo como camada, importar/exportar um fundo em arquivo `.json` e degradê em malha ficam para uma próxima etapa.
- **Contas, nuvem e sincronização entre computadores** — fora do escopo desta etapa por decisão do briefing.
- Verificação em hardware real com **dois monitores físicos**: o fluxo é testado com duas janelas, mas a
  Window Management API só pode ser exercitada de verdade em máquina com mais de um monitor.
