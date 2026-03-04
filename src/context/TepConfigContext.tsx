import { createContext, useContext, type ReactNode } from 'react';

export interface TepConfig {
  ttpTenantCode: string;
  languageCode: string;
  timeZone: string;
  ttpRequestId: string;
}

const defaults: TepConfig = {
  ttpTenantCode: 'dolor',
  languageCode: 'cu',
  timeZone: 'dolor',
  ttpRequestId: 'dolor',
};

const TepConfigContext = createContext<TepConfig>(defaults);

export function TepConfigProvider({ children }: { children: ReactNode }) {
  return (
    <TepConfigContext.Provider value={defaults}>
      {children}
    </TepConfigContext.Provider>
  );
}

export function useTepConfig(): TepConfig {
  return useContext(TepConfigContext);
}
