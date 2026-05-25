/**
 * Triggers a browser file save by creating an object URL for the blob,
 * clicking a temporary anchor tag, and revoking the URL on the next tick
 * so the navigation has time to start. Used by the Download Center to
 * deliver the XLSX file once the backend CSV is converted client-side.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Defer revoke + remove so Firefox/Safari actually start the download.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}
