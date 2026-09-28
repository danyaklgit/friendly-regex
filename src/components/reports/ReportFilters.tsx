import { useMemo } from 'react';
import { DATA_SET_TYPES, DATA_SET_TYPE_LABELS } from '../../constants/dataSetTypes';
import { TAGGING_GRANULARITIES, TAGGING_LAYERS } from '../../api/taggingReportsShared';
import { REPORT_PRESETS, PRESET_LABELS, REPORT_SIDES, SIDE_LABELS, type ReportControls } from '../../utils/reports/controls';
import { GRANULARITY_LABELS, LAYER_LABELS } from '../../utils/reports/labels';
import { formatAsOf, formatAsOfFull } from '../../utils/reports/format';
import { Select } from '../shared/Select';
import { DateField } from '../shared/DateField';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';
import { SegmentedControl } from '../shared/SegmentedControl';
import { FilterChecklistPopover, type ChecklistOption } from './FilterChecklistPopover';

interface ReportFiltersProps {
  controls: ReportControls;
  onChange: (patch: Partial<ReportControls>) => void;
  /** false on the Team activity view: feed, bank, side, and layer do not apply there. */
  showCoverageFilters: boolean;
  bankOptions: ChecklistOption[];
  /** The active view's ComputedAtUtc; null before the first report. */
  computedAtUtc: string | null;
  loading: boolean;
  onRefresh: () => void;
  onCopySummary: () => void;
  copyDisabled: boolean;
}

const PRESET_OPTIONS = REPORT_PRESETS.map((p) => ({ value: p, label: PRESET_LABELS[p] }));
const GRANULARITY_OPTIONS = TAGGING_GRANULARITIES.map((g) => ({ value: g, label: GRANULARITY_LABELS[g], ...(g === 'Week' ? { title: 'Weeks start on Sunday' } : {}) }));
const LAYER_OPTIONS = TAGGING_LAYERS.map((l) => ({ value: l, label: LAYER_LABELS[l] }));
const FEED_OPTIONS: ChecklistOption[] = DATA_SET_TYPES.map((t) => ({ value: t, label: DATA_SET_TYPE_LABELS[t], title: t }));
const SIDE_OPTIONS: ChecklistOption[] = REPORT_SIDES.map((s) => ({ value: s, label: SIDE_LABELS[s], title: s }));

/** The one filter row that scopes every chart and tile below it. */
export function ReportFilters({ controls, onChange, showCoverageFilters, bankOptions, computedAtUtc, loading, onRefresh, onCopySummary, copyDisabled }: ReportFiltersProps) {
  const asOf = useMemo(() => (computedAtUtc ? formatAsOf(computedAtUtc) : null), [computedAtUtc]);
  const asOfFull = useMemo(() => (computedAtUtc ? formatAsOfFull(computedAtUtc) : null), [computedAtUtc]);

  // An inverted range would 400 on the backend, so it is rejected here and
  // DateField snaps the field back to the committed value (spec 5.1).
  const setFrom = (from: string) => {
    if (from && controls.to && from > controls.to) return;
    onChange({ from });
  };
  const setTo = (to: string) => {
    if (to && controls.from && to < controls.from) return;
    onChange({ to });
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Select
          aria-label="Date range"
          options={PRESET_OPTIONS}
          value={controls.preset}
          onChange={(e) => onChange({ preset: e.target.value as ReportControls['preset'] })}
          className="py-1! text-xs! w-auto!"
        />
        {controls.preset === 'custom' && (
          <>
            <DateField label="From" compact inlineLabel value={controls.from} onChange={setFrom} onClear={() => onChange({ from: '' })} disabled={false} max={controls.to || undefined} />
            <DateField label="To" compact inlineLabel value={controls.to} onChange={setTo} onClear={() => onChange({ to: '' })} disabled={false} min={controls.from || undefined} />
          </>
        )}
        <SegmentedControl label="Granularity" options={GRANULARITY_OPTIONS} value={controls.granularity} onChange={(granularity) => onChange({ granularity })} />
        {showCoverageFilters && (
          <>
            <FilterChecklistPopover label="Feed" options={FEED_OPTIONS} selected={controls.dataSetTypes} onChange={(dataSetTypes) => onChange({ dataSetTypes })} />
            <FilterChecklistPopover label="Bank" options={bankOptions} selected={controls.banks} onChange={(banks) => onChange({ banks })} emptyLabel="No banks loaded yet" />
            <FilterChecklistPopover label="Side" options={SIDE_OPTIONS} selected={controls.sides} onChange={(sides) => onChange({ sides })} />
            <SegmentedControl label="Layer" options={LAYER_OPTIONS} value={controls.layer} onChange={(layer) => onChange({ layer })} />
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {asOf && asOfFull && (
            <Tooltip content={`Computed ${asOfFull}. Served from a ~5 minute cache.`}>
              <span className="text-[11px] text-muted whitespace-nowrap cursor-default">{`as of ${asOf}`}</span>
            </Tooltip>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh report"
            title="Refresh report"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border text-body-secondary hover:text-heading hover:bg-surface-active disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M5.062 9A8.001 8.001 0 0119.418 7M18.938 15A8.001 8.001 0 014.582 17" />
            </svg>
          </button>
          <Button variant="secondary" size="xs" onClick={onCopySummary} disabled={copyDisabled}>Copy summary</Button>
        </div>
      </div>
      {showCoverageFilters && controls.layer === 'Active' && (
        <p className="text-xs text-muted">Published data. The first load after switching may take longer.</p>
      )}
    </div>
  );
}
