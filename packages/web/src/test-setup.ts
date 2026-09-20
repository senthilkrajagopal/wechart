import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs with `globals: false`, so Testing Library's automatic cleanup
// (which hooks a global afterEach) never registers. Without this, each test
// renders into a document the previous test left behind and queries match the
// wrong tree.
afterEach(cleanup);
