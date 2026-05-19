import type { TagAttribute } from '../../types';
import { AttributeRuleRow } from './AttributeRuleRow';

interface AttributeListViewProps {
  attributes: TagAttribute[];
  libraryId?: string;
  definitionId?: string;
}

export function AttributeListView({ attributes, libraryId, definitionId }: AttributeListViewProps) {
  if (attributes.length === 0) {
    return <p className="text-sm text-faint italic">No attributes defined</p>;
  }

  return (
    <div className="space-y-2">
      {attributes.map((attr, i) => (
        <AttributeRuleRow
          key={i}
          attribute={attr}
          libraryId={libraryId}
          definitionId={definitionId}
        />
      ))}
    </div>
  );
}
