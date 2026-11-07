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

- IndexedDB `church-slide` v1, stores `projects`, `media`, `snapshots`.
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

## 7. Qualidade e testes

| Comando | O que faz |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (ver limitação na seção 1) |
| `npm test` | 26 testes unitários: easing, motor de animação (Motion Blur proporcional à velocidade), divisão de letras, atalhos |
| `npm run build && npm run e2e` | 15 etapas no navegador contra o build de produção (ver abaixo) |

O e2e (`e2e/run.mjs`) cria um louvor pela interface, edita e confere a persistência após recarregar,
testa desfazer, abre operador e telão em duas páginas, confere a sincronia, mede o Motion Blur
durante a transição e a remoção do filtro em repouso, tela preta, atalhos personalizados (inclusive
apertados na janela do telão), recarga **sem rede** via service worker e ausência de erros de console.

O build **falha** se `sw.js` sair com marcadores sem substituir — um bug anterior fazia o service
worker não registrar e o modo offline nunca funcionava, sem nenhum aviso.

## 8. O que ainda não existe

- **Controle remoto pelo celular.** Exige descoberta entre dispositivos (um servidor leve de sinalização
  ou pareamento WebRTC manual por QR code). Fica para uma próxima etapa; a camada `LiveBus` já isola o
  transporte, então um canal de rede entra no lugar do `BroadcastChannel` sem tocar nas telas.
- **Exportar como vídeo** e **biblioteca de fundos em vídeo embutida** (o app traz fundos animados e
  gradientes gerados por código, que não pesam; vídeos e imagens são enviados pelo usuário).
- **Contas, nuvem e sincronização entre computadores** — fora do escopo desta etapa por decisão do briefing.
- Verificação em hardware real com **dois monitores físicos**: o fluxo é testado com duas janelas, mas a
  Window Management API só pode ser exercitada de verdade em máquina com mais de um monitor.
