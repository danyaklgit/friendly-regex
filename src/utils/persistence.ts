import type { TagSpecLibrary, TagSpecDefinition } from '../types';

export function exportTagLibraries(libraries: TagSpecLibrary[], filename?: string): void {
  const json = JSON.stringify(libraries, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? 'tag-libraries.json';
  a.click();
  URL.revokeObjectURL(url);
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
