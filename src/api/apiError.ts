/**
 * Custom error class for API failures that carries the SFM message
 * extracted from the response body.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Extract error message from SFM.Minor[0].MinorRetCodeDetails[0].ShortDescription
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMinorSfmMessage(json: any): string | null {
  const minor = json?.SFM?.Minor;
  if (!Array.isArray(minor) || minor.length === 0) return null;
  const details = minor[0]?.MinorRetCodeDetails;
  if (!Array.isArray(details) || details.length === 0) return null;
  return details[0]?.ShortDescription ?? null;
}

/**
 * Throws an ApiError if the response is not ok.
 * Attempts to extract the SFM Minor message from the response body;
 * falls back to the provided message if extraction fails.
 */
export async function throwIfNotOk(res: Response, fallbackMessage: string): Promise<void> {
  if (res.ok) return;
  let message: string | null = null;
  try {
    const json = await res.json();
    message = extractMinorSfmMessage(json);
  } catch { /* body might not be JSON */ }
  throw new ApiError(message ?? fallbackMessage, res.status);
}
