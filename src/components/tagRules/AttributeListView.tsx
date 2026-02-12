import type { TagAttribute } from '../../types';
import { AttributeRuleRow } from './AttributeRuleRow';

interface AttributeListViewProps {
  attributes: TagAttribute[];
}

export function AttributeListView({ attributes }: AttributeListViewProps) {
  if (attributes.length === 0) {
    return <p className="text-sm text-gray-400 italic">No attributes defined</p>;
  }

  return (
    <div className="space-y-2">
      {attributes.map((attr, i) => (
        <AttributeRuleRow key={i} attribute={attr} />
      ))}
    </div>
  );
}
