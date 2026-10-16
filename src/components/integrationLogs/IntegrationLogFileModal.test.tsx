import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { IntegrationLog } from '../../api/transactions';

vi.mock('../../api/transactions', async () => {
  const actual = await vi.importActual<typeof import('../../api/transactions')>(
    '../../api/transactions',
  );
  return {
    ...actual,
    getIntegrationLogFile: vi.fn(),
  };
});

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
    userId: 'user-1',
    refreshIfNeeded: vi.fn().mockResolvedValue(undefined),
    isAudit: false,
  }),
}));

vi.mock('../../context/TepConfigContext', () => ({
  useTepConfig: () => ({
    ttpTenantCode: 'TENANT',
    languageCode: 'en',
    timeZone: 'UTC',
    ttpRequestId: 'req-1',
  }),
}));

import { getIntegrationLogFile } from '../../api/transactions';
import { IntegrationLogFileModal } from './IntegrationLogFileModal';

const mockedGetFile = vi.mocked(getIntegrationLogFile);

const log: IntegrationLog = {
  Id: 'log-9',
  Endpoint: 'ProcessTransactionsForTagging',
  StatementId: 'STMT-XYZ',
  RequestFilePath: '/req/9',
  ResponseFilePath: '/res/9',
  CallStartDate: '2026-05-06T10:00:00',
  CallEndDate: '2026-05-06T10:00:01',
  StatusType: 'SUCCESS',
  StatusCode: '200',
  StatusDescription: 'OK',
};

describe('IntegrationLogFileModal', () => {
  beforeEach(() => {
    mockedGetFile.mockReset();
  });

  it('fetches both REQUEST and RESPONSE in parallel', async () => {
    mockedGetFile.mockResolvedValue({ Content: '{"hello":"world"}' });
    render(<IntegrationLogFileModal log={log} onClose={() => {}} />);
    await waitFor(() => expect(mockedGetFile).toHaveBeenCalledTimes(2));
    const fileTypes = mockedGetFile.mock.calls.map((c) => c[0].FileType).sort();
    expect(fileTypes).toEqual(['REQUEST', 'RESPONSE']);
    expect(mockedGetFile.mock.calls.every((c) => c[0].Id === 'log-9')).toBe(true);
  });

  it('pretty-prints JSON content', async () => {
    mockedGetFile.mockResolvedValue({ Content: '{"a":1,"b":2}' });
    render(<IntegrationLogFileModal log={log} onClose={() => {}} />);
    // Pretty-printed → each field lands on its own indented line. The viewer
    // renders one <div> per line (windowed), so assert both lines are present
    // rather than looking for a single node containing a newline.
    expect(await screen.findByText(/"a": 1/)).not.toBeNull();
    expect(screen.getByText(/"b": 2/)).not.toBeNull();
  });

  it('falls back to raw text when content is not valid JSON', async () => {
    mockedGetFile.mockResolvedValue({ Content: 'not-json &?{' });
    render(<IntegrationLogFileModal log={log} onClose={() => {}} />);
    expect(await screen.findByText('not-json &?{')).not.toBeNull();
  });

  it('switches between Request and Response panes', async () => {
    mockedGetFile.mockImplementation(async ({ FileType }) => ({
      Content: FileType === 'REQUEST' ? '{"side":"req"}' : '{"side":"res"}',
    }));
    render(<IntegrationLogFileModal log={log} onClose={() => {}} />);
    await screen.findByText(/"side": "req"/);
    fireEvent.click(screen.getByRole('button', { name: 'Response' }));
    expect(await screen.findByText(/"side": "res"/)).not.toBeNull();
  });

  it('opens on the response pane when asked', async () => {
    mockedGetFile.mockImplementation(async ({ FileType }) => ({
      Content: FileType === 'REQUEST' ? '{"side":"req"}' : '{"side":"res"}',
    }));
    render(<IntegrationLogFileModal log={log} initialPane="response" onClose={() => {}} />);
    expect(await screen.findByText(/"side": "res"/)).not.toBeNull();
    expect(screen.queryByText(/"side": "req"/)).toBeNull();
  });

  it('shows feed, account, business day and operation, and the raw feed spelling when it differs', async () => {
    mockedGetFile.mockImplementation(async ({ FileType }) => ({
      Content: FileType === 'REQUEST' ? '{"DataSetType": "INTERIM_TransactionList", "StatementId": "129915638"}' : '{}',
    }));
    render(
      <IntegrationLogFileModal
        log={{ ...log, StatementId: '129915638', Operation: 'Ingest', DataSetType: 'INTERIM_TransactionsList', BankSwiftCode: 'ARNBSARI', IBANs: ['SA3130400108095455560019'], BusinessDate: '2026-10-16' }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('129915638')).not.toBeNull();
    expect(screen.getByText('Ingest')).not.toBeNull();
    expect(screen.getByText('INTERIM_TransactionsList')).not.toBeNull();
    expect(screen.getByText('SA3130400108095455560019 · ARNBSARI')).not.toBeNull();
    expect(screen.getByText('2026-10-16')).not.toBeNull();
    expect(await screen.findByText('(sent as INTERIM_TransactionList)')).not.toBeNull();
  });

  it('shows dashes for meta the log does not carry and no spelling hint when the feed matches', async () => {
    mockedGetFile.mockResolvedValue({ Content: '{"DataSetType": "MT940"}' });
    render(<IntegrationLogFileModal log={{ ...log, StatementId: '', DataSetType: 'MT940' }} onClose={() => {}} />);
    await screen.findByText(/"DataSetType": "MT940"/);
    expect(screen.getAllByText('—')).toHaveLength(4); // Statement ID, Operation, Account, Business day
    expect(screen.queryByText(/sent as/)).toBeNull();
  });

  it('renders an error when file fetch fails', async () => {
    mockedGetFile.mockRejectedValue(new Error('boom'));
    render(<IntegrationLogFileModal log={log} onClose={() => {}} />);
    expect(await screen.findByText('boom')).not.toBeNull();
  });
});
