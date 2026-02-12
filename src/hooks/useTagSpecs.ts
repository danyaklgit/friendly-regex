import { useContext } from 'react';
import { TagSpecContext } from '../context/TagSpecContext';

export function useTagSpecs() {
  const context = useContext(TagSpecContext);
  if (!context) throw new Error('useTagSpecs must be used within TagSpecProvider');
  return context;
}
