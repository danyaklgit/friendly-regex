import { useMemo } from 'react';
import { getTaggingProgress, type TaggingProgressReport } from '../api/taggingProgress';
import type { TepHeaders } from '../api/transactions';
import { buildTaggingProgressRequest, todayIso, type ReportControls } from '../utils/reports/controls';
import { useReportRequest, type ReportRequestState } from './useReportRequest';

/** Coverage report for the current controls (feed/bank/side/layer apply). */
export function useTaggingProgress(
  controls: ReportControls,
  authToken: string | null,
  tepHeaders: TepHeaders | null,
  enabled = true,
): ReportRequestState<TaggingProgressReport> {
  const today = todayIso();
  const request = useMemo(() => buildTaggingProgressRequest(controls, today), [controls, today]);
  return useReportRequest(request, getTaggingProgress, authToken, tepHeaders, enabled);
}
