export interface LOVListItem {
  StatusTag: string | null;
  StatusName: string | null;
  Value: string;
  Name: string;
  Description?: string;
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

// Same shape as BackendAttribute (per the Extractions API spec), but the
// Value field carries the regex (not a tag identifier). Kept as a distinct
// type so call sites are unambiguous about which entity they're handling.
export interface BackendExtraction {
  Id: number;
  Value: string;
  StatusTag: string | null;
  StatusName: string | null;
  PossibleLOVTag: string | null;
  Details: AttributeDetail[];
}

// Resolved entry used by the AttributeEditor dropdown. `key` is the `lov:*`
// ExtractionOperation value (the regex prefixed with `lov:`), `regex` is the
// raw regex string (also = LOV item's Value), `label` is the LOV item's Name.
export interface ExtractionMethodDef {
  key: string;
  label: string;
  regex: string;
  description?: string;
}
