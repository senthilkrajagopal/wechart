import { createContext } from 'react';

/**
 * The data sources Cube has, by name (T481, design 03 state B): a cube's
 * `data_source` is picked from them, as direction.md §7b has references
 * picked, never typed. Undefined where they are not known — the list could
 * not be read, or the form stands alone — and the field is then typed.
 */
export const DataSourcesContext = createContext<readonly string[] | undefined>(undefined);
