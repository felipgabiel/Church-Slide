import { useEffect } from 'react';
import { navigate, paths } from '../../app/router';
import { editor, editorStore, flushSave } from '../../store/editor';
import { toast } from '../../ui/toast';

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export async function startPresenting() {
  const p = editorStore.get().project;
  if (!p) return;
  await flushSave();
  navigate(paths.present(p.id));
}

/** Atalhos do editor. Em campos de texto, o desfazer nativo do navegador continua valendo. */
export function useEditorShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // nenhum diálogo aberto (o <dialog> modal cobre tudo)
      if (document.querySelector('dialog[open]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const typing = isTyping(e.target);
      const key = e.key.toLowerCase();

      if (mod && key === 's') {
        e.preventDefault();
        void flushSave().then(() => toast('Projeto salvo'));
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        void startPresenting();
        return;
      }
      if (mod && key === 'd' && !typing) {
        e.preventDefault(); // evita o atalho de favoritos do navegador
        const id = editorStore.get().slideId;
        if (id) editor.duplicateSlide(id);
        return;
      }
      if (mod && key === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (mod && key === 'y' && !typing) {
        e.preventDefault();
        editor.redo();
        return;
      }
      if (typing || mod) return;

      const s = editorStore.get();
      const slides = s.project?.slides ?? [];
      const idx = slides.findIndex((x) => x.id === s.slideId);
      if (idx < 0) return;

      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        editor.moveSlide(idx, idx + (e.key === 'ArrowUp' ? -1 : 1));
        return;
      }
      if (e.altKey) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          if (idx > 0) {
            e.preventDefault();
            editor.selectSlide(slides[idx - 1].id);
          }
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          if (idx < slides.length - 1) {
            e.preventDefault();
            editor.selectSlide(slides[idx + 1].id);
          }
          break;
        case 'Delete':
          e.preventDefault();
          editor.deleteSlide(slides[idx].id);
          break;
        case 'r':
        case 'R':
          editor.replay();
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
