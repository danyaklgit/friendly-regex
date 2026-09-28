import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { TepHeaders } from '../../api/transactions';
import { getContextValue } from '../../types/tagSpec';
import { useTagSpecs } from '../../hooks/useTagSpecs';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { useTaggingProgress } from '../../hooks/useTaggingProgress';
import { useTaggingActivity } from '../../hooks/useTaggingActivity';
import {
  readStoredControls, writeStoredControls, resolvePresetRange, todayIso, REPORT_VIEWS, VIEW_LABELS, type ReportControls,
} from '../../utils/reports/controls';
import { Toast } from '../shared/Toast';
import { SegmentedControl } from '../shared/SegmentedControl';
import { ReportFilters } from './ReportFilters';
import { CoverageView } from './CoverageView';
import { ActivityView } from './ActivityView';
import type { ChecklistOption } from './FilterChecklistPopover';

interface ReportsTabProps {
  authToken: string | null;
  tepHeaders: TepHeaders | null;
}

const VIEW_OPTIONS = REPORT_VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }));
// TagSpecContext polls libraries every 1.5s while a tagging job runs, which
// re-renders ReportsTab through useTagSpecs(). Both sub-views' props (report,
// loading, error, refetch, handleCopy, requestedRange) are referentially
// stable across that poll, so memoizing skips the chart relayout entirely.
const MemoCoverageView = memo(CoverageView);
const MemoActivityView = memo(ActivityView);
const VIEW_DESCRIPTIONS: Record<ReportControls['view'], string> = {
  coverage: 'How much of the transaction volume is tagged, by the period the transactions belong to.',
  activity: 'What the team did, by the period the work happened in. Date range and granularity apply; feed, bank, side, and layer do not.',
};

function sessionStore(): Storage | null {
  return typeof sessionStorage === 'undefined' ? null : sessionStorage;
}

/**
 * Reports tab root: owns the controls (persisted to sessionStorage), runs
 * the sub-view hooks (only the visible one fetches), and renders the filter
 * row plus the active sub-view. Lazy-loaded from App.tsx so recharts stays
 * out of the main chunk.
 */
export function ReportsTab({ authToken, tepHeaders }: ReportsTabProps) {
  const [controls, setControls] = useState<ReportControls>(() => readStoredControls(sessionStore()));
  useEffect(() => { writeStoredControls(sessionStore(), controls); }, [controls]);
  const updateControls = useCallback((patch: Partial<ReportControls>) => setControls((prev) => ({ ...prev, ...patch })), []);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const progress = useTaggingProgress(controls, authToken, tepHeaders, controls.view === 'coverage');
  const activity = useTaggingActivity(controls, authToken, tepHeaders, controls.view === 'activity');
  const active = controls.view === 'coverage' ? progress : activity;

  const { libraries } = useTagSpecs();
  const { lovLookup } = useLovAttributes();
  const bankOptions = useMemo((): ChecklistOption[] => {
    const banks = lovLookup.get('BANKS');
    const codes = new Set<string>();
    for (const lib of libraries) {
      const code = getContextValue(lib.Context, 'BankSwiftCode');
      if (code) codes.add(code);
    }
    return [...codes]
      .map((code) => ({ value: code, label: banks?.get(code) ?? code, title: code }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [libraries, lovLookup]);

  const today = todayIso();
  const requestedRange = useMemo(() => resolvePresetRange(controls, today), [controls, today]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast({ message: 'Summary copied', type: 'success' });
    } catch {
      setToast({ message: 'Could not copy the summary', type: 'error' });
    }
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  const summaryText = active.report?.SummaryText ?? '';
  // Spec 7.1: Copy is disabled with no report, an empty report, or no summary text.
  const activeIsEmpty = controls.view === 'coverage' ? (progress.report?.Series.length ?? 0) === 0 : (activity.report?.Points.length ?? 0) === 0;
  const copyDisabled = !summaryText || activeIsEmpty;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SegmentedControl label="Report" size="sm" options={VIEW_OPTIONS} value={controls.view} onChange={(view) => updateControls({ view })} />
        <p className="text-[11px] text-muted">{VIEW_DESCRIPTIONS[controls.view]}</p>
      </div>
      <ReportFilters
        controls={controls}
        onChange={updateControls}
        showCoverageFilters={controls.view === 'coverage'}
        bankOptions={bankOptions}
        computedAtUtc={active.report?.ComputedAtUtc ?? null}
        loading={active.loading}
        onRefresh={active.refetch}
        onCopySummary={() => { if (summaryText) void handleCopy(summaryText); }}
        copyDisabled={copyDisabled}
      />
      {controls.view === 'coverage' ? (
        <MemoCoverageView report={progress.report} loading={progress.loading} error={progress.error} onRetry={progress.refetch} onCopy={handleCopy} />
      ) : (
        <MemoActivityView report={activity.report} loading={activity.loading} error={activity.error} onRetry={activity.refetch} onCopy={handleCopy} requested={requestedRange} />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
    </div>
  );
}
