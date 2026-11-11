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
