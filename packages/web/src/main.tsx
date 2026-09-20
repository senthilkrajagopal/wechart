import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { ThemeProvider } from './shell/ThemeProvider';
import { installStyles } from './shell/styles';

const container = document.querySelector('#root');
if (!container) throw new Error('#root is missing from index.html');

installStyles();

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
