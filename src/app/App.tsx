import { DialogHost } from '../ui/toast';
import { useThemeMode } from './theme';
import { ErrorBoundary } from './ErrorBoundary';
import { useRoute } from './router';
import { Library } from '../features/library/Library';
import { Editor } from '../features/editor/Editor';
import { Operator } from '../features/present/Operator';
import { Output } from '../features/present/Output';
import { Studio } from '../features/backgrounds/Studio';
import { ExportPill } from '../features/export/ExportPill';
import { Welcome } from '../features/onboarding/Welcome';

export function App() {
  const route = useRoute();
  useThemeMode(); // acompanha a troca de tema feita em outra janela
  // biblioteca e galeria de fundos são a mesma tela (só muda a seção): não remonta ao trocar
  const key = route.name === 'library' || route.name === 'backgrounds' ? 'library' : route.name === 'output' ? route.name : `${route.name}:${route.id}`;
  return (
    <div className="app">
      <ErrorBoundary key={key}>
        {(route.name === 'library' || route.name === 'backgrounds') && <Library section={route.name === 'backgrounds' ? 'backgrounds' : 'songs'} />}
        {route.name === 'studio' && <Studio id={route.id} from={route.from} />}
        {route.name === 'edit' && <Editor id={route.id} />}
        {route.name === 'present' && <Operator id={route.id} />}
        {route.name === 'output' && <Output />}
      </ErrorBoundary>
      {route.name !== 'output' && <ExportPill />}
      {route.name !== 'output' && <Welcome />}
      <DialogHost />
    </div>
  );
}
