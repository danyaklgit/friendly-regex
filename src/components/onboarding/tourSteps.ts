export interface TourStepDef {
  element?: string;
  title: string;
  intro: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  tab?: number; // 0 = Backlog, 1 = Transactions, 2 = Tags Hierarchy
  interactive?: boolean; // user must click the element to advance
  advanceOnVisible?: string; // CSS selector — hide Next; auto-advance when element loses 'invisible' class
  advanceOnAppear?: string; // CSS selector — hide Next (with pulse); auto-advance when element is added to DOM
  // When true: overlay becomes transparent so the wizard modal stays visible and interactive
  wizardStep?: boolean;
  // Which page of the TagWizardModal this step corresponds to (1–4); used to sync backward navigation
  wizardPage?: number;
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
  // Scroll the page to the top before applyStepState runs (useful before expand simulations)
  scrollToTopFirst?: boolean;
  // Simulation: ordered list of click/type/select actions fired at absolute ms offsets, then auto-advances
  simulateSequence?: Array<{
    type: 'click' | 'type' | 'select';
    target: string;
    value?: string; // for 'type'/'select'; 'first' picks the first non-empty <option>
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
  gettingStarted: {
    label: 'Getting Started',
    icon: '🚀',
    description: 'Checkout, explore filters, and create your first tag — the full workflow.',
    steps: [
      // ── CHECKOUT ──────────────────────────────────────────────────────────
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
        title: "You're Checked Out",
        intro:
          "You're now checked out. The header shows which bank you're working on. When you're done, click <b>Release</b> to save your work and let others use it — or <b>Check In</b> to save but keep it reserved for you.",
      },
      // ── FILTERS ───────────────────────────────────────────────────────────
      {
        element: '[data-tour="filters-bar"]',
        title: 'The Filter Bar',
        intro:
          'The <b>filter bar</b> is the row of buttons above the transaction list. Each button lets you narrow down the list — click one to see the available options for that detail.',
      },
      {
        element: '[data-tour="filters-bar"]',
        title: 'Selecting a Filter Value',
        intro:
          'Tick one or more values and the transaction list updates right away to show only matching rows. Click <b>Next</b> and the tour will open the Tags filter and pick a value to show you.',
      },
      {
        element: '[data-tour="filters-bar"]',
        title: 'Watch: Picking a Value',
        intro:
          'The tour is opening the <b>Tags</b> filter and selecting a value — notice how the transaction list updates instantly.',
        simulateSequence: [
          { type: 'click', target: '[data-tour="filters-bar"] button[data-filter-label*="Tag" i]', at: 900 },
          {
            type: 'click',
            target: '[data-tour="filters-bar"] .absolute label',
            at: 1800,
          },
        ],
      },
      {
        element: '[data-tour="filters-bar"]',
        title: 'Filters With Search',
        intro:
          "Some filters have a <b>search box</b> at the top. Type a few letters to narrow down the list, then tick the values you want. Click <b>Next</b> and the tour will demonstrate.",
      },
      {
        element: '[data-tour="filters-bar"]',
        title: 'Watch: Searching a Filter',
        intro:
          'The tour is opening the <b>Tags</b> filter, typing a search term, and selecting a result — notice how the list narrows as you type.',
        simulateSequence: [
          { type: 'click', target: '[data-tour="filters-bar"] button[data-filter-label*="Tag" i]', at: 900 },
          { type: 'type', target: '[data-tour="filters-bar"] .absolute input[type="text"]', value: 'Sal', at: 1600 },
          {
            type: 'click',
            target: '[data-tour="filters-bar"] .absolute label',
            at: 2500,
          },
        ],
      },
      {
        element: '[data-tour="clear-filters"]',
        title: 'Clear All Filters',
        intro:
          'The <b>Clear filters</b> button appears whenever any filter is active. Click it to instantly remove all filters and see the full transaction list again. Click <b>Next</b> and the tour will clear them for you.',
      },
      {
        title: 'Clearing the Filters',
        intro:
          'The tour is clicking <b>Clear filters</b> now — the transaction list is back to showing everything.',
        simulateClick: '[data-tour="clear-filters"]',
      },
      {
        element: '[data-tour="transactions-header"]',
        title: 'On/Off Switches',
        intro:
          'Some options are simple <b>on/off switches</b>. <i>Show Attributes</i> reveals extra columns extracted from matching transactions. <i>Show only untagged</i> hides already-tagged rows so you can focus on what\'s left to review. Click <b>Next</b> and the tour will toggle <i>Show Attributes</i> on and off for you.',
      },
      {
        element: '[data-tour="transactions-header"]',
        title: 'Watch: Toggling Show Attributes',
        intro:
          'The tour is toggling <b>Show Attributes</b> — notice the extra attribute columns appearing and disappearing in the table.',
        simulateSequence: [
          { type: 'click', target: '[data-tour="show-attributes-toggle"] button', at: 700 },
          { type: 'click', target: '[data-tour="show-attributes-toggle"] button', at: 2400 },
        ],
      },
      {
        element: '[data-tour="transactions-header"]',
        title: 'Using Multiple Filters Together',
        intro:
          'You can have <b>several filters active at the same time</b>. The table shows only transactions that match <i>all</i> of them — for example, only <i>credit</i> transactions that are also <i>untagged</i>.',
      },
      // ── TRANSITION: checkout → rule creation ──────────────────────────────
      {
        element: '[data-tour="open-rule-builder"]',
        title: 'Rule Builder Now Available',
        intro:
          'Notice this button is <b>active</b> — that\'s because you checked out earlier. Without a checkout it stays <b>disabled</b> and you can\'t create or edit any rules. Click <b>Next</b> and the tour will open it for you.',
      },
      {
        title: 'Opening the Rule Builder',
        intro:
          'The tour will click <b>Create a Rule</b> now to open the rule builder. The next steps will walk you through setting up your first tag.',
        simulateClick: '[data-tour="open-rule-builder"]',
      },
      // ── CREATE A RULE ─────────────────────────────────────────────────────
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
          'Choose which part of the transaction to look at — for example, the <b>Description</b> (what the payment says), the <b>Amount</b>, or the <b>Reference number</b>. The tour will pick one for you.',
        simulateSequence: [{ type: 'select', target: '[data-tour="condition-source-field"]', value: 'Description 1', at: 900 }],
      },
      {
        element: '[data-tour="condition-operation"]',
        title: 'Pick How to Match',
        intro:
          'Choose <b>how to compare</b> the value. <i>Contains</i> finds it anywhere in the text. <i>Starts with</i> matches only the start. <i>Equals</i> requires an exact match. The tour will select <i>Contains</i> as an example.',
        simulateSequence: [{ type: 'select', target: '[data-tour="condition-operation"]', value: 'Contains', at: 900 }],
      },
      {
        element: '[data-tour="condition-value"]',
        title: 'Enter a Value',
        intro:
          'Type the <b>word or number</b> to look for. For example, typing <b>REF</b> with <i>Contains</i> will match any transaction whose description contains "REF". The tour will type an example for you.',
        simulateType: { target: '[data-tour="condition-value"] input', value: 'REF' },
      },
      {
        element: '[data-tour="condition-save-button"]',
        title: 'Confirm the Condition',
        intro:
          'Once you\'ve filled in all the fields, click <b>Save</b> to confirm this condition and collapse the editor. Click <b>Next</b> and the tour will do it for you.',
      },
      {
        title: 'Confirming the Condition',
        intro:
          'The tour is clicking <b>Save</b> now to confirm the condition.',
        simulateClick: '[data-tour="condition-save-button"]',
      },
      {
        element: '[data-tour="builder-transaction-type"]',
        position: 'left',
        title: 'Transaction Type',
        intro:
          'This dropdown links your rule to a specific <b>Transaction Type</b>. It is already set to the type from your checkout — the tour will open the dropdown and re-select that same option so you can see how it works.',
        simulateSequence: [
          { type: 'click', target: '[data-tour="builder-transaction-type"] button[type="button"]', at: 900 },
          { type: 'click', target: '[data-tour="builder-transaction-type"] div.absolute button.text-primary', at: 1700 },
        ],
      },
      {
        element: '[data-tour="create-tag-button"]',
        title: 'Save the Tag',
        intro:
          "Once you've confirmed your conditions, this button lights up. Click it to <b>save the tag</b> — it will automatically be applied to all transactions that match your conditions. Click <b>Next</b> and the tour will do it for you.",
      },
      {
        title: 'Creating the Tag',
        intro:
          'The tour is clicking <b>Create Rule with current settings</b> now. A form will open to complete the new tag.',
        simulateClick: '[data-tour="create-tag-button"]',
      },
      // ── WIZARD MODAL ──────────────────────────────────────────────────────────
      {
        wizardStep: true,
        wizardPage: 1,
        title: 'The Create Tag Form',
        intro:
          'A form is now open to complete your new tag. It has <b>4 steps</b> — Basic Info, Rules, Attributes, and Review. The tour will guide you through each one.',
      },
      {
        wizardStep: true,
        wizardPage: 1,
        element: '[data-tour="wizard-tag-picker"]',
        title: 'Step 1 — Pick a Tag',
        intro:
          'Search for the <b>tag code</b> to assign this rule to. Type a few letters and the list narrows — then click the match. The tour will search and select one for you.',
        simulateSequence: [
          { type: 'type', target: '[data-tour="wizard-tag-picker"] input[type="text"]', value: 'A', at: 900 },
          { type: 'click', target: '[data-tour="wizard-tag-picker"] .max-h-48 button', at: 1800 },
        ],
      },
      {
        wizardStep: true,
        wizardPage: 1,
        element: '[data-tour="wizard-basic-info-fields"]',
        title: 'Step 1 — Other Settings',
        intro:
          'The <b>Side</b>, <b>Bank</b>, and <b>Transaction Type</b> are pre-filled from your checkout. You can adjust <b>Status</b> and <b>Certainty Level</b> if needed. Click <b>Next</b> and the tour will move to the Rules step.',
      },
      {
        wizardStep: true,
        wizardPage: 1,
        title: 'Moving to Rules',
        intro: 'The tour is clicking <b>Next</b> to advance to the Rules step.',
        simulateSequence: [{ type: 'click', target: '[data-tour="wizard-next-button"]', at: 200 }],
      },
      {
        wizardStep: true,
        wizardPage: 2,
        element: '[data-tour="wizard-step-2-content"]',
        title: 'Step 2 — Your Rules',
        intro:
          'Your rule conditions are shown here. You can review or edit them. Click <b>Next</b> and the tour will continue.',
      },
      {
        wizardStep: true,
        wizardPage: 2,
        title: 'Moving to Attributes',
        intro: 'The tour is clicking <b>Next</b> to advance to the Attributes step.',
        simulateSequence: [{ type: 'click', target: '[data-tour="wizard-next-button"]', at: 200 }],
      },
      {
        wizardStep: true,
        wizardPage: 3,
        title: 'Step 3 — Attributes (Optional)',
        intro:
          'Attributes let you <b>extract values</b> from matching transactions. This step is optional — most tags don\'t need them. Click <b>Next</b> to continue.',
      },
      {
        wizardStep: true,
        wizardPage: 3,
        title: 'Moving to Review',
        intro: 'The tour is clicking <b>Next</b> to advance to the Review step.',
        simulateSequence: [{ type: 'click', target: '[data-tour="wizard-next-button"]', at: 200 }],
      },
      {
        wizardStep: true,
        wizardPage: 4,
        element: '[data-tour="wizard-review"]',
        title: 'Step 4 — Review',
        intro:
          "Check that everything looks right — tag name, rules, and settings are all shown here. When you're satisfied, click <b>Next</b> and the tour will save your tag.",
      },
      {
        wizardStep: true,
        wizardPage: 4,
        title: 'Saving Your Tag',
        intro: 'The tour is clicking <b>Create Tag</b> to save your new tag.',
        simulateSequence: [{ type: 'click', target: '[data-tour="wizard-create-button"]', at: 200 }],
      },
      {
        tab: 2,
        title: 'Tag Saved',
        intro:
          'Your tag is now saved and visible in the <b>Tags Hierarchy</b>. This is where all tags are organized in groups — you can browse, search, and manage them. There\'s also a dedicated <b>Tags Hierarchy</b> guide available from the help menu that walks you through everything you can do here.',
      },
    ],
  },

  tagsHierarchy: {
    label: 'Tags Hierarchy',
    icon: '🌲',
    description: 'Browse, search, create, edit, and sync your tag tree.',
    steps: [
      // ── OVERVIEW ─────────────────────────────────────────────────────────
      {
        tab: 2,
        title: 'Tags Hierarchy',
        intro:
          'This is the <b>Tags Hierarchy</b> — it shows all your tags organized into groups. Here you can browse, search, create, edit, archive, and delete tags.',
      },
      // ── THE TREE ─────────────────────────────────────────────────────────
      {
        title: 'The Tag Tree',
        intro:
          'Tags are organized in a <b>tree</b> — each row is either a <b>group</b> (click to expand and see the tags inside) or an individual <b>tag</b>. Rows highlighted in <b>blue</b> are newly added; <b>amber</b> rows have been recently edited.',
      },
      // ── EXPAND A GROUP ────────────────────────────────────────────────────
      {
        title: 'Expanding a Group',
        intro:
          'Click any group row to expand or collapse it and see the tags inside. The tour will expand the first group for you.',
        scrollToTopFirst: true,
        simulateSequence: [
          { type: 'click', target: '[data-tour="tags-tree"] > div:first-child > button', at: 600 },
        ],
      },
      // ── SEARCH ───────────────────────────────────────────────────────────
      {
        element: '[data-tour="tags-search"]',
        title: 'Search for a Tag',
        intro:
          'Use the <b>search box</b> to find any tag by name or code. The list filters as you type — matching text is highlighted in yellow. The tour will type a search to show you.',
        simulateType: { target: '[data-tour="tags-search"]', value: 'ACC', postDelay: 900 },
      },
      {
        title: 'Clearing the Search',
        intro: 'The tour is clearing the search box and re-expanding the group so you can see the full tree again.',
        scrollToTopFirst: true,
        simulateSequence: [
          { type: 'type', target: '[data-tour="tags-search"]', value: '', at: 300 },
          { type: 'click', target: '[data-tour="tags-tree"] > div:first-child > button', at: 900 },
        ],
      },
      // ── ROW ACTIONS ───────────────────────────────────────────────────────
      {
        element: '[data-tour="tag-row-actions"]',
        title: 'Row Actions',
        intro:
          'Each row has <b>action buttons</b> on the right: a <b>pencil</b> to edit, a <b>yellow button</b> to archive, a <b>green button</b> to reactivate, and a <b>red button</b> to delete. The tour will walk you through each one.',
      },
      {
        element: '[data-tour="tag-row-actions"]',
        title: 'Edit a Tag',
        intro:
          'The <b>pencil icon</b> opens the edit form with the current values pre-filled — you can update the name, description, or any other setting. Click <b>Next</b> and the tour will open the edit form for you.',
      },
      {
        title: 'Opening the Edit Form…',
        intro:
          'The tour is clicking the <b>pencil</b> now to open the edit form.',
        simulateClick: '[data-tour="tag-row-actions"] button:first-child',
      },
      {
        wizardStep: true,
        element: '[data-tour="tag-edit-form"]',
        title: 'The Edit Form',
        intro:
          'The edit form opens with all current values pre-filled. You can change the <b>Name</b>, <b>Description</b>, or other fields, then click <b>Save</b> to apply. Click <b>Next</b> and the tour will close this form without saving.',
      },
      {
        wizardStep: true,
        title: 'Closing the Edit Form…',
        intro: 'The tour is clicking <b>Cancel</b> to close the form without saving.',
        simulateSequence: [{ type: 'click', target: '[data-tour="tag-edit-cancel"]', at: 200 }],
      },
      // ── NEW TAG ───────────────────────────────────────────────────────────
      {
        element: '[data-tour="new-tag-button"]',
        title: 'Create a New Tag',
        intro:
          'Click <b>+ New Tag</b> to open the creation form. Click <b>Next</b> and the tour will open it for you so you can explore each field.',
      },
      {
        title: 'Opening the New Tag Form…',
        intro: 'The tour is clicking <b>+ New Tag</b> now.',
        simulateClick: '[data-tour="new-tag-button"]',
      },
      // ── TAG EDIT MODAL ────────────────────────────────────────────────────
      {
        wizardStep: true,
        title: 'The New Tag Form',
        intro:
          'A form is now open for creating a new tag. Choose the <b>Type</b> first — <i>Tag (T)</i> for a regular tag, or <i>Group (G)</i> to create a category that holds multiple tags. The tour will now walk through every field.',
      },
      {
        wizardStep: true,
        element: '[data-tour="tag-edit-code"]',
        title: 'Tag Code',
        intro:
          'The <b>Tag Code</b> is the unique identifier — short uppercase letters, no spaces (e.g. <b>PAYMENTCR</b>). The tour is typing an example code now.',
        simulateType: { target: '[data-tour="tag-edit-code"] input', value: 'TOURTAG' },
      },
      {
        wizardStep: true,
        element: '[data-tour="tag-edit-name"]',
        title: 'Display Name',
        intro:
          'The <b>Name</b> is the human-readable label shown in the UI and reports. It can be longer and more descriptive than the code. The tour is filling it in now.',
        simulateType: { target: '[data-tour="tag-edit-name"] input', value: 'Tour Example' },
      },
      {
        wizardStep: true,
        element: '[data-tour="tag-edit-description"]',
        title: 'Description',
        intro:
          'The <b>Description</b> is an optional note explaining what this tag represents. The tour is typing one in for you.',
        simulateType: { target: '[data-tour="tag-edit-description"] input', value: 'A demo tag created during the onboarding tour.' },
      },
      {
        wizardStep: true,
        element: '[data-tour="tag-edit-parent"]',
        title: 'Parent Tag',
        intro:
          'The <b>Parent Tag</b> lets you nest this tag under another — useful for subtypes or variations. The tour will type to search, then select the first result.',
        simulateSequence: [
          { type: 'type', target: '[data-tour="tag-edit-parent"] input', value: 'T', at: 900 },
          { type: 'click', target: '[data-tour="tag-edit-parent"] .absolute button:nth-child(2)', at: 2100 },
        ],
      },
      {
        wizardStep: true,
        element: '[data-tour="tag-edit-groups"]',
        title: 'Groups',
        intro:
          '<b>Groups</b> organize tags into shared categories. The tour will first click a group directly to select it, then type in the search box to filter, and select another group from the results.',
        simulateSequence: [
          { type: 'click', target: '[data-tour="tag-edit-groups-list"] button:first-child', at: 700 },
          { type: 'type', target: '[data-tour="tag-edit-groups"] input[type="text"]', value: 'A', at: 1800 },
          { type: 'click', target: '[data-tour="tag-edit-groups-list"] button:first-child', at: 2800 },
        ],
      },
      {
        wizardStep: true,
        element: '[data-tour="tag-edit-create"]',
        position: 'top',
        title: 'Creating the Tag',
        intro:
          'All fields are filled in — the <b>Create</b> button is now active. Click <b>Next</b> when you\'re ready and the tour will save the tag for you.',
      },
      {
        wizardStep: true,
        title: 'Saving the Tag…',
        intro:
          'The tour is clicking <b>Create</b> now to save the tag. It will appear in the hierarchy right away, marked as <i>unsynchronised</i> until you confirm the sync.',
        simulateClick: '[data-tour="tag-edit-create"]',
      },
      // ── SYNC TAGS ─────────────────────────────────────────────────────────
      {
        element: '[data-tour="sync-tags-button"]',
        position: 'bottom',
        title: 'Sync Tags',
        intro:
          'After making changes — creating, editing, or archiving tags — a <b>Sync Tags</b> button appears here at the top right. Click <b>Next</b> and the tour will open it for you.',
      },
      {
        title: 'Opening the Sync Review…',
        intro: 'The tour is clicking <b>Sync Tags</b> now to show you the review screen.',
        simulateClick: '[data-tour="sync-tags-button"]',
      },
      {
        wizardStep: true,
        title: 'The Sync Review',
        intro:
          'This is the <b>Sync Review</b> screen. It shows a summary of everything that changed: tags <b>added</b> in green, <b>modified</b> in yellow, and <b>removed</b> in red. Review the list, then click <b>Sync Tags</b> to push the changes to the server — or <b>Cancel</b> to go back without syncing.',
      },
      {
        wizardStep: true,
        title: 'Closing the Review…',
        intro: 'The tour is closing the review without syncing.',
        simulateClick: '[data-tour="sync-review-close"]',
      },
      // ── REFRESH ───────────────────────────────────────────────────────────
      {
        element: '[data-tour="tags-refresh-button"]',
        title: 'Refresh',
        intro:
          'The <b>Refresh</b> button reloads the tag list from the server. Use it whenever you want to pick up changes made by other users.',
      },
      // ── ARCHIVE & DELETE ──────────────────────────────────────────────────
      {
        element: '[data-tour="tag-group-archive-button"]',
        position: 'bottom',
        title: 'Archive a Tag',
        intro:
          'The <b>yellow archive button</b> marks a tag or group as <i>archived</i>. It stays in the system but is hidden from active use. You can bring it back at any time using the <b>green reactivate button</b> — nothing is permanently lost.',
      },
      {
        element: '[data-tour="tag-group-delete-button"]',
        position: 'bottom',
        title: 'Delete a Tag',
        intro:
          'The <b>red delete button</b> <i>permanently removes</i> a tag or group. A confirmation dialog appears first so you can\'t delete by accident — use this only when you\'re sure it is no longer needed.',
      },
    ],
  },

  backlog: {
    label: 'Backlog',
    icon: '📋',
    description: 'Learn every feature of the Backlog — the home for all bank accounts and their tag rules.',
    steps: [
      // ── OVERVIEW ─────────────────────────────────────────────────────────
      {
        tab: 0,
        element: '[data-tour="backlog-view"]',
        title: 'The Backlog',
        intro:
          'This is the <b>Backlog</b> — a table showing every bank account tracked by the system. Each row represents one bank + side combination (Debit or Credit) and tells you how many tag rules are defined and who is working on it.',
      },
      // ── TABLE COLUMNS ────────────────────────────────────────────────────
      {
        element: '[data-tour="backlog-table"]',
        title: 'Row Structure',
        intro:
          'Each row has: a <b>Bank</b> name, a <b>Side</b> badge (Debit or Credit), a <b>Rules</b> count showing how many tag rules exist, a <b>Statistics</b> bar with tagging progress, the <b>Operator</b> who currently has it checked out, a <b>Status</b> badge, and action buttons on the right.',
      },
      // ── STATISTICS ───────────────────────────────────────────────────────
      {
        element: '[data-tour="backlog-statistics"]',
        title: 'Statistics Column',
        intro:
          'The <b>Statistics</b> bar shows how well the transactions for this bank are tagged. The progress bar fills up as more transactions get matched. Coloured badges break it down further: <b>Fully</b> tagged, those with <b>Issues</b>, <b>Untagged</b>, <b>Multi</b>-tagged, and <b>Dead End</b> matches.',
        position: 'bottom',
      },
      // ── STATUS ───────────────────────────────────────────────────────────
      {
        element: '[data-tour="backlog-status"]',
        title: 'Status Badge',
        intro:
          'The <b>Status</b> column shows whether a row is <b>Active</b> (available to check out) or <b>In Progress</b> (currently checked out by someone). An <b>Operator</b> name appears in the next column when someone has it reserved.',
      },
      // ── TRANSACTIONS BUTTON ───────────────────────────────────────────────
      {
        element: '[data-tour="backlog-transactions-button"]',
        title: 'Transactions Button',
        intro:
          'The <b>Transactions</b> button takes you directly to the transaction list for that bank and side — filtered to show only that bank\'s data. Use it to quickly review what\'s in the system without checking out.',
        position: 'left',
      },
      // ── COMPARE BUTTON ───────────────────────────────────────────────────
      {
        element: '[data-tour="backlog-compare-button"]',
        title: 'Compare Button',
        intro:
          'The <b>Compare</b> button appears only when a row is <b>In Progress</b>. It opens a side-by-side view of the current (checked-out) version versus the last saved version — so you can see exactly what has changed before checking in. Rules added are shown in <b>green</b>, removed in <b>red</b>, and modified in <b>yellow</b>.',
      },
      // ── CHECKIN BUTTON ───────────────────────────────────────────────────
      {
        element: '[data-tour="backlog-checkin-button"]',
        title: 'Check In',
        intro:
          'The <b>Checkin</b> button saves all changes and releases the bank back to the pool so others can work on it. It only appears on rows <b>you</b> have checked out.',
        position: 'left',
      },
      // ── ROLLBACK BUTTON ──────────────────────────────────────────────────
      {
        element: '[data-tour="backlog-rollback-button"]',
        title: 'Rollback',
        intro:
          'The <b>Rollback</b> button discards all unsaved changes and reverts the bank back to the last checked-in version. <b>This cannot be undone</b> — a confirmation dialog appears before anything is deleted. It also only appears on rows you own.',
        position: 'left',
      },
      // ── IMPORT BUTTON ────────────────────────────────────────────────────
      {
        element: '[data-tour="backlog-import-button"]',
        title: 'Import',
        intro:
          'The <b>Import</b> button lets you load tag rule definitions from a <b>JSON file</b> that was previously exported. This is useful for copying rules between environments or restoring a backup.',
        position: 'bottom',
      },
      // ── EXPORT ALL BUTTON ────────────────────────────────────────────────
      {
        element: '[data-tour="backlog-export-all-button"]',
        title: 'Export All',
        intro:
          'The <b>Export All</b> button downloads <i>all</i> tag rule definitions across every bank as a single JSON file. Useful for backups or migrating rules between environments.',
        position: 'bottom',
      },
      // ── VIEW ALL TRANSACTIONS BUTTON ──────────────────────────────────────
      {
        element: '[data-tour="backlog-view-all-button"]',
        title: 'View All Transactions',
        intro:
          'The <b>View All Transactions</b> button switches to the Transactions tab with <i>no bank filter applied</i> — you see every transaction across all banks at once. Useful for a broad overview.',
        position: 'bottom',
      },
      // ── ROW EXPANSION ────────────────────────────────────────────────────
      {
        element: '[data-tour="expand-first-row"]',
        title: 'Expanding a Row',
        intro:
          'Click the <b>arrow</b> on the left to expand any row and see the <b>tag rules</b> defined for that bank and side. The tour will expand the first row now.',
        simulateClick: '[data-tour="expand-first-row"]',
      },
      // ── TAG RULE CARDS ────────────────────────────────────────────────────
      {
        element: '[data-tour="backlog-table"]',
        title: 'Tag Rule Cards',
        intro:
          'Each expanded row shows a list of <b>Tag Rule Cards</b> — one for every tag rule defined for that bank. Each card shows the tag name and its status badges. Click a card to expand it and see the full rule details.',
      },
      // ── EXPAND A CARD ─────────────────────────────────────────────────────
      {
        element: '[data-tour="tag-rule-card-toggle"]',
        title: 'Opening a Rule Card',
        intro:
          'Click any rule card to expand it and see the <b>matching conditions</b>, <b>attributes</b>, and <b>validity dates</b> for that rule. The tour will open the first one now.',
        simulateClick: '[data-tour="tag-rule-card-toggle"]',
      },
      // ── EDIT BUTTON ──────────────────────────────────────────────────────
      {
        element: '[data-tour="tag-rule-card-edit"]',
        title: 'Edit a Rule',
        intro:
          'The <b>Edit</b> button reopens the rule builder pre-filled with all the current settings for that tag — so you can adjust conditions, attributes, or other fields and save the changes. The tour will click it now.',
        position: 'top',
        simulateClick: '[data-tour="tag-rule-card-edit"]',
      },
      {
        wizardStep: true,
        title: 'The Edit Form',
        intro:
          'The rule builder opens with all existing settings pre-filled — you can update the tag name, conditions, attributes, or validity dates and then save. Click <b>Next</b> and the tour will close this form.',
      },
      {
        wizardStep: true,
        title: 'Closing the Editor…',
        intro: 'The tour is closing the edit form now.',
        simulateClick: '[data-tour="wizard-cancel-button"]',
      },
      // ── EXPORT (SINGLE) BUTTON ────────────────────────────────────────────
      {
        element: '[data-tour="tag-rule-card-export"]',
        title: 'Export a Single Rule',
        intro:
          'The <b>Export</b> button downloads just <i>this one</i> rule as a JSON file. Useful when you want to share or back up a specific rule without exporting everything.',
        position: 'top',
      },
      // ── DELETE BUTTON ────────────────────────────────────────────────────
      {
        element: '[data-tour="tag-rule-card-delete"]',
        title: 'Delete a Rule',
        intro:
          'The <b>Delete</b> button permanently removes this tag rule. A confirmation dialog will appear so you cannot delete by accident. Use this only when you are sure the rule is no longer needed.',
        position: 'top',
      },
    ],
  },
};
