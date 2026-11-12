# Church Slide

Crie letras de louvor animadas para o telão da igreja e baixe **um vídeo por trecho** (animação + letra parada com o fundo em movimento), prontos para usar no Holyrics ou em qualquer programa de projeção.

Funciona direto no navegador. **Não precisa instalar nada, nem `npm install`, nem `npm run dev`.**

## Abrir pelo link do GitHub (sem instalar nada)

O site já vem pronto na pasta `docs/` deste repositório. Falta só pedir ao GitHub para publicá-lo, uma única vez:

1. No repositório, abra **Settings** (Configurações) → **Pages**.
2. Em **Build and deployment**, deixe **Source = Deploy from a branch**.
3. Em **Branch**, escolha **main** e a pasta **/docs**. Clique em **Save**.
4. Espere cerca de 1 a 2 minutos e atualize a página. O link aparece no topo:

   `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`

Esse é o link que você abre no computador, no Chrome ou no Edge. Pode salvar nos favoritos.

> Confira que a pasta `docs/` está no GitHub com os arquivos `index.html`, `sw.js`, `assets/` e `.nojekyll`. Se ela não aparecer, o envio dos arquivos foi incompleto.

### Usar sem internet

Depois da primeira abertura o site fica guardado no navegador e abre mesmo sem internet. Para ter um ícone próprio, use o botão **Instalar** na barra de endereço do Chrome/Edge (ou menu ⋮ → *Salvar e compartilhar* → *Instalar página como app*).

Os louvores ficam salvos **no próprio navegador** deste computador. Para levar para outro computador, use a exportação de projeto na biblioteca.

### Navegador

Use **Chrome ou Edge** atualizados: foi neles que tudo foi testado. A geração dos vídeos usa o codificador H.264 do próprio navegador (WebCodecs), e o suporte em outros navegadores varia.

## Dicas rápidas

- **Troca de cor em algumas palavras:** clique nas palavras no slide (Shift ou Ctrl para somar mais de uma) e abra
  *Animação → Troca de cor*. Monte a sequência de cores no "+", escolha em quantos segundos ela começa e pronto.
  Também dá para clicar com o botão direito numa palavra e escolher *Troca de cor…*.
- **Fundos próprios:** na biblioteca, clique em *Fundos*, escolha um modelo (Sol poente, Portais, Neblina…) e ajuste
  formas, luzes, ondas, texturas e o movimento em loop. Tudo salva sozinho em *Meus fundos*. Use *Usar num louvor* (cada
  louvor guarda a própria cópia) ou *Exportar vídeo* para levar só o fundo, em MP4 que repete sem emenda, para o Holyrics.
- **Alinhar e mover vários:** arrastando, o texto gruda nas bordas, na margem segura e no centro (botão *Ímã* liga e
  desliga; Alt solta na hora). Ctrl + clique seleciona vários textos (ou camadas no Estúdio) para mover e ajustar juntos.
- **Idioma:** Português, English ou Español. No primeiro acesso o site pergunta o idioma e o tema; depois, use o botão
  de idioma na biblioteca ou *Configurações* no editor.
- **Camadas:** embaixo do palco, ao lado do texto do trecho. Clique para escolher, duplo clique para renomear, arraste
  para mudar a ordem; o olho oculta e o "…" tem duplicar, frente/trás e excluir.
- **Zoom no palco:** Ctrl + roda do mouse (ou as lupas na barra embaixo do palco). Com zoom, segure Espaço e arraste para
  andar pela tela sem mexer no texto. Clique na porcentagem para voltar a caber na tela.
- **Editar no palco:** dois cliques no texto abrem a edição ali mesmo. O botão *Texto* (barra de cima) cria um texto livre.
- **Gerar vídeos sem esperar:** depois de *Gerar*, clique em *Continuar em segundo plano*; um aviso no canto mostra o
  progresso em qualquer tela e baixa o .zip no fim.
- **Inverter cores:** *Texto → Inverter cores* faz a letra mostrar o negativo do fundo, legível mesmo em fundos que mudam.
- **Tema claro ou escuro:** botão de sol/lua no alto da tela. A escolha fica salva.
- **Letra pequena demais?** *Texto → Legibilidade no telão → Letra mínima*: os ajustes automáticos nunca deixam a
  letra menor que isso; a linha quebra em vez de encolher.

## Atualizar o site depois de mudar o código

Só quem altera o programa precisa disso:

```bash
npm install        # uma vez
npm run build      # gera de novo a pasta docs/
```

Envie a pasta `docs/` atualizada para o GitHub. O Pages publica sozinho em poucos minutos.

## Comandos de desenvolvimento

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor local com recarga automática |
| `npm run build` | Gera o site pronto em `docs/` |
| `npm run preview` | Abre o site de `docs/` localmente (`BASE_PATH=/nome/` simula o endereço do GitHub Pages) |
| `npm run typecheck` | Confere os tipos do TypeScript |
| `npm test` | Testes unitários |
| `npm run e2e` | Teste completo no navegador (rode `npm run build` antes) |

A arquitetura está descrita em [`ARCHITECTURE.md`](ARCHITECTURE.md).
