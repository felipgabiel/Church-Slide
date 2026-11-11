import { DialogHost } from '../ui/toast';
import { useThemeMode } from './theme';
import { ErrorBoundary } from './ErrorBoundary';
import { useRoute } from './router';
import { Library } from '../features/library/Library';
import { Editor } from '../features/editor/Editor';
import { Operator } from '../features/present/Operator';
import { Output } from '../features/present/Output';

export function App() {
  const route = useRoute();
  useThemeMode(); // acompanha a troca de tema feita em outra janela
  const key = route.name === 'library' || route.name === 'output' ? route.name : `${route.name}:${route.id}`;
  return (
    <div className="app">
      <ErrorBoundary key={key}>
        {route.name === 'library' && <Library />}
        {route.name === 'edit' && <Editor id={route.id} />}
        {route.name === 'present' && <Operator id={route.id} />}
        {route.name === 'output' && <Output />}
      </ErrorBoundary>
      <DialogHost />
    </div>
  );
}
