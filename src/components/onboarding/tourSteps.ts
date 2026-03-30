export interface TourStepDef {
  element?: string;
  title: string;
  intro: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  tab?: number; // 0 = Backlog, 1 = Transactions, 2 = Tags Hierarchy
  interactive?: boolean; // user must click the element to advance
  advanceOnVisible?: string; // CSS selector — hide Next; auto-advance when element loses 'invisible' class
  advanceOnAppear?: string; // CSS selector — hide Next (with pulse); auto-advance when element is added to DOM
}

export interface TourDef {
  label: string;
  icon: string;
  description: string;
  steps: TourStepDef[];
}

export const tours: Record<string, TourDef> = {
  createRule: {
    label: 'Create a Rule & Tag',
    icon: '⚙️',
    description: 'Build conditions and create a tag definition.',
    steps: [
      // — Rule Builder —
      {
        tab: 1,
        element: '[data-tour="open-rule-builder"]',
        title: 'Before We Start',
        intro:
          'This tour covers the <b>Transactions</b> page. The <b>Create a Rule</b> button is only active when you have an active checkout — make sure you\'ve checked out a bank/side first. Once the rule builder is open, press <b>Next</b> to continue.',
      },
      {
        element: '[data-tour="ruleset-logic-info"]',
        title: 'AND / OR Logic',
        intro:
          'Conditions <i>within</i> a Rule Set use <b>AND</b> logic — all must match. Multiple Rule Sets use <b>OR</b> logic — any one set can match.',
      },
      {
        element: '[data-tour="add-rule-group"]',
        title: 'Add Rule Set',
        intro:
          'Click <b>Add Rule Set</b> to create your first group of matching conditions.',
      },
      // — Condition Fields —
      {
        element: '[data-tour="condition-source-field"]',
        title: 'Source Field',
        intro:
          'Choose which transaction field to match against — such as <b>Description</b>, <b>Amount</b>, or <b>Reference</b>.',
      },
      {
        element: '[data-tour="condition-operation"]',
        title: 'Operation',
        intro:
          'Choose <i>how</i> to match: <b>begins with</b>, <b>contains</b>, <b>regex</b>, <b>equals</b>, and more.',
      },
      {
        element: '[data-tour="condition-value"]',
        title: 'Value',
        intro:
          'Enter the value to match against.',
      },
      // — Create the rule/tag —
      {
        element: '[data-tour="create-tag-button"]',
        title: 'Create Rule with Current Settings',
        intro:
          'Once a condition value is set, this button becomes active. Click it to <b>create the rule and tag definition</b>.',
      },
      // — Tag created / edit —
      {
        element: '[data-tour="rule-builder-panel"]',
        title: 'Your Tag Is Created',
        intro:
          'Your rule and tag definition have been saved. To <b>edit</b> an existing tag later, find it in the tag list and click the <b>pencil icon</b> — the builder reopens with its rules pre-filled.',
        position: 'bottom',
      },
    ],
  },

  checkinCheckout: {
    label: 'Checkout',
    icon: '🔐',
    description: 'Lock a bank & side for editing, then save and release.',
    steps: [
      {
        tab: 0,
        element: '[data-tour="backlog-view"]',
        title: 'Backlog View',
        intro:
          'The Backlog lists all banks and sides with tagging progress. Each row shows the operator and completion rate.',
      },
      {
        element: '[data-tour="checkout-button"]',
        title: 'Checkout a Bank',
        intro:
          'Click <b>Checkout</b> to lock this bank/side for editing — only one operator can work on it at a time.',
        advanceOnAppear: '[data-tour="checkout-active-indicator"]',
      },
      {
        tab: 1,
        element: '[data-tour="checkout-actions"]',
        title: 'Active Checkout',
        intro:
          'When checked out, the header shows your active bank and side. Click <b>Release</b> to save and free the bank/side for others, or <b>Check In</b> to save and keep it locked to you.',
      },
    ],
  },

  filterValues: {
    label: 'Filter by Values',
    icon: '🔍',
    description: 'Narrow down transactions from the table or filter bar.',
    steps: [
      {
        tab: 1,
        element: '[data-tour="filters-bar"]',
        title: 'Filter Bar',
        intro:
          'The filter bar sits above the transaction table. Each chip represents a filterable column — click one to open its dropdown.',
      },
      {
        element: '[data-tour="filters-bar"]',
        title: 'Applying Filters',
        intro:
          'Select one or more values in the dropdown. The table updates live. Active filters show a highlighted border.',
        advanceOnVisible: '[data-tour="clear-filters"]',
      },
      {
        element: '[data-tour="clear-filters"]',
        title: 'Clear All Filters',
        intro: 'Click <b>Clear filters</b> to reset every active filter at once.',
      },
    ],
  },

  filterTypes: {
    label: 'Filter Types & Use Cases',
    icon: '📊',
    description: 'List filters, search filters, date ranges, and toggles.',
    steps: [
      {
        tab: 1,
        element: '[data-tour="filters-bar"]',
        title: 'List Filters',
        intro:
          '<b>List filters</b> (e.g. Side, Bank) show a checkbox dropdown. Select one or many values — the table updates immediately.',
      },
      {
        element: '[data-tour="filters-bar"]',
        title: 'Searchable Filters',
        intro:
          'Some filters include a search input at the top of the dropdown. Type to narrow the list, then tick the values you want.',
      },
      {
        element: '[data-tour="transactions-header"]',
        title: 'Toggle Filters',
        intro:
          'Toggle switches like <b>Show only untagged</b> or <b>Show only multi-tagged</b> let you instantly isolate specific transaction categories.',
      },
      {
        element: '[data-tour="transactions-header"]',
        title: 'Combining Filters',
        intro:
          'All active filters combine with AND logic. For example: Side = CR <i>and</i> Show only untagged will show only untagged credit transactions.',
      },
    ],
  },

  tagsHierarchy: {
    label: 'Tags Hierarchy',
    icon: '🌲',
    description: 'Navigate and manage the tag tree, groups, and sync.',
    steps: [
      {
        tab: 2,
        element: '[data-tour="tags-hierarchy-header"]',
        title: 'Tags Hierarchy',
        intro:
          'The Tags Hierarchy tab shows all tags organized in groups. Search to quickly find any tag by code or name.',
      },
      {
        element: '[data-tour="tags-search"]',
        title: 'Search Tags',
        intro:
          'Type a tag code or name to filter the tree instantly. Matching nodes expand automatically.',
      },
      {
        element: '[data-tour="tags-tree"]',
        title: 'Tag Tree',
        intro:
          'Tags are arranged in a collapsible tree. <b>Groups (G)</b> are expandable parents; <b>Tags (T)</b> are the leaves. Color coding shows new, modified, or archived items.',
      },
      {
        element: '[data-tour="new-tag-button"]',
        title: 'Create a Tag',
        intro:
          'Click <b>+ New Tag</b> to open the create form. You can create a Group or a Tag, set its code, name, parent, and group memberships.',
      },
      {
        element: '[data-tour="tag-row-actions"]',
        title: 'Edit / Archive Tags',
        intro:
          'Each row has action buttons on the far right: <b>Edit</b> (pencil icon), <b>Archive</b> (yellow), <b>Activate</b> (green), or <b>Delete</b> (red).',
      },
      {
        element: '[data-tour="sync-tags-button"]',
        title: 'Sync Tags',
        intro:
          'After making local changes, click <b>Sync Tags</b> to review a diff of added/modified/removed tags and push them to the server.',
        position: 'bottom',
      },
    ],
  },
};
