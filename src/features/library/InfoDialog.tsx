import { useState } from 'react';
import { updateMeta } from '../../core/storage/projects';
import type { Project } from '../../core/types';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { toastError } from '../../ui/toast';
import { tr } from '../../core/i18n';

/** Renomear e reclassificar um louvor (nome, artista e categoria). */
export function InfoDialog({ project, categories, onClose, onSaved }: { project: Project | null; categories: string[]; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal open={!!project} onClose={onClose} title={tr('Informações do louvor')} width={460}>
      {project && <InfoForm key={project.id} project={project} categories={categories} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function InfoForm({ project, categories, onClose, onSaved }: { project: Project; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(project.name);
  const [artist, setArtist] = useState(project.artist);
  const [category, setCategory] = useState(project.category);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await updateMeta(project.id, { name: name.trim() || project.name, artist: artist.trim(), category: category.trim() });
          onSaved();
          onClose();
        } catch {
          toastError(tr('Não foi possível salvar as alterações.'));
        }
      }}
    >
      <div className="field">
        <label className="field-label" htmlFor="inf-name">
          {tr('Nome')}
        </label>
        <input id="inf-name" className="input" autoFocus value={name} onChange={(e) => setName(e.currentTarget.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="inf-artist">
          {tr('Artista ou ministério')}
        </label>
        <input id="inf-artist" className="input" value={artist} onChange={(e) => setArtist(e.currentTarget.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="inf-cat">
          {tr('Categoria')}
        </label>
        <input id="inf-cat" className="input" list="inf-cats" value={category} onChange={(e) => setCategory(e.currentTarget.value)} />
        <datalist id="inf-cats">
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
