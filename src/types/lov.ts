export interface LOVListItem {
  StatusTag: string | null;
  StatusName: string | null;
  Value: string;
  Name: string;
  Tags: string[];
}

export interface LOVList {
  Tag: string;
  Name: string;
  Items: LOVListItem[];
}

export interface ValidationClass {
  Tag: string;
  Name: string;
  Regex: string;
}

export interface AttributeDetail {
  LanguageCode: string;
  Name: string;
  ShortDescription: string;
}

export interface BackendAttribute {
  Id: number;
  Value: string;
  StatusTag: string | null;
  StatusName: string | null;
  PossibleLOVTag: string | null;
  Details: AttributeDetail[];
}
