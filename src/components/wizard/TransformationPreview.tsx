import { useMemo } from 'react';
import type { TransformationFormValue } from '../../types';
import { applyTransformationPipeline } from '../../utils/transformations';
import { TRANSFORMATION_METHOD_MAP } from '../../constants/transformations';
import { containsRtl } from '../../utils/bidi';
import { CharacterBreakdown } from '../shared/CharacterBreakdown';

const DEFAULT_SAMPLE = '  JOHN DOE / 12345 / PAYMENT  ';

// Position-based transformation methods whose offsets are hard to judge on
// mixed Arabic/English text — when one of these is in the pipeline and the
// sample has RTL characters, show the logical-order character breakdown.
const POSITION_METHODS = new Set([
  'substring',
  'take_first_n_chars',
  'take_last_n_chars',
  'remove_first_n_chars',
  'remove_last_n_chars',
]);

// Strip the ISO datetime time portion from a date-shaped sample for the
// "Extracted" preview line so operators reformatting a backend datetime
// field (Validity bounds, StatementDate, etc.) see a clean
// `YYYY-MM-DD` instead of `YYYY-MM-DDT00:00:00Z`. Match the strict
// "date prefix immediately followed by T + something" shape so values
// that legitimately contain a T (free-text narratives, URIs, etc.)
// aren't mangled. Only the displayed string changes — the transformation
// pipeline below still receives the full sample.
function displaySample(raw: string): string {
  return /^\d{4}-\d{2}-\d{2}T.+/.test(raw) ? raw.split('T')[0] : raw;
}

interface TransformationPreviewProps {
  transformations: TransformationFormValue[];
  sampleValue?: string;
  /**
   * Which pipeline side the preview is rendering for. Pre-extraction shows
   * a `Raw` first row (the value entering the pipeline); post-extraction
   * keeps the historical `Extracted` label (the regex output). Default is
   * `post` so existing callers render unchanged.
   */
  variant?: 'pre' | 'post';
}

export function TransformationPreview({ transformations, sampleValue, variant = 'post' }: TransformationPreviewProps) {
  const sample = sampleValue || DEFAULT_SAMPLE;

  const steps = useMemo(
    () => applyTransformationPipeline(transformations, sample),
    [transformations, sample],
  );

  if (transformations.length === 0) return null;

  const showBreakdown =
    containsRtl(sample) && transformations.some((t) => POSITION_METHODS.has(t.method));

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface-secondary p-2.5 space-y-1">
      <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1.5">
        Transformation Preview
      </p>

      <div className="flex items-start gap-2 text-xs">
        <span className="shrink-0 w-5 text-right text-faint font-mono">&bull;</span>
        <span className="text-faint text-[10px] shrink-0 w-20">
          {variant === 'pre' ? 'Raw' : 'Extracted'}
        </span>
        <code dir="auto" className="font-mono text-primary break-all whitespace-pre-wrap">"{displaySample(sample)}"</code>
      </div>

      {steps.map((step) => {
        const def = TRANSFORMATION_METHOD_MAP.get(step.method);
        return (
          <div key={step.index} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 w-5 text-right text-faint font-mono">{step.index + 1}.</span>
            <span className="text-orange-500 dark:text-orange-300 text-[10px] shrink-0 w-20 truncate" title={def?.label ?? step.method}>
              {def?.label ?? step.method}
            </span>
            <span className="text-faint">&rarr;</span>
            <code dir="auto" className="font-mono text-primary break-all whitespace-pre-wrap">"{step.result}"</code>
          </div>
        );
      })}

      {showBreakdown && <CharacterBreakdown text={sample} className="mt-1.5" />}
    </div>
  );
}
