import { setBoundarySetLoader } from '@wechart/charts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { boundarySetGeoJson } from './query/boundarySets';
import { AuthGate } from './shell/AuthGate';
import { ThemeProvider } from './shell/ThemeProvider';
import { installStyles } from './shell/styles';

/**
 * Defaults chosen for a BI grid rather than a feed: without these, every
 * alt-tab refires every tile against a Cube queue whose default concurrency is
 * 2 (docs/research/data-layer.md). Retries stay off so a Cube error reaches the
 * tile that must show it (AC-012).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 5 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const container = document.querySelector('#root');
if (!container) throw new Error('#root is missing from index.html');

installStyles();
// A Map's custom boundary sets, fetched by the page for the renderer (T979).
setBoundarySetLoader(boundarySetGeoJson);

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {/* Nothing of wechart until the API says who is signed in (T321, AC-251). */}
        <AuthGate>
          <App />
        </AuthGate>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
