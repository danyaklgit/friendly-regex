import { useState } from 'react';
import type { TagSpecLibrary } from '../../types';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';
import { exportTagLibraries } from '../../utils/persistence';

interface LibraryExportDialogProps {
  open: boolean;
  onClose: () => void;
  activeLib: TagSpecLibrary;
  inProgressLib: TagSpecLibrary;
  /** Used to build a recognizable filename, e.g.
   *  `tag-library-NCBKSAJE-CR-both.json`. Both bank and side are the
   *  operator's natural anchor for this row. */
  bank: string;
  side: string;
  /** Human-readable bank label for the dialog body (e.g. "Saudi National
   *  Bank"). Falls back to the swift code when the label isn't available. */
  bankLabel?: string;
}

type Scope = 'active' | 'inprogress' | 'both';

/**
 * Per-(bank, side) library export picker. The Backlog row that owns this
 * dialog has confirmed an INPROGRESS sibling exists for the ACTIVE library,
 * which is why three scope choices are even meaningful — ACTIVE alone gets
 * the live JSON, INPROGRESS alone gets the draft, Both gets a single file
 * containing both libraries so they can be reproduced as a pair. The
 * output format reuses {@link exportTagLibraries} so consumers (import,
 * tooling, version control) see the same shape they already understand.
 */
export function LibraryExportDialog({
  open,
  onClose,
  activeLib,
  inProgressLib,
  bank,
  side,
  bankLabel,
}: LibraryExportDialogProps) {
  const [scope, setScope] = useState<Scope>('both');

  const handleExport = () => {
    const libs: TagSpecLibrary[] =
      scope === 'active'
        ? [activeLib]
        : scope === 'inprogress'
          ? [inProgressLib]
          : [activeLib, inProgressLib];
    const filename = `tag-library-${bank}-${side}-${scope}.json`;
    exportTagLibraries(libs, filename);
    onClose();
  };

  const display = bankLabel?.trim() ? `${bankLabel} (${bank})` : bank;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export Library"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleExport}>
            Export
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-body-secondary">
          Choose which version of the <span className="font-semibold">{display}</span>{' '}
          <span className="font-semibold">{side}</span> library to export.
        </p>
        <div className="space-y-2">
          <ScopeRadio
            value="active"
            label="ACTIVE only"
            description={`${activeLib.TagSpecDefinitions.length} definition${activeLib.TagSpecDefinitions.length === 1 ? '' : 's'}`}
            scope={scope}
            onChange={setScope}
          />
          <ScopeRadio
            value="inprogress"
            label="INPROGRESS only"
            description={`${inProgressLib.TagSpecDefinitions.length} definition${inProgressLib.TagSpecDefinitions.length === 1 ? '' : 's'} (your in-progress draft)`}
            scope={scope}
            onChange={setScope}
          />
          <ScopeRadio
            value="both"
            label="Both"
            description="ACTIVE and INPROGRESS in one file"
            scope={scope}
            onChange={setScope}
          />
        </div>
      </div>
    </Modal>
  );
}

interface ScopeRadioProps {
  value: Scope;
  label: string;
  description: string;
  scope: Scope;
  onChange: (next: Scope) => void;
}

function ScopeRadio({ value, label, description, scope, onChange }: ScopeRadioProps) {
  const selected = scope === value;
  return (
    <label
      className={`flex items-start gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:bg-surface-hover'
      }`}
    >
      <input
        type="radio"
        name="library-export-scope"
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
        className="mt-0.5"
      />
      <div className="min-w-0">
        <div className="text-sm font-medium text-heading">{label}</div>
        <div className="text-xs text-muted">{description}</div>
      </div>
    </label>
  );
}
