import type { TagSpecLibrary, TagSpecDefinition } from '../types';

/**
 * Stream an arbitrary JSON-serializable value to the user as a downloaded
 * `.json` file. Mirrors the tag-libraries export path so other Settings
 * surfaces (hierarchy, attributes) can offer the same UI affordance.
 */
export function exportJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportTagLibraries(libraries: TagSpecLibrary[], filename?: string): void {
  exportJson(libraries, filename ?? 'tag-libraries.json');
}

export function exportSingleDefinition(
  definition: TagSpecDefinition,
  parentLib: TagSpecLibrary
): void {
  const wrappedLib: TagSpecLibrary = {
    ...parentLib,
    TagSpecDefinitions: [definition],
  };
  exportTagLibraries([wrappedLib], `tag-${definition.Tag}-${definition.Id}.json`);
}

export function importTagLibraries(file: File): Promise<TagSpecLibrary[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);

        // Expect an array of TagSpecLibrary objects
        if (Array.isArray(data) && data.every((lib: TagSpecLibrary) =>
          lib.Context && Array.isArray(lib.Context) &&
          lib.TagSpecDefinitions && Array.isArray(lib.TagSpecDefinitions)
        )) {
          resolve(data as TagSpecLibrary[]);
          return;
        }

        throw new Error('Invalid file format: expected an array of TagSpecLibrary objects');
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Keep backward-compatible aliases for imports that haven't been migrated yet
export const exportTagDefinitions = exportTagLibraries;
export const importTagDefinitions = importTagLibraries;
