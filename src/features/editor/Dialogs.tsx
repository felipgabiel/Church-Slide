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

/* --------------------------- Informações --------------------------- */

export function InfoDialog({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: string[] }) {
  return (
    <Modal open={open} onClose={onClose} title="Informações do louvor" width={460}>
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
          Nome
        </label>
        <input id="ed-name" className="input" autoFocus value={name} onChange={(e) => setName(e.currentTarget.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ed-artist">
          Artista ou ministério
        </label>
        <input id="ed-artist" className="input" value={artist} onChange={(e) => setArtist(e.currentTarget.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ed-cat">
          Categoria
        </label>
        <input id="ed-cat" className="input" list="ed-cats" value={category} onChange={(e) => setCategory(e.currentTarget.value)} />
        <datalist id="ed-cats">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="modal-actions">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" type="submit">
          Salvar
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
  if (!info) return <p className="field-hint">Informação de armazenamento indisponível neste navegador.</p>;
  return (
    <>
      <Row label="Espaço usado" hint="Projetos, imagens, vídeos e fontes">
        <span className="set-val">
          {formatBytes(info.usage)}
          {info.quota ? ` de ${formatBytes(info.quota)}` : ''}
        </span>
      </Row>
      <Row label="Proteção contra limpeza" hint="O navegador não apaga os dados sozinho quando faltar espaço">
        {info.persisted ? (
          <span className="chip" data-tone="ok">
            Ativa
          </span>
        ) : (
          <Button
            size="sm"
            onClick={async () => {
              const ok = await requestPersistence();
              toast(ok ? 'Armazenamento protegido' : 'O navegador não concedeu a proteção agora. Tente novamente mais tarde.', ok ? 'ok' : 'info');
              void load();
            }}
          >
            Ativar
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
    <Modal open={open} onClose={onClose} title="Configurações" width={500} footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="set">
        <h3>Editor</h3>
        <Row label="Mostrar guias na pré-visualização" hint="Centro e área segura de 5%">
          <Switch checked={guides} onChange={setGuides} label="Mostrar guias" />
        </Row>
        <h3>Telão</h3>
        <Row label="Quando a tela não for 16:9" hint="Preencher corta nada: o texto se adapta à tela">
          <Segmented<FitMode>
            size="sm"
            label="Ajuste da imagem no telão"
            value={fit}
            onChange={setFit}
            options={[
              { value: 'fill', label: 'Preencher' },
              { value: 'letterbox', label: 'Barras pretas' },
            ]}
          />
        </Row>
        <h3>Armazenamento</h3>
        <StorageInfo />
      </div>
    </Modal>
  );
}

/* ------------------------------- Atalhos ------------------------------- */

const EDITOR_KEYS: { keys: string; label: string }[] = [
  { keys: 'Ctrl+Z', label: 'Desfazer' },
  { keys: 'Ctrl+Shift+Z  ou  Ctrl+Y', label: 'Refazer' },
  { keys: 'Ctrl+S', label: 'Salvar agora (o salvamento automático já acontece)' },
  { keys: 'Ctrl+D', label: 'Duplicar o trecho' },
  { keys: '↑ / ↓', label: 'Trecho anterior / seguinte' },
  { keys: 'Alt+↑ / Alt+↓', label: 'Mover o trecho' },
  { keys: 'Delete', label: 'Excluir o trecho' },
  { keys: 'R', label: 'Repetir a animação' },
  { keys: 'Ctrl+Enter', label: 'Abrir o modo de apresentação' },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Atalhos de teclado" width={560} footer={<Button onClick={onClose}>Fechar</Button>}>
      <h3 className="sc-title">No editor</h3>
      <dl className="sc">
        {EDITOR_KEYS.map((s) => (
          <div key={s.keys}>
            <dt>{s.keys}</dt>
            <dd>{s.label}</dd>
          </div>
        ))}
      </dl>
      <h3 className="sc-title">Na apresentação</h3>
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
