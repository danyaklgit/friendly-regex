interface AttributeDisplayProps {
  attributes: Record<string, Record<string, string | null>>;
}

export function AttributeDisplay({ attributes }: AttributeDisplayProps) {
  const tagNames = Object.keys(attributes);
  if (tagNames.length === 0) return <span className="text-gray-400">-</span>;

  return (
    <div className="space-y-1.5">
      {tagNames.map((tagName) => {
        const attrs = attributes[tagName];
        const entries = Object.entries(attrs).filter(([, v]) => v !== null);
        if (entries.length === 0) return null;
        return (
          <div key={tagName} className="space-y-0.5">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-1 text-xs">
                <span className="text-gray-500 font-medium">{key}:</span>
                <span className="text-gray-900">{value}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
