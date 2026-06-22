import type { TransactionRow, TagSpecLibrary } from '../types';

// Dynamic, memoized loaders for the demo / dummy-data fixtures.
//
// These keep the large sample JSON OUT of the production entry bundle. A
// static `import x from './sampleData.json'` inlines the file into the
// importing module's chunk (~11 MB across the three fixtures, the bulk of the
// shipped bundle), even though the data is only ever read in dummy-data mode.
// A dynamic `import()` instead emits a separate async chunk that the browser
// downloads only when dummy mode is actually active.
//
// Each promise is cached so repeated callers (e.g. `resetToSample`, a remount)
// reuse the single already-fetched chunk rather than re-importing.

let transactionsPromise: Promise<TransactionRow[]> | null = null;
export function loadSampleTransactions(): Promise<TransactionRow[]> {
  if (!transactionsPromise) {
    transactionsPromise = import('./sampleData.json').then(
      (m) => (m.default as unknown as { Transactions: TransactionRow[] }).Transactions,
    );
  }
  return transactionsPromise;
}

let tagDataPromise: Promise<TagSpecLibrary[]> | null = null;
export function loadSampleTagData(): Promise<TagSpecLibrary[]> {
  if (!tagDataPromise) {
    tagDataPromise = import('./sample.json').then(
      (m) => m.default as unknown as TagSpecLibrary[],
    );
  }
  return tagDataPromise;
}

let hierarchyPromise: Promise<Record<string, unknown>> | null = null;
export function loadSampleHierarchy(): Promise<Record<string, unknown>> {
  if (!hierarchyPromise) {
    hierarchyPromise = import('./sampleHiearchy.json').then(
      (m) => m.default as unknown as Record<string, unknown>,
    );
  }
  return hierarchyPromise;
}
