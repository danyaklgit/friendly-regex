import { useEffect, useMemo, useState } from 'react';
import { useLovAttributes } from '../../context/LovAttributesContext';
import { LovCategoryList } from './LovCategoryList';
import { LovItemsPane } from './LovItemsPane';

// LOV tags that belong to internal/derived flows and are already surfaced
// elsewhere in the app (Attributes tab, transformation pipeline, the new
// Extractions tab). Hide them from the operator-facing LOVs UI.
const HIDDEN_LOV_TAGS = new Set(['ATTRIBUTES', 'ATTRIBUTE_TRANSFORMATON', 'EXTRACTIONS']);

export function LovsPage() {
  const { lovLists, lovLoading, refetchAll } = useLovAttributes();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const visibleLists = useMemo(
    () => lovLists.filter((l) => !HIDDEN_LOV_TAGS.has(l.Tag)),
    [lovLists],
  );

  // Auto-select the first category once data lands. If the previously selected
  // category disappears after a refresh, fall back to the first available.
  useEffect(() => {
    if (visibleLists.length === 0) {
      if (selectedTag !== null) setSelectedTag(null);
      return;
    }
    if (!selectedTag || !visibleLists.some((l) => l.Tag === selectedTag)) {
      setSelectedTag(visibleLists[0].Tag);
    }
  }, [visibleLists, selectedTag]);

  const selectedList = useMemo(
    () => visibleLists.find((l) => l.Tag === selectedTag) ?? null,
    [visibleLists, selectedTag],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetchAll();
    } finally {
      setRefreshing(false);
    }
  };

  if (lovLoading && lovLists.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-body-secondary">
        Loading lists…
      </div>
    );
  }

  if (visibleLists.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-body-secondary">
        No LOV categories available.
      </div>
    );
  }

  return (
    <div className="flex h-full -m-4" data-tour="lovs-page">
      <LovCategoryList
        lists={visibleLists}
        selectedTag={selectedTag}
        onSelect={setSelectedTag}
      />
      <LovItemsPane
        list={selectedList}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />
    </div>
  );
}
