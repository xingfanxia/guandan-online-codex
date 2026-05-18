import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initGuandanBotId } from './lib/security/botIdClient';
import './styles/tokens.css';
import './styles/components.css';
import './styles/app.css';

initGuandanBotId();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
