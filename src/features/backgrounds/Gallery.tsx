import { useMemo, useState } from 'react';
import { LuCopy, LuEllipsis, LuFilm, LuPalette, LuPencil, LuPlus, LuSparkles, LuTrash2 } from 'react-icons/lu';
import { navigate, paths } from '../../app/router';
import { copyDesign } from '../../core/design/model';
import { STARTERS, type Starter } from '../../core/design/starters';
import { deleteDesign, saveDesign } from '../../core/storage/designs';
import type { BackgroundDesign } from '../../core/types';
import { timeAgo } from '../../core/util';
import { Button } from '../../ui/Button';
import { Menu, type MenuItem } from '../../ui/Menu';
import { confirmDialog, promptDialog, toast, toastError } from '../../ui/toast';
import { ApplyDialog } from './ApplyDialog';
import { DesignThumb } from './DesignThumb';
import { ExportLoopDialog } from './ExportLoopDialog';
import { useDesigns } from './useDesigns';

/** Cria um fundo a partir de um modelo de partida, salva e abre o estúdio. */
export async function startFromStarter(s: Starter) {
  try {
    const d = await saveDesign(s.make());
    navigate(paths.studio(d.id));
  } catch {
    toastError('Não foi possível criar o fundo neste navegador.');
  }
}

/** Seção "Fundos" da biblioteca: modelos de partida e "Meus fundos". */
export function Gallery({ query }: { query: string }) {
  const { items, loading, error, reload } = useDesigns();
  const [exporting, setExporting] = useState<BackgroundDesign | null>(null);
  const [applying, setApplying] = useState<BackgroundDesign | null>(null);
  const starters = useMemo(() => STARTERS.map((s) => ({ s, preview: s.make() })), []);
  const q = query.trim().toLowerCase();
  const mine = q ? items.filter((d) => d.name.toLowerCase().includes(q)) : items;

  const actions = (d: BackgroundDesign): MenuItem[] => [
    { label: 'Abrir no estúdio', icon: <LuPalette />, onClick: () => navigate(paths.studio(d.id)) },
    { label: 'Usar num louvor…', icon: <LuSparkles />, onClick: () => setApplying(d) },
    {
      label: 'Duplicar',
      icon: <LuCopy />,
      onClick: async () => {
        const c = await saveDesign(copyDesign(d, { name: `${d.name} (cópia)` }));
        toast(`“${c.name}” criado`);
      },
    },
    {
      label: 'Renomear…',
      icon: <LuPencil />,
      onClick: async () => {
        const name = await promptDialog({ title: 'Renomear fundo', label: 'Nome', value: d.name, confirmLabel: 'Renomear' });
        if (name?.trim()) await saveDesign({ ...d, name: name.trim() });
      },
    },
    { label: 'Exportar vídeo (só o fundo)', icon: <LuFilm />, hint: '.mp4', onClick: () => setExporting(d) },
    { divider: true },
    {
      label: 'Excluir',
      icon: <LuTrash2 />,
      danger: true,
      onClick: async () => {
        const ok = await confirmDialog({
          title: `Excluir “${d.name}”?`,
          message: 'Louvores que já usam este fundo continuam com ele, porque cada um guarda a própria cópia.',
          confirmLabel: 'Excluir',
          danger: true,
        });
        if (!ok) return;
        await deleteDesign(d.id);
        toast('Fundo excluído', 'info');
      },
    },
  ];

  return (
    <div className="gal">
      <section className="lib-hello" aria-label="Fundos">
        <h1>Fundos</h1>
        <p>Crie fundos com formas, luz e movimento em loop. Eles ficam prontos para usar em qualquer louvor.</p>
      </section>

      {!q && (
        <section className="gal-band" aria-labelledby="gal-start-h">
          <h2 id="gal-start-h">Comece por um modelo</h2>
          <div className="gal-starters">
            {starters.map(({ s, preview }) => (
              <button key={s.id} type="button" className="gal-starter" onClick={() => void startFromStarter(s)} title={s.hint}>
                <DesignThumb design={preview} />
                <span className="gal-name">{s.name}</span>
                <span className="gal-sub">{s.hint}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="gal-band" aria-labelledby="gal-mine-h">
        <div className="lib-head">
          <h2 id="gal-mine-h">{q ? 'Resultados' : 'Meus fundos'}</h2>
          <span className="lib-count">{mine.length}</span>
        </div>
        {error && (
          <div className="empty">
            <h3>Não foi possível carregar os fundos</h3>
            <p>{error}</p>
            <Button onClick={() => void reload()}>Tentar novamente</Button>
          </div>
        )}
        {!error && !loading && mine.length === 0 && (
          <div className="lib-empty">
            <LuPalette aria-hidden />
            {q ? (
              <>
                <h3>Nada encontrado</h3>
                <p>Nenhum fundo com “{query}”.</p>
              </>
            ) : (
              <>
                <h3>Seus fundos aparecem aqui</h3>
                <p>Escolha um modelo acima ou comece do zero. Tudo é salvo sozinho neste computador.</p>
                <Button variant="primary" icon={<LuPlus />} onClick={() => void startFromStarter(STARTERS[STARTERS.length - 1])}>
                  Novo fundo
                </Button>
              </>
            )}
          </div>
        )}
        {mine.length > 0 && (
          <div className="lib-grid">
            {mine.map((d) => (
              <article key={d.id} className="pcard dcard">
                <button type="button" className="pcard-thumb" onClick={() => navigate(paths.studio(d.id))} aria-label={`Abrir ${d.name} no estúdio`}>
                  <DesignThumb design={d} />
                </button>
                <div className="pcard-meta">
                  <div className="pcard-titles">
                    <h3 title={d.name}>{d.name}</h3>
                    <p>
                      Loop de {d.loopSec} s · {timeAgo(d.updatedAt)}
                    </p>
                  </div>
                  <Menu
                    align="end"
                    items={actions(d)}
                    trigger={(isOpen, toggle) => (
                      <button type="button" className="ibtn ibtn-sm" data-active={isOpen ? '1' : undefined} aria-label={`Mais ações para ${d.name}`} aria-haspopup="menu" aria-expanded={isOpen} onClick={toggle}>
                        <LuEllipsis />
                      </button>
                    )}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <ExportLoopDialog design={exporting} onClose={() => setExporting(null)} />
      <ApplyDialog design={applying} onClose={() => setApplying(null)} />
    </div>
  );
}
