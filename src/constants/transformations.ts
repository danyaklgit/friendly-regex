export interface TransformationArgDef {
  key: string;
  label: string;
  placeholder: string;
  type: 'text' | 'number';
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

  // Find/Replace
  {
    key: 'replace',
    label: 'Replace',
    category: 'Find/Replace',
    args: [
      { key: 'find', label: 'Find', placeholder: 'Text to find', type: 'text', required: true },
      { key: 'replaceWith', label: 'Replace With', placeholder: 'Replace with', type: 'text', required: true },
    ],
  },
  {
    key: 'regex_replace',
    label: 'Regex Replace',
    category: 'Find/Replace',
    args: [
      { key: 'pattern', label: 'Pattern', placeholder: 'Regex pattern', type: 'text', required: true },
      { key: 'replaceWith', label: 'Replace With', placeholder: 'Replace with', type: 'text', required: true },
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
      { key: 'fromFormat', label: 'From Format', placeholder: 'e.g., MM/DD/YYYY', type: 'text', required: true },
      { key: 'toFormat', label: 'To Format', placeholder: 'e.g., DD/MM/YYYY', type: 'text', required: true },
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
];

export const TRANSFORMATION_METHOD_MAP = new Map(
  TRANSFORMATION_METHODS.map((m) => [m.key, m]),
);
