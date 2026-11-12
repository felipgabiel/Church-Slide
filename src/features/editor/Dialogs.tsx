import { useEffect, useState } from 'react';
import { useSetting } from '../../core/settings';
import { requestPersistence } from '../../core/storage/db';
import { shortcutHelp } from '../../core/present/shortcuts';
import { formatBytes } from '../../core/util';
import { editor, editorStore } from '../../store/editor';
import { Button } from '../../ui/Button';
import { Row, Segmented, Switch } from '../../ui/Controls';
import { Modal } from '../../ui/Modal';
import { toast } from '../../ui/toast';
import type { FitMode } from '../../core/present/channel';
import { LANG, LANGS, setLang, tr, type Lang } from '../../core/i18n';

/* --------------------------- Informações --------------------------- */

export function InfoDialog({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: string[] }) {
  return (
    <Modal open={open} onClose={onClose} title={tr('Informações do louvor')} width={460}>
      {open && <InfoForm onClose={onClose} categories={categories} />}
    </Modal>
  );
}

function InfoForm({ onClose, categories }: { onClose: () => void; categories: string[] }) {
  const p = editorStore.get().project!;
  const [name, setName] = useState(p.name);
  const [artist, setArtist] = useState(p.artist);
  const [category, setCategory] = useState(p.category);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        editor.setProjectMeta({ name: name.trim() || p.name, artist: artist.trim(), category: category.trim() });
        onClose();
      }}
    >
      <div className="field">
        <label className="field-label" htmlFor="ed-name">
          {tr('Nome')}
        </label>
        <input id="ed-name" className="input" autoFocus value={name} onChange={(e) => setName(e.currentTarget.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ed-artist">
          {tr('Artista ou ministério')}
        </label>
        <input id="ed-artist" className="input" value={artist} onChange={(e) => setArtist(e.currentTarget.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ed-cat">
          {tr('Categoria')}
        </label>
        <input id="ed-cat" className="input" list="ed-cats" value={category} onChange={(e) => setCategory(e.currentTarget.value)} />
        <datalist id="ed-cats">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="modal-actions">
        <Button onClick={onClose}>{tr('Cancelar')}</Button>
        <Button variant="primary" type="submit">
          {tr('Salvar')}
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------- Configurações ---------------------------- */

function StorageInfo() {
  const [info, setInfo] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const load = async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      setInfo({ usage: est?.usage ?? 0, quota: est?.quota ?? 0, persisted });
    } catch {
      setInfo(null);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  if (!info) return <p className="field-hint">{tr('Informação de armazenamento indisponível neste navegador.')}</p>;
  return (
    <>
      <Row label={tr('Espaço usado')} hint={tr('Projetos, imagens, vídeos e fontes')}>
        <span className="set-val">
          {formatBytes(info.usage)}
          {info.quota ? tr(' de {0}', formatBytes(info.quota)) : ''}
        </span>
      </Row>
      <Row label={tr('Proteção contra limpeza')} hint={tr('O navegador não apaga os dados sozinho quando faltar espaço')}>
        {info.persisted ? (
          <span className="chip" data-tone="ok">
            {tr('Ativa')}
          </span>
        ) : (
          <Button
            size="sm"
            onClick={async () => {
              const ok = await requestPersistence();
              toast(ok ? tr('Armazenamento protegido') : tr('O navegador não concedeu a proteção agora. Tente novamente mais tarde.'), ok ? 'ok' : 'info');
              void load();
            }}
          >
            {tr('Ativar')}
          </Button>
        )}
      </Row>
    </>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [guides, setGuides] = useSetting<boolean>('guides', false);
  const [fit, setFit] = useSetting<FitMode>('fit', 'fill');
  return (
    <Modal open={open} onClose={onClose} title={tr('Configurações')} width={500} footer={<Button onClick={onClose}>{tr('Fechar')}</Button>}>
      <div className="set">
        <h3>{tr('Idioma')}</h3>
        <Row label={tr('Idioma do site')} hint={tr('A página recarrega para trocar')}>
          <Segmented<Lang> size="sm" label={tr('Idioma do site')} value={LANG} onChange={(v) => v !== LANG && setLang(v)} options={LANGS.map((l) => ({ value: l.id, label: l.label }))} />
        </Row>
        <h3>{tr('Editor')}</h3>
        <Row label={tr('Mostrar guias na pré-visualização')} hint={tr('Centro e área segura de 5%')}>
          <Switch checked={guides} onChange={setGuides} label={tr('Mostrar guias')} />
        </Row>
        <h3>{tr('Telão')}</h3>
        <Row label={tr('Quando a tela não for 16:9')} hint={tr('Preencher corta nada: o texto se adapta à tela')}>
          <Segmented<FitMode>
            size="sm"
            label={tr('Ajuste da imagem no telão')}
            value={fit}
            onChange={setFit}
            options={[
              { value: 'fill', label: tr('Preencher') },
              { value: 'letterbox', label: tr('Barras pretas') },
            ]}
          />
        </Row>
        <h3>{tr('Armazenamento')}</h3>
        <StorageInfo />
      </div>
    </Modal>
  );
}

/* ------------------------------- Atalhos ------------------------------- */

const EDITOR_KEYS: { keys: string; label: string }[] = [
  { keys: 'Ctrl+Z', label: tr('Desfazer') },
  { keys: 'Ctrl+Shift+Z  ou  Ctrl+Y', label: tr('Refazer') },
  { keys: 'Ctrl+S', label: tr('Salvar agora (o salvamento automático já acontece)') },
  { keys: 'Ctrl+D', label: tr('Duplicar o trecho') },
  { keys: '↑ / ↓', label: tr('Trecho anterior / seguinte') },
  { keys: 'Alt+↑ / Alt+↓', label: tr('Mover o trecho') },
  { keys: 'Delete', label: tr('Excluir o trecho') },
  { keys: 'R', label: tr('Repetir a animação') },
  { keys: 'Ctrl+Enter', label: tr('Abrir o modo de apresentação') },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={tr('Atalhos de teclado')} width={560} footer={<Button onClick={onClose}>{tr('Fechar')}</Button>}>
      <h3 className="sc-title">{tr('No editor')}</h3>
      <dl className="sc">
        {EDITOR_KEYS.map((s) => (
          <div key={s.keys}>
            <dt>{s.keys}</dt>
            <dd>{s.label}</dd>
          </div>
        ))}
      </dl>
      <h3 className="sc-title">{tr('Na apresentação')}</h3>
      <dl className="sc">
        {shortcutHelp().map((s) => (
          <div key={s.keys}>
            <dt>{s.keys}</dt>
            <dd>{s.label}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
