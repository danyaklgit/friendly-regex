export interface TourStepDef {
  element?: string;
  title: string;
  intro: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  tab?: number; // 0 = Backlog, 1 = Transactions, 2 = Tags Hierarchy
  interactive?: boolean; // user must click the element to advance
  advanceOnVisible?: string; // CSS selector — hide Next; auto-advance when element loses 'invisible' class
  advanceOnAppear?: string; // CSS selector — hide Next (with pulse); auto-advance when element is added to DOM
  // Simulation: programmatically clicks the target element after a 1 s delay, then auto-advances 800 ms later
  simulateClick?: string;
  // Simulation: types a value into an input character by character, then auto-advances
  simulateType?: {
    target: string;   // CSS selector (must be an <input> or <textarea>)
    value: string;    // text to type
    preDelay?: number;  // ms before starting (default 900)
    charDelay?: number; // ms between chars (default 45)
    postDelay?: number; // ms after last char before auto-advance (default 700)
  };
  // Simulation: ordered list of click/type actions fired at absolute ms offsets, then auto-advances
  simulateSequence?: Array<{
    type: 'click' | 'type';
    target: string;
    value?: string; // for 'type'
    at: number;     // ms from step render when this action fires
  }>;
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
      {
        tab: 1,
        element: '[data-tour="open-rule-builder"]',
        title: 'Before We Start',
        intro:
          'This tour shows you how to create a <b>Tag</b> — a label that gets automatically applied to matching transactions. You\'ll need a bank checked out first. If you haven\'t done that yet, go to the <b>Backlog</b> tab and click <b>Checkout</b> on a row before continuing.',
      },
      {
        element: '[data-tour="ruleset-logic-info"]',
        title: 'How Conditions Work',
        intro:
          'A rule can have <b>multiple conditions</b>. All conditions inside one group must match — like saying <i>"A and B"</i>. If you add more than one group, a transaction only needs to match <b>one of them</b> — like saying <i>"A, or instead B"</i>.',
      },
      {
        element: '[data-tour="add-rule-group"]',
        title: 'Add a Condition Group',
        intro:
          'Click <b>Add Rule Set</b> to create your first group of conditions. The tour will do this for you now so you can see what happens.',
        simulateClick: '[data-tour="add-rule-group"]',
      },
      {
        element: '[data-tour="condition-source-field"]',
        title: 'Pick a Field',
        intro:
          'Choose which part of the transaction to look at — for example, the <b>Description</b> (what the payment says), the <b>Amount</b>, or the <b>Reference number</b>.',
      },
      {
        element: '[data-tour="condition-operation"]',
        title: 'Pick How to Match',
        intro:
          'Choose <b>how to compare</b> the value. <i>Contains</i> finds it anywhere in the text. <i>Begins with</i> matches only the start. <i>Equals</i> requires an exact match.',
      },
      {
        element: '[data-tour="condition-value"]',
        title: 'Enter a Value',
        intro:
          'Type the <b>word or number</b> to look for. For example, typing <b>SALARY</b> with <i>Contains</i> will match any transaction mentioning salary. The tour will type an example for you.',
        simulateType: { target: '[data-tour="condition-value"]', value: 'SALARY' },
      },
      {
        element: '[data-tour="create-tag-button"]',
        title: 'Save the Tag',
        intro:
          'Once you\'ve set a value, this button lights up. Click it to <b>save the tag</b>. It will automatically be applied to all transactions that match your conditions.',
      },
      {
        element: '[data-tour="rule-builder-panel"]',
        title: 'Tag Saved',
        intro:
          'Your tag is now saved. To <b>edit it later</b>, find it in the tag list and click the <b>pencil icon</b> — the rule builder reopens with everything already filled in.',
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
        title: 'The Backlog',
        intro:
          'This is the <b>Backlog</b> — it shows every bank account being worked on. Each row tells you how many transactions have been tagged so far and who is currently working on it.',
      },
      {
        element: '[data-tour="checkout-button"]',
        title: 'Checkout a Bank',
        intro:
          'To start working on a bank, click <b>Checkout</b>. This <b>reserves it for you</b> — no one else can make changes while you have it. Click Checkout now to continue the tour.',
        advanceOnAppear: '[data-tour="checkout-active-indicator"]',
      },
      {
        tab: 1,
        element: '[data-tour="checkout-actions"]',
        title: 'You\'re Checked Out',
        intro:
          'You\'re now checked out. The header shows which bank you\'re working on. When you\'re done, click <b>Release</b> to save your work and let others use it — or <b>Check In</b> to save but keep it reserved for you.',
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
        title: 'The Filter Bar',
        intro:
          'The <b>filter bar</b> is the row of buttons above the transaction list. Each button lets you narrow down the list — click one to see the available options for that detail.',
      },
      {
        element: '[data-tour="filters-bar"]',
        title: 'Selecting a Filter Value',
        intro:
          'Tick one or more values and the transaction list updates right away to show only matching rows. The tour will open a filter and pick a value to demonstrate.',
        simulateSequence: [
          { type: 'click', target: '[data-tour="filters-bar"] button[data-filter-label*="Tag" i]', at: 900 },
          {
            type: 'click',
            // Handles both portal-rendered (fixed, ListEqDropdown) and absolute-rendered (StringFromListDropdown) items
            target: '[data-tour="filters-bar"] .absolute .p-2 label:first-child, .fixed.z-50.min-w-40 .p-2 label:first-child',
            at: 1800,
          },
        ],
      },
      {
        element: '[data-tour="clear-filters"]',
        title: 'Clear All Filters',
        intro: 'The <b>Clear filters</b> button appears whenever any filter is active. Click it to instantly remove all filters and see the full transaction list again.',
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
          'Some filters show a simple list of options, like <b>Side</b> (Debit or Credit) or <b>Bank name</b>. Tick one or several boxes — the table updates immediately. The tour will open one to show you.',
        simulateClick: '[data-tour="filters-bar"] button[data-filter-label*="Tag" i]',
      },
      {
        element: '[data-tour="filters-bar"]',
        title: 'Filters With Search',
        intro:
          'When a filter has many options, there\'s a <b>search box</b> at the top of the list. Type a few letters to narrow it down, then tick the values you want.',
      },
      {
        element: '[data-tour="transactions-header"]',
        title: 'On/Off Switches',
        intro:
          'Some options are simple <b>on/off switches</b>. For example, turning on <i>Show only untagged</i> instantly hides all already-tagged transactions so you can focus on what\'s left to review.',
      },
      {
        element: '[data-tour="transactions-header"]',
        title: 'Using Multiple Filters Together',
        intro:
          'You can have <b>several filters active at the same time</b>. The table shows only transactions that match <i>all</i> of them — for example, only <i>credit</i> transactions that are also <i>untagged</i>.',
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
          'This is the <b>Tags Hierarchy</b> — it shows all your tags organized in groups. You can browse the full list here or use the search box to quickly jump to a specific one.',
      },
      {
        element: '[data-tour="tags-search"]',
        title: 'Search for a Tag',
        intro:
          'Use the <b>search box</b> to find any tag by name or code. The list filters as you type. The tour will type a search to show you how it works.',
        simulateType: { target: '[data-tour="tags-search"]', value: 'ACC', postDelay: 900 },
      },
      {
        element: '[data-tour="tags-tree"]',
        title: 'The Tag Tree',
        intro:
          'Tags are organized in a <b>tree</b>. Items marked <b>(G)</b> are groups — click to expand them. Items marked <b>(T)</b> are individual tags. Colors show their status: new, recently changed, or archived.',
      },
      {
        element: '[data-tour="new-tag-button"]',
        title: 'Creating a New Tag',
        intro:
          'Click <b>+ New Tag</b> to open the creation form, where you can name it, give it a code, and place it inside the right group. The tour will open it now.',
        simulateClick: '[data-tour="new-tag-button"]',
      },
      {
        element: '[data-tour="tag-row-actions"]',
        title: 'Editing or Removing Tags',
        intro:
          'To change a tag, hover over its row — action buttons appear on the right. Use the <b>pencil</b> to edit, the <b>yellow button</b> to archive, the <b>green button</b> to reactivate, or the <b>red button</b> to delete.',
      },
      {
        element: '[data-tour="sync-tags-button"]',
        title: 'Sync Tags',
        intro:
          'When you\'ve finished making changes, click <b>Sync Tags</b>. You\'ll see a summary of everything that changed — new tags, edits, removals — before you confirm and send them to the server.',
        position: 'bottom',
      },
    ],
  },
};
