import { useUserMode } from '../../context/UserModeContext';
import { CompanyPicker } from './CompanyPicker';
import { UserTransactionsPage } from './UserTransactionsPage';

/**
 * The user-mode entry point. Two states:
 *   1. No company selected → renders `<CompanyPicker>`.
 *   2. A company is selected → renders `<UserTransactionsPage>` scoped to that
 *      company's IBANs.
 *
 * State transitions happen via `setSelectedCompany(c | null)` on UserModeContext.
 * No tabs, no routing — the portal is a single switch.
 */
export function UserPortal() {
  const { selectedCompany } = useUserMode();

  return (
    <div className="min-h-screen bg-surface-secondary">
      {selectedCompany ? <UserTransactionsPage /> : <CompanyPicker />}
    </div>
  );
}
