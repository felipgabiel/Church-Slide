import { useState } from 'react';
import { shortcutHelp } from '../../core/present/shortcuts';
import { editor, editorStore } from '../../store/editor';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { tr } from '../../core/i18n';

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
