import { ZERO_METRICS, type TaggingMetrics, type TaggingProgressPoint, type TaggingProgressReport } from '../../api/taggingProgress';
import { ZERO_ACTIVITY, type TaggingActivityMetrics, type TaggingActivityPoint, type TaggingActivityReport } from '../../api/taggingActivity';

/** Test-only builders. Imported by *.test files only; never by app code. */

export function metrics(partial: Partial<TaggingMetrics> = {}): TaggingMetrics {
  return { ...ZERO_METRICS, ...partial };
}

export function point(
  periodStart: string,
  periodEnd: string,
  label: string,
  total: number,
  tagged: number,
  extra: Partial<TaggingMetrics> = {},
): TaggingProgressPoint {
  const rate = total > 0 ? Math.round((tagged / total) * 10000) / 100 : 0;
  return {
    ...metrics({ TotalTransactionCount: total, TotalTaggedCount: tagged, UntaggedCount: total - tagged, TaggingRate: rate, FullyTaggedCount: tagged, ...extra }),
    PeriodStart: periodStart,
    PeriodEnd: periodEnd,
    Label: label,
  };
}

/** Two feeds over Jan to Mar 2024 by month; Ledger has no February point. */
export function makeReportFixture(): TaggingProgressReport {
  const mt940 = [
    point('2024-01-01', '2024-01-31', 'Jan 2024', 1000, 400, {
      IssuesCount: 5, MultiTaggedCount: 2, DeadEndCount: 1,
      TaggedWithMissingMandatoryAttrCount: 3, TaggedWithMissingOptionalAttrCount: 4, TaggedWithInvalidAttrCount: 1, FullyTaggedCount: 390,
    }),
    point('2024-02-01', '2024-02-29', 'Feb 2024', 2000, 1000),
    point('2024-03-01', '2024-03-31', 'Mar 2024', 3000, 2400),
  ];
  const ledger = [
    point('2024-01-01', '2024-01-31', 'Jan 2024', 100, 10),
    point('2024-03-01', '2024-03-31', 'Mar 2024', 200, 20),
  ];
  const lines = ['TEP tagging progress, 2024-01-01 to 2024-03-31', '', '- 6,300 transactions, 3,830 tagged -> 60.8% coverage'];
  return {
    Granularity: 'Month',
    FromDate: '2024-01-01',
    ToDate: '2024-03-31',
    Layer: 'Ops',
    ComputedAtUtc: '2026-09-28T07:46:58Z',
    Series: [
      {
        DataSetType: 'MT940',
        Points: mt940,
        Totals: metrics({
          TotalTransactionCount: 6000, TotalTaggedCount: 3800, UntaggedCount: 2200, TaggingRate: 63.33, FullyTaggedCount: 3790,
          IssuesCount: 5, MultiTaggedCount: 2, DeadEndCount: 1,
          TaggedWithMissingMandatoryAttrCount: 3, TaggedWithMissingOptionalAttrCount: 4, TaggedWithInvalidAttrCount: 1,
        }),
      },
      {
        DataSetType: 'Ledger',
        Points: ledger,
        Totals: metrics({ TotalTransactionCount: 300, TotalTaggedCount: 30, UntaggedCount: 270, TaggingRate: 10, FullyTaggedCount: 30 }),
      },
    ],
    Totals: metrics({
      TotalTransactionCount: 6300, TotalTaggedCount: 3830, UntaggedCount: 2470, TaggingRate: 60.79, FullyTaggedCount: 3820,
      IssuesCount: 5, MultiTaggedCount: 2, DeadEndCount: 1,
      TaggedWithMissingMandatoryAttrCount: 3, TaggedWithMissingOptionalAttrCount: 4, TaggedWithInvalidAttrCount: 1,
    }),
    SummaryLines: lines,
    SummaryText: lines.join('\n'),
  };
}

export function activityMetrics(partial: Partial<TaggingActivityMetrics> = {}): TaggingActivityMetrics {
  return { ...ZERO_ACTIVITY, ...partial };
}

export function activityPoint(periodStart: string, periodEnd: string, label: string, partial: Partial<TaggingActivityMetrics> = {}): TaggingActivityPoint {
  return { ...activityMetrics(partial), PeriodStart: periodStart, PeriodEnd: periodEnd, Label: label };
}

/** The addendum's QA month table; July 2026 is absent (a genuinely quiet month). */
export function makeActivityFixture(): TaggingActivityReport {
  const lines = [
    'TEP tagging activity, 2026-05-27 to 2026-09-25',
    '',
    '- 339 check-in(s) by 5 operator(s) across 22 workspace(s)',
    '- 247 rules added (net)',
    '- 30 save(s), 10 rollback(s)',
    '- ~50,566 transactions became tagged (reconstructed, not a recorded figure)',
    '- activity history begins 2026-05-27; there are no records before that',
  ];
  return {
    Granularity: 'Month',
    FromDate: '2026-05-27',
    ToDate: '2026-09-25',
    HistoryStartsAt: '2026-05-27',
    TransactionsTaggedIsReconstructed: true,
    ComputedAtUtc: '2026-09-28T08:45:00Z',
    Points: [
      activityPoint('2026-05-01', '2026-05-31', '2026-05', { CheckIns: 68, Workspaces: 8, Operators: 2, RulesAdded: 32 }),
      activityPoint('2026-06-01', '2026-06-30', '2026-06', { CheckIns: 181, Rollbacks: 3, Workspaces: 20, Operators: 2, RulesAdded: 100 }),
      activityPoint('2026-08-01', '2026-08-31', '2026-08', { CheckIns: 88, Saves: 12, Rollbacks: 2, Workspaces: 22, Operators: 5, RulesAdded: 115, TransactionsTagged: 50560 }),
      activityPoint('2026-09-01', '2026-09-30', '2026-09', { CheckIns: 2, Saves: 18, Rollbacks: 5, Workspaces: 12, Operators: 1, TransactionsTagged: 6 }),
    ],
    Totals: activityMetrics({ CheckIns: 339, Saves: 30, Rollbacks: 10, Workspaces: 22, Operators: 5, RulesAdded: 247, TransactionsTagged: 50566 }),
    SummaryLines: lines,
    SummaryText: lines.join('\n'),
  };
}
