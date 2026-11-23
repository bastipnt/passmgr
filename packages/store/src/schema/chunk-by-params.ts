import { getColumns, type Table } from "drizzle-orm";

/**
 * Bound parameters one statement may hold. SQLite's default limit is 32766 (999 before
 * 3.32); staying well below it keeps each statement's SQL text small.
 */
export const MAX_BOUND_PARAMS = 6000;

/**
 * `items` split so that no statement binds more than `MAX_BOUND_PARAMS`, when each item binds
 * `paramsPerItem` (a row's columns, `columnCount`, or the values one id adds to an `IN` list)
 * and the statement binds `fixedParams` of its own (a literal in its `WHERE`).
 */
export function chunkByParams<T>(
  items: readonly T[],
  paramsPerItem: number,
  fixedParams = 0,
): T[][] {
  if (!Number.isInteger(paramsPerItem) || paramsPerItem < 1) {
    throw new RangeError(`paramsPerItem must be a positive integer, got ${paramsPerItem}`);
  }
  if (!Number.isInteger(fixedParams) || fixedParams < 0) {
    throw new RangeError(`fixedParams must be a non-negative integer, got ${fixedParams}`);
  }
  const size = Math.floor((MAX_BOUND_PARAMS - fixedParams) / paramsPerItem);
  if (size < 1) {
    throw new RangeError(`${paramsPerItem} + ${fixedParams} params exceed MAX_BOUND_PARAMS`);
  }
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The most parameters one inserted row of `table` binds: one per column. */
export function columnCount(table: Table): number {
  return Object.keys(getColumns(table)).length;
}
