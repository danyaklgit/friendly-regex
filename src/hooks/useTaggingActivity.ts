import { useMemo } from 'react';
import { getTaggingActivity, type TaggingActivityReport } from '../api/taggingActivity';
import type { TepHeaders } from '../api/transactions';
import { buildTaggingActivityRequest, todayIso, type ReportControls } from '../utils/reports/controls';
import { useReportRequest, type ReportRequestState } from './useReportRequest';

/** Team activity report for the current date range and granularity (no other filters apply). */
export function useTaggingActivity(
  controls: ReportControls,
  authToken: string | null,
  tepHeaders: TepHeaders | null,
  enabled = true,
): ReportRequestState<TaggingActivityReport> {
  const today = todayIso();
  const request = useMemo(() => buildTaggingActivityRequest(controls, today), [controls, today]);
  return useReportRequest(request, getTaggingActivity, authToken, tepHeaders, enabled);
}
