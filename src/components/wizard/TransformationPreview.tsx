import { useMemo } from 'react';
import type { TransformationFormValue } from '../../types';
import { applyTransformationPipeline } from '../../utils/transformations';
import { TRANSFORMATION_METHOD_MAP } from '../../constants/transformations';

const DEFAULT_SAMPLE = '  JOHN DOE / 12345 / PAYMENT  ';

interface TransformationPreviewProps {
  transformations: TransformationFormValue[];
  sampleValue?: string;
}

export function TransformationPreview({ transformations, sampleValue }: TransformationPreviewProps) {
  const sample = sampleValue || DEFAULT_SAMPLE;

  const steps = useMemo(
    () => applyTransformationPipeline(transformations, sample),
    [transformations, sample],
  );

  if (transformations.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface-secondary p-2.5 space-y-1">
      <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1.5">
        Transformation Preview
      </p>

      <div className="flex items-start gap-2 text-xs">
        <span className="shrink-0 w-5 text-right text-faint font-mono">&bull;</span>
        <span className="text-faint text-[10px] shrink-0 w-20">Extracted</span>
        <code className="font-mono text-primary break-all">"{sample}"</code>
      </div>

      {steps.map((step) => {
        const def = TRANSFORMATION_METHOD_MAP.get(step.method);
        return (
          <div key={step.index} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 w-5 text-right text-faint font-mono">{step.index + 1}.</span>
            <span className="text-orange-500 text-[10px] shrink-0 w-20 truncate" title={def?.label ?? step.method}>
              {def?.label ?? step.method}
            </span>
            <span className="text-faint">&rarr;</span>
            <code className="font-mono text-primary break-all">"{step.result}"</code>
          </div>
        );
      })}
    </div>
  );
}
