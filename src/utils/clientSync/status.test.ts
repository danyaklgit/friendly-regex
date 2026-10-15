import { describe, it, expect } from 'vitest';
import {
  kbStatusDisplay, certaintyTone, outStatusDisplay, accountStateDisplay, warningTone, feedChipLabel, taggedPercent,
  inHealth, taggingHealth, kbHealth, outHealth, SHOW_LABELS, LAYER_LABELS, showCount, tagCertainty,
} from './status';
import { makeSummaryFixture } from './fixtures';

describe('status vocabularies (spec 7.7)', () => {
  it('maps KB status, with NotEligible a dash in the list and a gray outline in the drawer', () => {
    expect(kbStatusDisplay('Promoted', 'list')).toEqual({ label: 'Promoted', tone: 'success' });
    expect(kbStatusDisplay('NotKnown', 'list')).toEqual({ label: 'Not known', tone: 'gray' });
    expect(kbStatusDisplay('Pending', 'drawer')).toEqual({ label: 'Pending', tone: 'warning' });
    expect(kbStatusDisplay('NotEligible', 'list')).toEqual({ label: '', tone: 'dash' });
    expect(kbStatusDisplay('NotEligible', 'drawer')).toEqual({ label: 'Not eligible', tone: 'grayOutline' });
  });

  it('colors certainty by rank only, so both vocabularies agree on the same rank', () => {
    expect(certaintyTone(5)).toBe('successStrong');
    expect(certaintyTone(4)).toBe('success');
    expect(certaintyTone(3)).toBe('info');
    expect(certaintyTone(2)).toBe('warning');
    expect(certaintyTone(1)).toBe('danger');
    expect(certaintyTone(0)).toBe('gray');
    expect(certaintyTone(9)).toBe('gray');
  });

  it('maps outbound status', () => {
    expect(outStatusDisplay('SENT')).toEqual({ label: 'Sent', tone: 'success' });
    expect(outStatusDisplay('UPDATED')).toEqual({ label: 'Sent + patched', tone: 'success' });
    expect(outStatusDisplay('FAILED')).toEqual({ label: 'Failed', tone: 'danger' });
    expect(outStatusDisplay('NOT_SENT')).toEqual({ label: 'Not sent', tone: 'danger' });
    expect(outStatusDisplay('NOT_SENT_BY_DESIGN')).toEqual({ label: 'Not sent (late arrival)', tone: 'gray' });
    expect(outStatusDisplay('DELETED')).toEqual({ label: 'Deleted at BwaTech', tone: 'gray' });
    expect(outStatusDisplay('UNTRACKED')).toEqual({ label: 'No record', tone: 'grayOutline' });
    expect(outStatusDisplay('NEVER')).toEqual({ label: '', tone: 'dash' });
  });

  it('maps account state, warning level and feed chip label', () => {
    expect(accountStateDisplay('OK')).toEqual({ label: 'OK', tone: 'success' });
    expect(accountStateDisplay('ATTENTION')).toEqual({ label: 'Attention', tone: 'warning' });
    expect(accountStateDisplay('IDLE')).toEqual({ label: 'No delivery', tone: 'gray' });
    expect(warningTone('WARNING')).toBe('warning');
    expect(warningTone('INFO')).toBe('info');
    expect(feedChipLabel('INTERIM_TransactionsList')).toBe('INTERIM TL');
    expect(feedChipLabel('MT940')).toBe('MT940');
  });

  it('maps a tag certainty level string to the TagBadge vocabulary, defaulting to HIGH', () => {
    expect(tagCertainty('medium')).toBe('MEDIUM');
    expect(tagCertainty('LOW')).toBe('LOW');
    expect(tagCertainty(null)).toBe('HIGH');
    expect(tagCertainty('weird')).toBe('HIGH');
  });

  it('labels every Show value and reads its server count', () => {
    expect(Object.keys(SHOW_LABELS)).toEqual(['ALL', 'UNTAGGED', 'LAYERS_DIFFER', 'KB_PROMOTED', 'KB_NOT_KNOWN', 'KB_PENDING', 'OUT_FAILED', 'NOT_SENT']);
    expect(SHOW_LABELS.LAYERS_DIFFER).toBe('Layers differ');
    expect(LAYER_LABELS).toEqual({ ALL: 'All', INTRADAY: 'Intraday', CONFIRMED: 'Confirmed' });
    expect(showCount([{ Key: 'UNTAGGED', Count: 15 }], 'UNTAGGED')).toBe(15);
    expect(showCount([{ Key: 'UNTAGGED', Count: 15 }], 'NOT_SENT')).toBeNull();
  });
});

describe('card health (spec 7.3)', () => {
  const s = makeSummaryFixture();

  it('In: danger on rejections, else success', () => {
    expect(inHealth(s.In)).toEqual({ tone: 'success', label: 'OK' });
    expect(inHealth({ ...s.In, Rejected: 1 })).toEqual({ tone: 'danger', label: 'Rejections' });
  });

  it('Tagged: warning on untagged rows, else success; percent rounds and survives zero', () => {
    expect(taggingHealth(s.Tagging)).toEqual({ tone: 'warning', label: 'Untagged rows' });
    expect(taggingHealth({ ...s.Tagging, Untagged: 0 })).toEqual({ tone: 'success', label: 'All tagged' });
    expect(taggedPercent(197, 212)).toBe(93);
    expect(taggedPercent(0, 0)).toBe(0);
  });

  it('Knowledge base: warning on failed calls or pending, else success', () => {
    expect(kbHealth(s.KnowledgeBase)).toEqual({ tone: 'warning', label: 'Attention' });
    expect(kbHealth({ ...s.KnowledgeBase, Pending: 0 })).toEqual({ tone: 'success', label: 'OK' });
    expect(kbHealth({ ...s.KnowledgeBase, Pending: 0, FailedCalls: 2 })).toEqual({ tone: 'warning', label: 'Attention' });
  });

  it('Out: danger when the last call failed rows or rows are not sent, else success', () => {
    expect(outHealth(s.Out)).toEqual({ tone: 'danger', label: 'Failures' });
    expect(outHealth({ ...s.Out, RowsLastCallFailed: 0, RowsNotSent: 0 })).toEqual({ tone: 'success', label: 'OK' });
    expect(outHealth({ ...s.Out, RowsLastCallFailed: 0, RowsNotSent: 1 })).toEqual({ tone: 'danger', label: 'Failures' });
  });
});
