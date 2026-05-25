import { Tooltip } from '../shared/Tooltip';
import { useOptionalDownloadCenter } from '../../context/DownloadCenterContext';

/**
 * Header icon button that opens the Download Center modal. Renders a small
 * red unread badge when the operator has READY files they haven't seen
 * yet (tracked via the provider's localStorage-backed `seenReadyIds` set).
 * Returns null when used outside the provider so the button degrades safely
 * if the provider ever fails to mount.
 */
export function DownloadCenterButton() {
  const downloadCenter = useOptionalDownloadCenter();
  if (!downloadCenter) return null;
  const { openModal, unreadReadyCount } = downloadCenter;
  return (
    <Tooltip content="Download Center" placement="bottom">
      <button
        onClick={openModal}
        className="relative text-muted hover:text-heading transition-colors cursor-pointer p-1"
        aria-label="Open Download Center"
        data-tour="download-center-trigger"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        {unreadReadyCount > 0 && (
          <span
            aria-label={`${unreadReadyCount} export${unreadReadyCount === 1 ? '' : 's'} ready`}
            className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none"
          >
            {unreadReadyCount > 9 ? '9+' : unreadReadyCount}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
