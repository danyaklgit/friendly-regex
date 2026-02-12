import { createContext, useReducer, type ReactNode, type Dispatch } from 'react';
import type { TagSpecDefinition } from '../types';
import sampleTagData from '../data/sample.json';

export type TagSpecAction =
  | { type: 'ADD'; payload: TagSpecDefinition }
  | { type: 'UPDATE'; payload: TagSpecDefinition }
  | { type: 'DELETE'; payload: { id: number } }
  | { type: 'IMPORT'; payload: TagSpecDefinition[] }
  | { type: 'REPLACE_ALL'; payload: TagSpecDefinition[] };

function tagSpecReducer(
  state: TagSpecDefinition[],
  action: TagSpecAction
): TagSpecDefinition[] {
  switch (action.type) {
    case 'ADD':
      return [...state, action.payload];
    case 'UPDATE':
      return state.map((def) =>
        def.Id === action.payload.Id ? action.payload : def
      );
    case 'DELETE':
      return state.filter((def) => def.Id !== action.payload.id);
    case 'IMPORT': {
      const existing = new Map(state.map((d) => [d.Id, d]));
      for (const imported of action.payload) {
        existing.set(imported.Id, imported);
      }
      return Array.from(existing.values());
    }
    case 'REPLACE_ALL':
      return action.payload;
    default:
      return state;
  }
}

export interface TagSpecContextValue {
  tagDefinitions: TagSpecDefinition[];
  dispatch: Dispatch<TagSpecAction>;
}

export const TagSpecContext = createContext<TagSpecContextValue | null>(null);

export function TagSpecProvider({ children }: { children: ReactNode }) {
  const initialData = (sampleTagData as { TagSpecDefinitions: TagSpecDefinition[] }).TagSpecDefinitions;
  const [tagDefinitions, dispatch] = useReducer(tagSpecReducer, initialData);

  return (
    <TagSpecContext.Provider value={{ tagDefinitions, dispatch }}>
      {children}
    </TagSpecContext.Provider>
  );
}
