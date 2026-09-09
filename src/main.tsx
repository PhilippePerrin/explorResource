import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './index.css';
import './design-tokens.css';
import { bootstrapTheme } from './theme/applyTheme';
import { installTestHooksIfEnabled } from './testHooks';

bootstrapTheme();
installTestHooksIfEnabled();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root was not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
