import type { ClientSyncTraceOut } from '../../api/clientSync';
import { downloadCsv } from '../exportCsv';

/**
 * "What BwaTech holds now" for one transaction, one row per attribute
 * (UI_ClientSync_HoldsNowExport). Rows follow the grouped view: the three
 * Transaction rows, then TEP, the displayed customer and each match (its
 * parties, then its fields). Sent order is the attribute's 1-based position
 * in Out.CurrentAttributes, so sorting by it gives back the list as sent.
 * Without a grouped view (older backend) the sent list is written as is with
 * the section columns blank; an entry the grouped view does not place is
 * written the same way after the matches, so nothing is ever left out.
 */

export const HOLDS_NOW_CSV_HEADERS = ['Section', 'Match', 'Suffix', 'Party', 'Label', 'Key', 'Value', 'Sent order'];

type Cell = string | number | null;

const TRANSACTION_ROW_COUNT = 3;

interface RowPlace { section: string; match: number | null; suffix: string | null; party: string | null }
interface Attribute { Key: string; Value: string | null; Label?: string | null }

export function buildHoldsNowCsvRows(transactionId: string, out: ClientSyncTraceOut): Cell[][] {
  const rows: Cell[][] = [
    ['Transaction', null, null, null, 'Transaction id', 'TransactionId', transactionId, null],
    ['Transaction', null, null, null, 'Tag', 'tag', out.CurrentTag ?? '', null],
    ['Transaction', null, null, null, 'Deleted at BwaTech', 'DeletedAtBwatech', out.DeletedAtBwatech ? 'Yes' : 'No', null],
  ];
  // First position of each key in the sent list; a position is spent once a grouped row claims it.
  const sentIndex = new Map<string, number>();
  out.CurrentAttributes.forEach((a, i) => { if (!sentIndex.has(a.Key)) sentIndex.set(a.Key, i); });
  const placed = new Set<number>();
  const push = (place: RowPlace, item: Attribute) => {
    const index = sentIndex.get(item.Key);
    if (index !== undefined) placed.add(index);
    rows.push([place.section, place.match, place.suffix, place.party, item.Label ?? '', item.Key, item.Value ?? '', index === undefined ? null : index + 1]);
  };
  const view = out.CurrentView;
  if (view) {
    for (const a of view.Tep) push({ section: 'TEP', match: null, suffix: null, party: null }, a);
    for (const a of view.Displayed?.Attributes ?? []) push({ section: 'Displayed', match: null, suffix: null, party: null }, a);
    for (const m of view.Matches) {
      for (const p of m.Parties) for (const a of p.Attributes) push({ section: 'Match', match: m.Number, suffix: m.Suffix, party: p.Title }, a);
      for (const f of m.Fields) push({ section: 'Match', match: m.Number, suffix: m.Suffix, party: null }, f);
    }
  }
  out.CurrentAttributes.forEach((a, i) => {
    if (!placed.has(i)) rows.push(['', null, null, null, '', a.Key, a.Value ?? '', i + 1]);
  });
  return rows;
}

/** False when there is no tag and no attribute held, which disables the export button. */
export function holdsNowHasContent(out: ClientSyncTraceOut): boolean {
  return out.CurrentTag !== null || buildHoldsNowCsvRows('', out).length > TRANSACTION_ROW_COUNT;
}

export function holdsNowCsvFileName(transactionId: string): string {
  const safe = transactionId.replace(/[^A-Za-z0-9_-]+/g, '_') || 'transaction';
  return `bwatech-holds-${safe}.csv`;
}

/** Downloads with a UTF-8 BOM (downloadCsv) so Excel opens the Arabic names correctly. */
export function downloadHoldsNowCsv(transactionId: string, out: ClientSyncTraceOut): void {
  downloadCsv(holdsNowCsvFileName(transactionId), HOLDS_NOW_CSV_HEADERS, buildHoldsNowCsvRows(transactionId, out));
}
