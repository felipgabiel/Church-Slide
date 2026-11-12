import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './app/App';
import { LANG } from './core/i18n';
import { applyTheme, savedTheme } from './app/theme';
import { registerServiceWorker } from './app/pwa';
import { requestPersistence } from './core/storage/db';
import { loadCustomFonts } from './core/storage/media';

// tema antes do primeiro desenho (sem piscar o tema errado)
applyTheme(savedTheme());
document.documentElement.lang = LANG;

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');
createRoot(root).render(<App />);

registerServiceWorker();
// Pede ao navegador para não apagar projetos e mídia quando o disco estiver cheio.
void requestPersistence();
// Fontes enviadas pelo usuário precisam estar registradas antes de qualquer slide ser desenhado.
void loadCustomFonts().catch(() => undefined);
