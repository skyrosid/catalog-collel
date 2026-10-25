import { Component, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { texts } from '../../shared/texts';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) {
      return (
        <p role="alert" className="p-8">
          {texts.fatal}
        </p>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
document.title = texts.title;
if (!root) throw new Error('Missing root element.');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
