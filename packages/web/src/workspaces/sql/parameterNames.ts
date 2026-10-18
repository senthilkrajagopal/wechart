/**
 * The parameters in a tab's SQL (T809, AC-453): `@wechart/core`'s, which
 * wechart's API also uses to refuse a run on a source that can't bind them
 * (T810, AC-482). The browser passes the tab's source's dialect
 * (`dialectFor`, MySQL with backslash escapes).
 */
export { parameterNames, type ParamType } from '@wechart/core/sql-parameters';
