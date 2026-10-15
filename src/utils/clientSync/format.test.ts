import { describe, it, expect } from 'vitest';
import { DASH, formatLocalTime, formatAgo, formatDurationMs, formatAmount, groupIban, accountChipName, prettyJson } from './format';

describe('formatLocalTime', () => {
  it('renders HH:mm:ss, with a yyyy-MM-dd prefix when asked', () => {
    expect(formatLocalTime('2026-10-15T06:55:02Z', false, 'UTC')).toBe('06:55:02');
    expect(formatLocalTime('2026-10-15T06:55:02Z', true, 'UTC')).toBe('2026-10-15 06:55:02');
    expect(formatLocalTime('2026-10-15T23:30:00Z', true, 'Asia/Riyadh')).toBe('2026-10-16 02:30:00');
  });

  it('renders nothing for null, blank or malformed input, never "Invalid Date"', () => {
    expect(formatLocalTime(null)).toBe('');
    expect(formatLocalTime('')).toBe('');
    expect(formatLocalTime('yesterday', true, 'UTC')).toBe('');
  });
});

describe('formatAgo', () => {
  const at = Date.parse('2026-10-15T08:00:00Z');
  it('rounds down to seconds under a minute, then minutes, never negative', () => {
    expect(formatAgo('2026-10-15T07:59:41.900Z', at)).toBe('18 s ago');
    expect(formatAgo('2026-10-15T07:57:10Z', at)).toBe('2 min ago');
    expect(formatAgo('2026-10-15T08:00:05Z', at)).toBe('0 s ago');
    expect(formatAgo(null, at)).toBe('');
    expect(formatAgo('bad', at)).toBe('');
  });
});

describe('formatDurationMs', () => {
  it('shows ms under a second, one decimal seconds above, a dash for null', () => {
    expect(formatDurationMs(412)).toBe('412 ms');
    expect(formatDurationMs(999.6)).toBe('1000 ms');
    expect(formatDurationMs(1800)).toBe('1.8 s');
    expect(formatDurationMs(33000)).toBe('33.0 s');
    expect(formatDurationMs(null)).toBe(DASH);
  });
});

describe('amounts and IBANs', () => {
  it('prefixes the side and groups with two decimals', () => {
    expect(formatAmount(12500, 'CR')).toBe('CR 12,500.00');
    expect(formatAmount(230, 'DR')).toBe('DR 230.00');
    expect(formatAmount(5.5, '')).toBe('5.50');
  });

  it('groups IBANs in fours and composes the chip name without empty parts', () => {
    expect(groupIban('SA0380000000608010167519')).toBe('SA03 8000 0000 6080 1016 7519');
    expect(groupIban('SA03 80')).toBe('SA03 80');
    expect(accountChipName('SA0380000000608010167519', 'RJHISARI', 'Main SAR')).toBe('SA03 8000 0000 6080 1016 7519 · RJHISARI · Main SAR');
    expect(accountChipName('SA0380000000608010167519', '', '')).toBe('SA03 8000 0000 6080 1016 7519');
  });
});

describe('prettyJson', () => {
  it('indents JSON and leaves anything else untouched', () => {
    expect(prettyJson('{"a":1,"b":[2]}')).toBe('{\n  "a": 1,\n  "b": [\n    2\n  ]\n}');
    expect(prettyJson(':20:FT26288H51MC')).toBe(':20:FT26288H51MC');
    expect(prettyJson('')).toBe('');
  });
});
