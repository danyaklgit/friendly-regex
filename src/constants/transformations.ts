export interface TransformationArgDef {
  key: string;
  label: string;
  placeholder: string;
  type: 'text' | 'number' | 'checkbox';
  required: boolean;
}

export interface TransformationMethodDef {
  key: string;
  label: string;
  description?: string;
  category: string;
  args: TransformationArgDef[];
}

export const TRANSFORMATION_CATEGORIES = [
  'Text Case',
  'Trimming',
  'Removal',
  'Find/Replace',
  'Formatting',
  'Extraction Refinement',
] as const;

export const TRANSFORMATION_METHODS: TransformationMethodDef[] = [
  // Text Case
  { key: 'to_uppercase', label: 'To Uppercase', category: 'Text Case', args: [] },
  { key: 'to_lowercase', label: 'To Lowercase', category: 'Text Case', args: [] },
  { key: 'to_sentence_case', label: 'To Sentence Case', category: 'Text Case', args: [] },
  { key: 'to_title_case', label: 'To Title Case', category: 'Text Case', args: [] },

  // Trimming
  { key: 'trim', label: 'Trim (both sides)', category: 'Trimming', args: [] },
  { key: 'trim_left', label: 'Trim Left', category: 'Trimming', args: [] },
  { key: 'trim_right', label: 'Trim Right', category: 'Trimming', args: [] },
  { key: 'collapse_whitespace', label: 'Remove Extra Blanks', category: 'Trimming', args: [] },

  // Removal
  { key: 'remove_alpha', label: 'Remove Alphabetic', category: 'Removal', args: [] },
  { key: 'remove_numeric', label: 'Remove Numeric', category: 'Removal', args: [] },
  { key: 'remove_non_numeric', label: 'Remove Non-Numeric', category: 'Removal', args: [] },
  { key: 'remove_special_chars', label: 'Remove Special Characters', category: 'Removal', args: [] },
  { key: 'remove_spaces_and_line_breaks', label: 'Remove Spaces and Line Breaks', category: 'Removal', args: [] },

  // Find/Replace.
  // Placeholders are deliberately short ("e.g., …" style) — the transformations
  // section sits in the half-width Attributes column of the rule builder, so a
  // two-arg row's inputs land at ~100-150px each and longer hint copy gets
  // clipped mid-word. Concrete examples carry more information at that width
  // than the descriptive sentences they replaced.
  {
    key: 'replace',
    label: 'Replace',
    category: 'Find/Replace',
    args: [
      { key: 'find', label: 'Find', placeholder: 'e.g., NMSC', type: 'text', required: true },
      { key: 'replaceWith', label: 'Replace With', placeholder: 'e.g., -X', type: 'text', required: true },
    ],
  },
  {
    key: 'regex_replace',
    label: 'Regex Replace',
    category: 'Find/Replace',
    args: [
      { key: 'pattern', label: 'Pattern', placeholder: 'e.g., \\d+', type: 'text', required: true },
      { key: 'replaceWith', label: 'Replace With', placeholder: 'e.g., -X', type: 'text', required: true },
    ],
  },
  {
    // If the value STARTS with `prefix`, the prefix is swapped for
    // `replaceWith`. Otherwise the value passes through unchanged
    // (no-op semantics, matching `replace`). Useful for normalizing
    // bank-reference prefixes (e.g. "SRCACT//..." → "ACC-...").
    key: 'starts_with_and_replace',
    label: 'If Starts With, Replace Start',
    description: 'Args: prefix, replaceWith. Example: "SRCACT//12345" -> "ACC-12345" (prefix "SRCACT//", replaceWith "ACC-")',
    category: 'Find/Replace',
    args: [
      { key: 'prefix', label: 'Prefix', placeholder: 'e.g., SRCACT//', type: 'text', required: true },
      { key: 'replaceWith', label: 'Replace With', placeholder: 'e.g., ACC-', type: 'text', required: true },
    ],
  },
  {
    // If the value ENDS with `suffix`, the suffix is swapped for
    // `replaceWith`. Otherwise the value passes through unchanged.
    key: 'ends_with_and_replace',
    label: 'If Ends With, Replace End',
    description: 'Args: suffix, replaceWith. Example: "12345NMSC" -> "12345-X" (suffix "NMSC", replaceWith "-X")',
    category: 'Find/Replace',
    args: [
      { key: 'suffix', label: 'Suffix', placeholder: 'e.g., NMSC', type: 'text', required: true },
      { key: 'replaceWith', label: 'Replace With', placeholder: 'e.g., -X', type: 'text', required: true },
    ],
  },

  // Formatting
  {
    key: 'pad_left',
    label: 'Pad Left',
    category: 'Formatting',
    args: [
      { key: 'length', label: 'Target Length', placeholder: 'e.g., 10', type: 'number', required: true },
      { key: 'char', label: 'Pad Character', placeholder: 'e.g., 0', type: 'text', required: true },
    ],
  },
  {
    key: 'pad_right',
    label: 'Pad Right',
    category: 'Formatting',
    args: [
      { key: 'length', label: 'Target Length', placeholder: 'e.g., 10', type: 'number', required: true },
      { key: 'char', label: 'Pad Character', placeholder: 'e.g., 0', type: 'text', required: true },
    ],
  },
  {
    key: 'date_reformat',
    label: 'Reformat Date',
    category: 'Formatting',
    args: [
      // Drop the `e.g., ` prefix on these two — the label already states
      // it's a format string, and the long placeholder truncated to
      // "e.g., MM/DD/" at typical row widths. Bare "MM/DD/YYYY" fits in
      // the same input box without losing meaning.
      { key: 'fromFormat', label: 'From Format', placeholder: 'MM/DD/YYYY', type: 'text', required: true },
      { key: 'toFormat', label: 'To Format', placeholder: 'DD/MM/YYYY', type: 'text', required: true },
    ],
  },
  {
    // Unconditionally prepends `text` to the value. Useful for namespacing
    // extracted ids (e.g. "12345" -> "ACC-12345").
    key: 'add_to_start',
    label: 'Add to Start',
    description: 'Args: text. Example: "12345" -> "ACC-12345" (text "ACC-")',
    category: 'Formatting',
    args: [
      { key: 'text', label: 'Text', placeholder: 'e.g., ACC-', type: 'text', required: true },
    ],
  },
  {
    // Unconditionally appends `text` to the value. Mirror of `add_to_start`.
    key: 'append_at_end',
    label: 'Append at End',
    description: 'Args: text. Example: "12345" -> "12345-X" (text "-X")',
    category: 'Formatting',
    args: [
      { key: 'text', label: 'Text', placeholder: 'e.g., -X', type: 'text', required: true },
    ],
  },

  // Extraction Refinement
  {
    key: 'substring',
    label: 'Substring',
    category: 'Extraction Refinement',
    args: [
      { key: 'start', label: 'Start Index', placeholder: 'e.g., 0', type: 'number', required: true },
      { key: 'end', label: 'End Index', placeholder: 'Optional', type: 'number', required: false },
    ],
  },
  {
    key: 'split_and_pick',
    label: 'Split & Pick',
    category: 'Extraction Refinement',
    args: [
      { key: 'delimiter', label: 'Delimiter', placeholder: 'e.g., /', type: 'text', required: true },
      { key: 'index', label: 'Pick Index (0-based)', placeholder: 'e.g., 0', type: 'number', required: true },
    ],
  },
  {
    // Key matches the backend LOV entry (`max_char_limit`) — the dropdown is
    // populated from the backend list, so the local `args` are looked up by
    // this exact key. Don't rename without coordinating with backend.
    key: 'max_char_limit',
    label: 'Maximum Characters',
    category: 'Extraction Refinement',
    args: [
      { key: 'length', label: 'Max Characters', placeholder: 'e.g., 15', type: 'number', required: true },
      { key: 'breakAtSpecial', label: 'Break at special character', placeholder: '', type: 'checkbox', required: false },
    ],
  },
];

export const TRANSFORMATION_METHOD_MAP = new Map(
  TRANSFORMATION_METHODS.map((m) => [m.key, m]),
);
