import { useUserMode } from '../../context/UserModeContext';
import { BankPicker } from './BankPicker';
import { UserTransactionsPage } from './UserTransactionsPage';

/**
 * The user-mode entry point. Two states:
 *   1. No banks selected → renders `<BankPicker>`.
 *   2. One or more banks selected → renders `<UserTransactionsPage>` scoped to
 *      those banks (a `BankSwiftCode IN …` filter).
 *
 * State transitions happen via `setSelectedBanks(...)` on UserModeContext.
 * No tabs, no routing — the portal is a single switch.
 */
export function UserPortal() {
  const { selectedBanks } = useUserMode();

  return (
    <div className="min-h-screen bg-surface-secondary">
      {selectedBanks.length > 0 ? <UserTransactionsPage /> : <BankPicker />}
    </div>
  );
}
