import type { TagSpecData, TagSpecDefinition } from '../types';

export function exportTagDefinitions(definitions: TagSpecDefinition[], filename?: string): void {
  const data: TagSpecData = { TagSpecDefinitions: definitions };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? 'tag-definitions.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSingleTag(definition: TagSpecDefinition): void {
  exportTagDefinitions([definition], `tag-${definition.Tag}-${definition.Id}.json`);
}

export function importTagDefinitions(file: File): Promise<TagSpecDefinition[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as TagSpecData;
        if (!data.TagSpecDefinitions || !Array.isArray(data.TagSpecDefinitions)) {
          throw new Error('Invalid file format: missing TagSpecDefinitions array');
        }
        resolve(data.TagSpecDefinitions);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
