import { AppShell } from './shell/AppShell';

/**
 * Routing arrives at T006; until then the shell opens on Explore, which is
 * where dashboards and charts live (docs/inputs §8).
 */
export function App() {
  return <AppShell workspace="explore" />;
}
