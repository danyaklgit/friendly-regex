import { useState } from 'react';
import { Tooltip } from '../shared/Tooltip';
import { useOptionalDownloadCenter } from '../../context/DownloadCenterContext';
import { CentralExportModal } from './CentralExportModal';

/**
 * Header icon button that opens the Central Export dialog (ExportConfiguration
 * — libraries, LOVs, VIP customers, extractions, attributes, hierarchy in one
 * build). Sits next to the Download Center button, where the resulting file
 * arrives. Degrades to nothing outside the DownloadCenterProvider, same as
 * the Download Center button itself.
 */
export function CentralExportButton() {
  const downloadCenter = useOptionalDownloadCenter();
  const [open, setOpen] = useState(false);
  if (!downloadCenter) return null;
  return (
    <>
      <Tooltip content="Central export — everything in one file" placement="bottom">
        <button
          onClick={() => setOpen(true)}
          className="relative text-muted hover:text-heading transition-colors cursor-pointer p-1"
          aria-label="Open central export"
          data-tour="central-export-trigger"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        </button>
      </Tooltip>
      <CentralExportModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
