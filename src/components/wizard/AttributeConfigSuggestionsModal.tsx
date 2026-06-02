import type { AttributeFormValue } from '../../types';
import type { AttributeConfigSuggestion } from '../../utils/attributeConfigSuggestions';
import { EXTRACTION_OPERATIONS } from '../../constants/operations';
import { humanizeFieldName } from '../../utils/humanizeFieldName';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';

interface AttributeConfigSuggestionsModalProps {
  open: boolean;
  /** Attribute tag the suggestions were computed for — used in the modal
   *  heading copy so the operator confirms they're picking the right list. */
  attributeTag: string;
  /** Same-bank suggestions, already deduped and sorted by usage count. */
  suggestions: AttributeConfigSuggestion[];
  onClose: () => void;
  /** Fired when the operator applies a suggestion. The handler decides how
   *  to merge the config into the current row (the standard contract is:
   *  preserve id + attributeTag + isMandatory, overwrite everything else). */
  onApply: (config: AttributeFormValue) => void;
}

/**
 * Modal listing same-bank attribute extraction configs the operator can
 * adopt with one click. Triggered from the AttributeEditor's "Suggestions"
 * button next to the attribute-name picker. Deduped by extraction
 * fingerprint so identical configs collapse into one card with a usage
 * count badge.
 */
export function AttributeConfigSuggestionsModal({
  open,
  attributeTag,
  suggestions,
  onClose,
  onApply,
}: AttributeConfigSuggestionsModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Borrow extraction rules for "${attributeTag}"`}
      widthClass="max-w-2xl"
    >
      <div className="space-y-3">
        <p className="text-xs text-body-secondary">
          Other tag definitions in this bank already extract <span className="font-mono">{attributeTag}</span>.
          Click <span className="font-medium">Apply</span> on any card to drop its source field, extraction method,
          transformations, and validation into your row. The attribute name and the Mandatory flag stay as they are.
        </p>
        {suggestions.length === 0 ? (
          <div className="text-sm text-faint italic py-6 text-center">
            No other definitions in this bank carry an attribute named "{attributeTag}".
          </div>
        ) : (
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar -mx-1 px-1">
            {suggestions.map((suggestion, idx) => (
              <SuggestionCard
                key={idx}
                suggestion={suggestion}
                onApply={() => {
                  onApply(suggestion.config);
                  onClose();
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function SuggestionCard({
  suggestion,
  onApply,
}: {
  suggestion: AttributeConfigSuggestion;
  onApply: () => void;
}) {
  const { config, usages } = suggestion;
  const usageCount = usages.length;
  const primary = usages[0];
  const extraOp = EXTRACTION_OPERATIONS.find((o) => o.key === config.extractionOperation);
  const transformations = config.transformations ?? [];
  const sourceFieldLabel = config.sourceField
    ? humanizeFieldName(config.sourceField)
    : config.isConstant
      ? 'Constant'
      : '—';
  const extractionLabel = config.isConstant
    ? `= "${config.constantValue ?? ''}"`
    : extraOp?.label ?? config.extractionOperation ?? '—';
  return (
    <li className="rounded-lg border border-border bg-surface-secondary px-3 py-2.5 hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-heading truncate">{primary?.tag}</span>
            {primary?.side && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-body-secondary bg-surface px-1.5 py-0.5 rounded border border-border-subtle">
                {primary.side}
              </span>
            )}
            {usageCount > 1 && (
              <span
                className="text-[10px] font-medium text-primary-dark bg-primary/10 px-1.5 py-0.5 rounded"
                title={usages.map((u) => `${u.tag} (${u.side || '—'})`).join(', ')}
              >
                used by {usageCount} definitions
              </span>
            )}
          </div>
          <div className="text-xs text-body flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-[11px] font-semibold text-primary-dark bg-primary/10 px-1.5 py-0.5 rounded">
              {sourceFieldLabel}
            </span>
            <span>{extractionLabel}</span>
          </div>
          {!config.isConstant && (
            <div className="text-[11px] text-body-secondary space-y-0.5">
              {config.prefix && (
                <ParamLine label="Prefix" value={config.prefix} />
              )}
              {config.suffix && (
                <ParamLine label="Suffix" value={config.suffix + (config.suffixOrEndOfInput ? ' or end' : '')} />
              )}
              {config.pattern && (
                <ParamLine label="Pattern" value={config.pattern} />
              )}
              {config.verifyValue && (
                <ParamLine label="Verify" value={config.verifyValue} />
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {transformations.length > 0 && (
              <span className="text-[10px] text-body-secondary bg-surface px-1.5 py-0.5 rounded border border-border-subtle">
                {transformations.length === 1
                  ? `1 transformation: ${transformations[0].method}`
                  : `${transformations.length} transformations: ${transformations.map((t) => t.method).join(' → ')}`}
              </span>
            )}
            {config.validationRuleTag && (
              <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                Validation: {config.validationRuleTag}
              </span>
            )}
            {config.lovTag && (
              <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                LOV: {config.lovTag}
              </span>
            )}
            {config.isMandatory && (
              <span className="text-[10px] text-red-600 dark:text-rose-300 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/30">
                Mandatory
              </span>
            )}
          </div>
        </div>
        <Button variant="primary" size="xs" onClick={onApply} className="shrink-0">
          Apply
        </Button>
      </div>
    </li>
  );
}

function ParamLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-faint">{label}:</span>
      <span className="font-mono text-[11px] text-body break-all">{value}</span>
    </div>
  );
}
