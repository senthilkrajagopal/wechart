import { RouterProvider } from '@tanstack/react-router';

import { buildRouter } from './router/routes';

const router = buildRouter();

export function App() {
  return <RouterProvider router={router} />;
}
