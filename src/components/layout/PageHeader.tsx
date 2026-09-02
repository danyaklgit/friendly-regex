import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useTimeRemaining } from '../../hooks/useTimeRemaining';
import { Tooltip } from '../shared/Tooltip';
import { Button } from '../shared/Button';
import { Badge } from '../shared/Badge';
import { NotificationsButton } from '../notifications/NotificationsButton';
import { DownloadCenterButton } from '../downloadCenter/DownloadCenterButton';
import { CentralExportButton } from '../downloadCenter/CentralExportButton';
import type { TagSpecCommentTarget } from '../../types/comments';
import { DATA_SET_TYPE_LABELS, type DataSetType } from '../../constants/dataSetTypes';
import { isLedger } from '../../utils/libraryIdentity';

const SIDE_LABELS: Record<string, string> = {
  CR: 'Credit',
  DR: 'Debit',
  RC: 'Rev. Credit',
  RD: 'Rev. Debit',
};

interface CheckoutInfo {
  bank: string;
  side: string;
  dataSetType: string;
  /** Ledger identity, for the pill display (bank/side are empty for Ledger). */
  clientCode?: string;
  erpCode?: string;
  hasChanges: boolean;
  isReadOnly?: boolean;
  actionLoading?: boolean;
  /** Tooltip shown over disabled Release / Check-in buttons explaining why
   *  they're unavailable. Without this, the operator sees grayed buttons
   *  with no context (e.g. while a rule is being authored). */
  disabledReason?: string;
  onRelease: (bank: string, side: string, dataSetType: string) => void;
  onCheckin: (bank: string, side: string, dataSetType: string) => void;
  onRequestUndo?: (bank: string, side: string, dataSetType: string) => void;
}

interface PageHeaderProps {
  tabs: { label: string }[];
  activeIndex: number;
  onTabChange: (index: number) => void;
  checkout?: CheckoutInfo;
  onOpenOnboarding?: () => void;
  onShare?: () => void;
  onNavigateToBacklog?: (target: TagSpecCommentTarget) => void;
}

export function PageHeader({ tabs, activeIndex, onTabChange, checkout, onOpenOnboarding, onShare, onNavigateToBacklog }: PageHeaderProps) {
  const { logout, username, displayName, expiresAt, isAudit, isDevops } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { lovLookup } = useLovAttributes();
  const timeRemaining = useTimeRemaining(expiresAt);

  // Resolve friendly bank / side names from the BANKS LOV and the fixed side
  // map. Falls back to the raw code when the lookup misses, so a missing LOV
  // entry never blanks the indicator.
  const ledger = checkout ? isLedger(checkout.dataSetType) : false;
  const bankName = checkout ? (lovLookup.get('BANKS')?.get(checkout.bank) ?? checkout.bank) : '';
  const sideName = checkout ? (SIDE_LABELS[checkout.side] ?? checkout.side) : '';
  const dataSetTypeName = checkout ? (DATA_SET_TYPE_LABELS[checkout.dataSetType as DataSetType] ?? checkout.dataSetType) : '';
  // Ledger has no bank/side; the pill shows Client / ERP instead.
  const primaryName = ledger ? (checkout?.clientCode ?? '') : bankName;
  const secondaryName = ledger ? (checkout?.erpCode ?? '') : sideName;
  const primaryTip = ledger ? 'Client' : (checkout?.bank ?? '');
  const secondaryTip = ledger ? 'ERP' : (checkout?.side ?? '');

  return (
    <header className="bg-surface border-b border-border">
      <div className="max-w-10xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-6 h-12">
        <h1 className="text-lg font-semibold text-heading min-w-0 truncate">Transactions Enrichment Program</h1>
        <nav className="flex gap-4 h-full shrink-0" aria-label="Tabs">
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => onTabChange(i)}
              className={`text-sm font-medium border-b-2 transition-colors cursor-pointer h-full flex items-center whitespace-nowrap
                ${
                  i === activeIndex
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-body hover:border-border-strong'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        {checkout && (
          <div data-tour="checkout-active-indicator" className="flex items-center gap-3 ml-auto shrink-0">
            <span className="text-sm text-primary-dark whitespace-nowrap">
              <span className="font-semibold">{checkout.isReadOnly ? "You're viewing" : "You're working on"}</span>{' '}
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary-dark dark:text-primary text-[11px] font-semibold px-2 py-0.5 mr-1 align-middle">
                {dataSetTypeName}
              </span>
              <Tooltip content={primaryTip} placement="bottom">
                <span className="underline decoration-dotted decoration-primary/40 cursor-help">{primaryName}</span>
              </Tooltip>
              {' - '}
              <Tooltip content={secondaryTip} placement="bottom">
                <span className="underline decoration-dotted decoration-primary/40 cursor-help">{secondaryName}</span>
              </Tooltip>
            </span>
            {!checkout.isReadOnly && !isAudit && (
              <>
                {checkout.onRequestUndo && checkout.hasChanges && (
                  <Button variant="secondary" size="xs" onClick={() => checkout.onRequestUndo!(checkout.bank, checkout.side, checkout.dataSetType)} disabled={checkout.actionLoading} className="whitespace-nowrap">
                    Review Changes
                  </Button>
                )}
                <span data-tour="checkout-actions" className="flex items-center gap-2 shrink-0">
                  {checkout.actionLoading && checkout.disabledReason ? (
                    <>
                      <Tooltip content={checkout.disabledReason} placement="bottom">
                        <span>
                          <Button variant="primary" size="xs" onClick={() => checkout.onRelease(checkout.bank, checkout.side, checkout.dataSetType)} disabled className="whitespace-nowrap">
                            {checkout.hasChanges ? 'Save and Release' : 'Release'}
                          </Button>
                        </span>
                      </Tooltip>
                      <Tooltip content={checkout.disabledReason} placement="bottom">
                        <span>
                          <Button variant="primary" size="xs" onClick={() => checkout.onCheckin(checkout.bank, checkout.side, checkout.dataSetType)} disabled className="whitespace-nowrap">
                            {checkout.hasChanges ? 'Save and Check In' : 'Check In'}
                          </Button>
                        </span>
                      </Tooltip>
                    </>
                  ) : (
                    <>
                      <Button variant="primary" size="xs" onClick={() => checkout.onRelease(checkout.bank, checkout.side, checkout.dataSetType)} disabled={checkout.actionLoading} className="whitespace-nowrap">
                        {checkout.hasChanges ? 'Save and Release' : 'Release'}
                      </Button>
                      <Button variant="primary" size="xs" onClick={() => checkout.onCheckin(checkout.bank, checkout.side, checkout.dataSetType)} disabled={checkout.actionLoading} className="whitespace-nowrap">
                        {checkout.hasChanges ? 'Save and Check In' : 'Check In'}
                      </Button>
                    </>
                  )}
                </span>
              </>
            )}
          </div>
        )}
        <div className={`${checkout ? '' : 'ml-auto '}flex items-center gap-3 shrink-0`}>
          <Tooltip content={timeRemaining} placement="bottom">
            <span className="text-xs text-body whitespace-nowrap">{displayName ?? username}</span>
          </Tooltip>
          {isAudit && (
            <Tooltip content="Read-only audit access" placement="bottom">
              <Badge variant="gray" size="xs">Audit</Badge>
            </Tooltip>
          )}
          {isDevops && (
            <Tooltip content="DevOps access — infrastructure and diagnostics" placement="bottom">
              <Badge variant="info" size="xs">DevOps</Badge>
            </Tooltip>
          )}
          {onShare && (
            <Tooltip content="Share current view" placement="bottom">
              <button
                onClick={onShare}
                data-tour="share-icon"
                className="text-muted hover:text-heading transition-colors cursor-pointer p-1"
                aria-label="Share current view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            </Tooltip>
          )}
          <CentralExportButton />
          <DownloadCenterButton />
          <NotificationsButton onNavigateToBacklog={onNavigateToBacklog} />
          {onOpenOnboarding && (
            <button
              onClick={onOpenOnboarding}
              className="text-muted hover:text-heading transition-colors cursor-pointer p-1"
              title="Open guided tour"
              aria-label="Help & onboarding"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
            </button>
          )}
          <button
            onClick={toggleTheme}
            className="text-muted hover:text-heading transition-colors cursor-pointer p-1"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </button>
          <button
            onClick={logout}
            className="text-muted hover:text-heading transition-colors cursor-pointer"
            title="Sign out"
            aria-label="Sign out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
