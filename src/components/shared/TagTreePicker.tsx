import { useState, useMemo, useCallback, useEffect } from 'react';
import type { TagTreeNode } from '../../api/tagsHierarchy';

interface TagTreePickerProps {
  label: string;
  nodes: TagTreeNode[];
  value: string;
  onChange: (tag: string) => void;
  loading?: boolean;
  required?: boolean;
  error?: boolean;
}

function TreeNode({
  node,
  depth,
  selectedTag,
  onSelect,
  defaultExpanded,
}: {
  node: TagTreeNode;
  depth: number;
  selectedTag: string;
  onSelect: (tag: string) => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isGroup = node.level === 'G';
  const isLeaf = node.level === 'T';
  const isSelected = isLeaf && node.tag === selectedTag;
  const hasChildren = node.children.length > 0;

  const handleClick = useCallback(() => {
    if (isLeaf) {
      onSelect(node.tag);
    } else if (hasChildren) {
      setExpanded((prev) => !prev);
    }
  }, [isLeaf, hasChildren, node.tag, onSelect]);

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`flex items-center w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors
          ${isSelected ? 'bg-primary/10 text-primary font-medium' : ''}
          ${isLeaf && !isSelected ? 'hover:bg-surface-hover text-heading cursor-pointer' : ''}
          ${isGroup ? 'text-muted hover:bg-surface-hover cursor-pointer font-medium' : ''}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren && (
          <svg
            className={`w-3.5 h-3.5 mr-1.5 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
        {!hasChildren && <span className="w-3.5 mr-1.5 flex-shrink-0" />}
        <span className="truncate">{node.tag}</span>
        {node.name !== node.tag && (
          <span className="ml-2 text-xs text-muted truncate">— {node.name}</span>
        )}
      </button>
      {hasChildren && expanded &&
        node.children.map((child) => (
            <TreeNode
              key={child.tag}
              node={child}
              depth={depth + 1}
              selectedTag={selectedTag}
              onSelect={onSelect}
              defaultExpanded={false}
            />
          ))
      }
    </>
  );
}

export function TagTreePicker({ label, nodes, value, onChange, loading, required, error }: TagTreePickerProps) {
  const [search, setSearch] = useState('');
  const query = search.toLowerCase().trim();

  const safeNodes = useMemo(() => (Array.isArray(nodes) ? nodes : []), [nodes]);

  // Build a tag → name lookup (deduplicated) for showing detail in the selected indicator
  const tagNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of safeNodes) {
      for (const leaf of group.children) {
        if (!map.has(leaf.tag)) map.set(leaf.tag, leaf.name);
      }
    }
    return map;
  }, [safeNodes]);

  // Case-insensitive lookup: normalize incoming value to hierarchy's canonical casing
  const canonicalTagMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of safeNodes) {
      for (const leaf of group.children) {
        const lower = leaf.tag.toLowerCase();
        if (!map.has(lower)) map.set(lower, leaf.tag);
      }
    }
    return map;
  }, [safeNodes]);

  // Auto-correct casing when value doesn't exactly match hierarchy
  useEffect(() => {
    if (!value || safeNodes.length === 0) return;
    const canonical = canonicalTagMap.get(value.toLowerCase());
    if (canonical && canonical !== value) {
      onChange(canonical);
    }
  }, [value, canonicalTagMap, onChange, safeNodes.length]);

  // When searching: collect unique matching leaf tags as a flat list (no groups)
  // When not searching: show the full tree
  const searchResults = useMemo(() => {
    if (!query) return null;
    const seen = new Set<string>();
    const results: TagTreeNode[] = [];
    for (const group of safeNodes) {
      for (const leaf of group.children) {
        if (seen.has(leaf.tag)) continue;
        const matches =
          leaf.tag.toLowerCase().includes(query) ||
          leaf.name.toLowerCase().includes(query) ||
          leaf.description.toLowerCase().includes(query);
        if (matches) {
          seen.add(leaf.tag);
          results.push(leaf);
        }
      }
    }
    return results;
  }, [safeNodes, query]);

  const borderClass = error
    ? 'border-red-400'
    : 'border-input-border';

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-body pl-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className={`rounded-lg border ${borderClass} bg-input-bg overflow-hidden`}>
        {/* Search input */}
        <div className="px-2 pt-2 pb-1">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-input-border bg-surface-primary text-heading placeholder:text-placeholder focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>
        </div>

        {/* Tree list */}
        <div className="max-h-48 overflow-y-auto px-1 pb-2">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted">
              Loading tags...
            </div>
          ) : searchResults ? (
            searchResults.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted">
                No tags match your search
              </div>
            ) : (
              searchResults.map((leaf) => (
                <TreeNode
                  key={leaf.tag}
                  node={leaf}
                  depth={0}
                  selectedTag={value}
                  onSelect={onChange}

                  defaultExpanded={false}
                />
              ))
            )
          ) : safeNodes.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted">
              No tags available
            </div>
          ) : (
            safeNodes.map((node) => (
              <TreeNode
                key={node.tag}
                node={node}
                depth={0}
                selectedTag={value}
                onSelect={onChange}

                defaultExpanded={false}
              />
            ))
          )}
        </div>

        {/* Selected tag indicator */}
        {value && (
          <div className="px-3 py-1.5 border-t border-input-border bg-surface-secondary/50 flex items-center gap-2">
            <span className="text-xs text-muted">Selected:</span>
            <span className="text-xs font-medium text-primary">
              {value}{tagNameMap.get(value) && tagNameMap.get(value) !== value ? ` - ${tagNameMap.get(value)}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
