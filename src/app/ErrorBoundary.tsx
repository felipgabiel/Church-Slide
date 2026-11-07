import { Component, type ReactNode } from 'react';
import { Button } from '../ui/Button';

interface State {
  error: Error | null;
}

/** Evita tela branca: se uma tela quebrar, mostra o erro e um caminho de volta (os projetos continuam salvos). */
export class ErrorBoundary extends Component<{ children?: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ui] erro de renderização', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="fatal" role="alert">
        <div className="fatal-box">
          <h1>Algo deu errado nesta tela</h1>
          <p>Seus projetos continuam salvos neste computador. Volte à biblioteca ou recarregue a página para tentar de novo.</p>
          <pre>{error.message}</pre>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="primary"
              onClick={() => {
                location.hash = '#/';
                location.reload();
              }}
            >
              Voltar à biblioteca
            </Button>
            <Button onClick={() => location.reload()}>Recarregar</Button>
          </div>
        </div>
      </div>
    );
  }
}
