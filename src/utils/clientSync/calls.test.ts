import { describe, it, expect } from 'vitest';
import { sortCallsOldestFirst, callBadgeText, callTone, outOperationLabel, callToIntegrationLog, firstAcceptedDelivery } from './calls';
import { makeCallFixture } from './fixtures';

describe('call helpers', () => {
  it('sorts oldest first without mutating the input', () => {
    const late = makeCallFixture({ LogId: 'b', CallStartUtc: '2026-10-15T07:00:00Z' });
    const early = makeCallFixture({ LogId: 'a', CallStartUtc: '2026-10-15T06:00:00Z' });
    const input = [late, early];
    expect(sortCallsOldestFirst(input).map((c) => c.LogId)).toEqual(['a', 'b']);
    expect(input[0].LogId).toBe('b');
  });

  it('badge text prefers StatusCode, then StatusType, then the outcome; tone follows Succeeded', () => {
    expect(callBadgeText(makeCallFixture({ StatusCode: '0' }))).toBe('0');
    expect(callBadgeText(makeCallFixture({ StatusCode: null, StatusType: 'Error' }))).toBe('Error');
    expect(callBadgeText(makeCallFixture({ StatusCode: null, StatusType: null, Succeeded: false }))).toBe('Failed');
    expect(callBadgeText(makeCallFixture({ StatusCode: null, StatusType: null, Succeeded: true }))).toBe('OK');
    expect(callTone(makeCallFixture({ Succeeded: true }))).toBe('success');
    expect(callTone(makeCallFixture({ Succeeded: false }))).toBe('danger');
  });

  it('labels outbound operations', () => {
    expect(outOperationLabel('PushProcessedStatement', '')).toBe('insert');
    expect(outOperationLabel('PatchTransactions', 'Update')).toBe('update');
    expect(outOperationLabel('PatchTransactions', 'DELETE')).toBe('delete');
    expect(outOperationLabel('PatchTransactions', '')).toBe('update');
    expect(outOperationLabel('Other', 'sync')).toBe('sync');
  });

  it('builds the IntegrationLog the file viewer needs from a call', () => {
    expect(callToIntegrationLog(makeCallFixture({ LogId: 'log-9', Endpoint: 'PushProcessedStatement', CallStartUtc: '2026-10-15T06:55:35Z', StatusType: 'Information', StatusCode: '0', StatusDescription: 'OK' })))
      .toEqual({ Id: 'log-9', Endpoint: 'PushProcessedStatement', StatementId: '', RequestFilePath: '', ResponseFilePath: '', CallStartDate: '2026-10-15T06:55:35Z', CallEndDate: '', StatusType: 'Information', StatusCode: '0', StatusDescription: 'OK' });
  });

  it('finds the first accepted delivery in time order, or null', () => {
    const rejected = makeCallFixture({ LogId: 'r', CallStartUtc: '2026-10-15T06:00:00Z', Succeeded: false });
    const accepted = makeCallFixture({ LogId: 'ok', CallStartUtc: '2026-10-15T06:30:00Z', Succeeded: true });
    const later = makeCallFixture({ LogId: 'late', CallStartUtc: '2026-10-15T07:00:00Z', Succeeded: true });
    expect(firstAcceptedDelivery([later, accepted, rejected])?.LogId).toBe('ok');
    expect(firstAcceptedDelivery([rejected])).toBeNull();
    expect(firstAcceptedDelivery([])).toBeNull();
  });
});
