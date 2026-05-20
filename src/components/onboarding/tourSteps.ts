export interface TourStepDef {
  element?: string;
  title: string;
  intro: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Tab to switch to before the step renders. Use the human-readable label
   * (e.g. "Backlog", "Transactions", "Settings", "Integration Logs"). Resolved
   * at runtime against the rendered tab labels so the right index is used for
   * each role (DevOps users have an extra Integration Logs tab that shifts the
   * Settings index from 2 to 3). The legacy numeric `tab` is kept for backward
   * compatibility but new steps should prefer `tabLabel`.
   */
  tabLabel?: 'Backlog' | 'Transactions' | 'Settings' | 'Integration Logs';
  tab?: number; // legacy numeric index, kept for backward compatibility
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
  // Role-aware behavior: when true and the current user has the audit role, the
  // step is skipped entirely (the engine calls nextStep() instead of running its
  // simulation/interactive handlers). Use on any step that would mutate data.
  auditSkip?: boolean;
}

export interface TourDef {
  label: string;
  icon: string;
  description: string;
  steps: TourStepDef[];
  // Role-aware visibility: when set, the tour topic only appears in the Onboarding
  // Hub for users whose role matches. Currently used by the Integration Logs tour
  // (visible to devops only).
  requiresRole?: 'devops';
}

export const tours: Record<string, TourDef> = {
  gettingStarted: {
    label: 'Getting Started',
    icon: '🚀',
    description: 'Checkout, explore filters, and create your first tag — the full workflow.',
    steps: [
      // ── CHECKOUT ──────────────────────────────────────────────────────────
      {
        tabLabel: 'Backlog',
        element: '[data-tour="backlog-view"]',
        title: 'The Backlog',
        intro:
          'This is the <b>Backlog</b>. It shows every bank account being worked on. Each row tells you how many transactions have been tagged and who is currently working on it. If you have the <b>Audit</b> role you can follow along; the tour will skip any step that would change data.',
      },
      {
        element: '[data-tour="checkout-button"]',
        title: 'Checkout a Bank',
        intro:
          'To start working on a bank, click <b>Checkout</b>. This <b>reserves it for you</b> so no one else can make changes while you have it. Click Checkout now to continue the tour.',
        // The header's checkout-active-indicator is scoped to the Transactions
        // tab in App.tsx, but Checkout keeps the user on Backlog. The
        // my-checkout-row marker is persistent on every row the user already
        // owns, so it cannot signal a fresh checkout. Use the transient
        // row-just-checked-out marker that StatsTab emits only while a row is
        // in the recently-changed window (~5s after a checkout).
        advanceOnAppear: '[data-tour="row-just-checked-out"]',
        auditSkip: true,
      },
      {
        // NEW: After checkout, scroll back to the now-checked-out row on Backlog.
        tabLabel: 'Backlog',
        element: '[data-tour="my-checkout-row"]',
        position: 'bottom',
        scrollToTopFirst: true,
        title: 'Your Row Is Checked Out',
        intro:
          'Your row is now <b>checked out</b>. It is highlighted on the Backlog and shows you in the <b>Operator</b> column. You can come back here anytime to release or check it back in.',
      },
      {
        // NEW: Wait for the user to click the row-level Transactions button.
        element: '[data-tour="my-checkout-row"] [data-tour="backlog-transactions-button"]',
        position: 'left',
        title: 'Open Your Transactions',
        intro:
          'Click the <b>Transactions</b> button on your row to start working on these transactions.',
        interactive: true,
        auditSkip: true,
      },
      {
        tabLabel: 'Transactions',
        element: '[data-tour="checkout-actions"]',
        title: "You're Checked Out",
        intro:
          "You're now on the Transactions tab. The header shows which bank you're working on. When you're done, click <b>Save and Release</b> to save your work and let others use it, or <b>Save and Check In</b> to also trigger a tagging job that re-evaluates every transaction.",
      },
      // ── FILTERS ───────────────────────────────────────────────────────────
      {
        element: '[data-tour="filters-bar"]',
        title: 'The Filter Bar',
        intro:
          'The <b>filter bar</b> is the row of buttons above the transaction list. Each button narrows the list. Click one to see the available options for that column.',
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
          'The tour is opening the <b>Tags</b> filter and selecting a value. Notice how the transaction list updates instantly.',
        simulateSequence: [
          { type: 'click', target: '[data-tour="filters-bar"] button[data-filter-label*="Tag" i]', at: 900 },
          {
            type: 'click',
            target: '[data-tour="filters-bar"] .absolute label',
            at: 1800,
          },
        ],
        auditSkip: false, // selecting a filter is non-mutating UI state
      },
      {
        element: '[data-tour="filters-bar"]',
        title: 'Filters With Search',
        intro:
          "Some filters have a <b>search box</b> at the top. Type a few letters to narrow the list, then tick the values you want. Click <b>Next</b> and the tour will demonstrate.",
      },
      {
        element: '[data-tour="filters-bar"]',
        title: 'Watch: Searching a Filter',
        intro:
          'The tour is opening the <b>Tags</b> filter, typing a search term, and selecting a result. Notice how the list narrows as you type.',
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
        // NEW: Mention the row-instance Hide Tag Spec affordance (selection-bar action).
        element: '[data-tour="transactions-header"]',
        title: 'Hide a Tag from Specific Rows',
        intro:
          'You can hide a tag on individual rows from the selection bar. Pick rows, then click <b>Hide Tag Spec</b>. Hidden rows are tracked locally and can be unhidden from the <i>Hidden Tag Specs</i> side panel.',
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
          'The tour is clicking <b>Clear filters</b> now. The transaction list is back to showing everything.',
        simulateClick: '[data-tour="clear-filters"]',
      },
      {
        element: '[data-tour="transactions-header"]',
        title: 'On/Off Switches',
        intro:
          '<i>Show Attributes</i> reveals extra columns extracted from matching transactions. Other view toggles like compact mode and incremental pagination live in this header strip too. Click <b>Next</b> and the tour will toggle <i>Show Attributes</i> on and off for you.',
      },
      {
        element: '[data-tour="transactions-header"]',
        title: 'Watch: Toggling Show Attributes',
        intro:
          'The tour is toggling <b>Show Attributes</b>. Notice the extra attribute columns appearing and disappearing in the table.',
        simulateSequence: [
          { type: 'click', target: '[data-tour="show-attributes-toggle"] button', at: 700 },
          { type: 'click', target: '[data-tour="show-attributes-toggle"] button', at: 2400 },
        ],
      },
      {
        element: '[data-tour="transactions-header"]',
        title: 'Using Multiple Filters Together',
        intro:
          'You can have <b>several filters active at the same time</b>. The table shows only transactions that match <i>all</i> of them, for example only <i>credit</i> transactions that are also <i>untagged</i>.',
      },
      // ── TRANSITION: checkout → rule creation ──────────────────────────────
      {
        element: '[data-tour="open-rule-builder"]',
        title: 'Rule Builder Now Available',
        intro:
          "Notice this button is <b>active</b> because you checked out earlier. Without a checkout it stays <b>disabled</b> and you can't create or edit any rules. Click <b>Next</b> and the tour will open it for you.",
      },
      {
        title: 'Opening the Rule Builder',
        intro:
          'The tour will click <b>Create a Rule</b> now to open the rule builder. The next steps will walk you through setting up your first tag.',
        simulateClick: '[data-tour="open-rule-builder"]',
        auditSkip: true,
      },
      // ── CREATE A RULE ─────────────────────────────────────────────────────
      {
        element: '[data-tour="ruleset-logic-info"]',
        title: 'How Conditions Work',
        intro:
          'A rule can have <b>multiple conditions</b>. All conditions inside one group must match, like saying <i>"A and B"</i>. If you add more than one group, a transaction only needs to match <b>one of them</b>, like saying <i>"A, or instead B"</i>.',
      },
      {
        element: '[data-tour="add-rule-group"]',
        title: 'Add a Condition Group',
        intro:
          'Click <b>Add Rule Set</b> to create your first group of conditions. The tour will do this for you now so you can see what happens.',
        simulateClick: '[data-tour="add-rule-group"]',
        auditSkip: true,
      },
      {
        element: '[data-tour="condition-source-field"]',
        title: 'Pick a Field',
        intro:
          'Choose which part of the transaction to look at, for example the <b>Description</b>, the <b>Amount</b>, or the <b>Reference number</b>. The tour will pick one for you.',
        simulateSequence: [{ type: 'select', target: '[data-tour="condition-source-field"]', value: 'Description 1', at: 900 }],
        auditSkip: true,
      },
      {
        element: '[data-tour="condition-operation"]',
        title: 'Pick How to Match',
        intro:
          'Choose <b>how to compare</b> the value. <i>Contains</i> finds it anywhere in the text. <i>Starts with</i> matches only the start. <i>Equals</i> requires an exact match. The tour will select <i>Contains</i> as an example.',
        simulateSequence: [{ type: 'select', target: '[data-tour="condition-operation"]', value: 'Contains', at: 900 }],
        auditSkip: true,
      },
      {
        element: '[data-tour="condition-value"]',
        title: 'Enter a Value',
        intro:
          'Type the <b>word or number</b> to look for. For example, typing <b>REF</b> with <i>Contains</i> matches any transaction whose description contains "REF". Numeric and date fields are now typed: a numeric condition only accepts numbers (including decimals like 1.5), and a date condition only accepts a valid date. The tour will type an example for you.',
        simulateType: { target: '[data-tour="condition-value"] input', value: 'REF' },
        auditSkip: true,
      },
      {
        element: '[data-tour="condition-save-button"]',
        title: 'Confirm the Condition',
        intro:
          "Once you've filled in all the fields, click <b>Save</b> to confirm this condition and collapse the editor. Click <b>Next</b> and the tour will do it for you.",
      },
      {
        title: 'Confirming the Condition',
        intro:
          'The tour is clicking <b>Save</b> now to confirm the condition.',
        simulateClick: '[data-tour="condition-save-button"]',
        auditSkip: true,
      },
      {
        // NEW: highlight the Duplicate Rules From Tag shortcut (template cloning).
        element: '[data-tour="builder-duplicate-rules"]',
        position: 'bottom',
        title: 'Reuse Rules From an Existing Tag',
        intro:
          'When creating a new tag, the <b>Duplicate Rules From Tag</b> button copies the conditions and attributes from another tag into your form, so you can start from an existing pattern and tweak it. The Basic Info (Tag, Side, Bank, Transaction Type) stays yours.',
      },
      {
        element: '[data-tour="builder-transaction-type"]',
        position: 'left',
        title: 'Transaction Type',
        intro:
          'This dropdown links your rule to a specific <b>Transaction Type</b>. It is already set to the type from your checkout. The tour will open the dropdown and re-select that same option so you can see how it works.',
        simulateSequence: [
          { type: 'click', target: '[data-tour="builder-transaction-type"] button[type="button"]', at: 900 },
          { type: 'click', target: '[data-tour="builder-transaction-type"] div.absolute button.text-primary', at: 1700 },
        ],
      },
      {
        element: '[data-tour="create-tag-button"]',
        title: 'Save the Tag',
        intro:
          "Once you've confirmed your conditions, this button lights up. Click it to <b>save the tag</b>. It will be applied to all transactions that match your conditions. Click <b>Next</b> and the tour will do it for you.",
      },
      {
        title: 'Creating the Tag',
        intro:
          'The tour is clicking <b>Create Rule with current settings</b> now. A form will open to complete the new tag.',
        simulateClick: '[data-tour="create-tag-button"]',
        auditSkip: true,
      },
      // ── WIZARD MODAL ──────────────────────────────────────────────────────────
      {
        wizardStep: true,
        wizardPage: 1,
        title: 'The Create Tag Form',
        intro:
          'A form is now open to complete your new tag. It has <b>4 steps</b>: Basic Info, Rules, Attributes, and Review. The tour will guide you through each one.',
      },
      {
        wizardStep: true,
        wizardPage: 1,
        element: '[data-tour="wizard-tag-picker"]',
        title: 'Step 1: Pick a Tag',
        intro:
          'Search for the <b>tag code</b> to assign this rule to. Type a few letters and the list narrows, then click the match. Typing an exact match auto-confirms on Enter. The tour will search and select one for you.',
        simulateSequence: [
          { type: 'type', target: '[data-tour="wizard-tag-picker"] input[type="text"]', value: 'A', at: 900 },
          { type: 'click', target: '[data-tour="wizard-tag-picker"] .max-h-48 button', at: 1800 },
        ],
        auditSkip: true,
      },
      {
        wizardStep: true,
        wizardPage: 1,
        element: '[data-tour="wizard-basic-info-fields"]',
        title: 'Step 1: Other Settings',
        intro:
          'The <b>Side</b>, <b>Bank</b>, and <b>Transaction Type</b> are pre-filled from your checkout. You can adjust <b>Status</b> and <b>Certainty Level</b> if needed. Click <b>Next</b> and the tour will move to the Rules step.',
      },
      {
        wizardStep: true,
        wizardPage: 1,
        title: 'Moving to Rules',
        intro: 'The tour is clicking <b>Next</b> to advance to the Rules step.',
        simulateSequence: [{ type: 'click', target: '[data-tour="wizard-next-button"]', at: 600 }],
        auditSkip: true,
      },
      {
        wizardStep: true,
        wizardPage: 2,
        element: '[data-tour="wizard-step-2-content"]',
        title: 'Step 2: Your Rules',
        intro:
          'Your rule conditions are shown here. Each group can be cloned as an OR sibling using the chain-link icon on the group header, so you can quickly build permutations. A <b>Matching Tags</b> side-panel updates live as you edit, flagging any other tag whose rules overlap. Click <b>Next</b> and the tour will continue.',
      },
      {
        wizardStep: true,
        wizardPage: 2,
        title: 'Moving to Attributes',
        intro: 'The tour is clicking <b>Next</b> to advance to the Attributes step.',
        simulateSequence: [{ type: 'click', target: '[data-tour="wizard-next-button"]', at: 600 }],
        auditSkip: true,
      },
      {
        wizardStep: true,
        wizardPage: 3,
        title: 'Step 3: Attributes (Optional)',
        intro:
          'Attributes let you <b>extract values</b> from matching transactions, like beneficiary names or reference numbers. This step is optional. Extraction methods include <i>extract_between</i>, <i>extract_after</i>, and the newer <i>extract_last_n_chars</i> for trailing identifiers. Click <b>Next</b> to continue.',
      },
      {
        wizardStep: true,
        wizardPage: 3,
        title: 'Moving to Review',
        intro: 'The tour is clicking <b>Next</b> to advance to the Review step.',
        simulateSequence: [{ type: 'click', target: '[data-tour="wizard-next-button"]', at: 600 }],
        auditSkip: true,
      },
      {
        wizardStep: true,
        wizardPage: 4,
        element: '[data-tour="wizard-review"]',
        title: 'Step 4: Review',
        intro:
          "Check that everything looks right: tag name, rules, and settings are all shown here. When you're satisfied, click <b>Next</b> and the tour will save your tag.",
      },
      {
        wizardStep: true,
        wizardPage: 4,
        title: 'Saving Your Tag',
        intro: 'The tour is clicking <b>Create Tag</b> to save your new tag.',
        simulateSequence: [{ type: 'click', target: '[data-tour="wizard-create-button"]', at: 600 }],
        auditSkip: true,
      },
      // ── AFTER SAVE ──────────────────────────────────────────────────────────
      {
        // FIXED: stay on Transactions tab (the wizard closes us back to it).
        tabLabel: 'Transactions',
        element: '[data-tour="transactions-header"]',
        title: 'Tag Saved',
        intro:
          'Your tag is saved to the <b>checked-out library</b>. It will appear as a colored badge in the Transactions table on every transaction it matches. When you are ready, click <b>Save and Check In</b> in the header to release the library and trigger a tagging job across the full dataset.',
      },
      {
        title: 'Want More?',
        intro:
          'You finished the workflow. Open the help menu anytime to explore the other guided tours: <b>Backlog</b> for every column and action on the Backlog table, <b>Settings</b> for the tag hierarchy and value catalogs, <b>Notifications and Comments</b> for collaborating on tags, and <b>Sharing</b> for sending pre-filtered views to teammates.',
      },
    ],
  },

  notificationsComments: {
    label: 'Notifications and Comments',
    icon: '🔔',
    description: 'Follow tag conversations, open a thread from a notification, and reply with @-mentions.',
    steps: [
      {
        element: '[data-tour="notifications-bell"]',
        position: 'bottom',
        title: 'The Notifications Bell',
        intro:
          'The bell in the header carries an <b>unread count</b> for any tag conversation you are part of: new comments on your tag definitions, replies to threads you participate in, and @-mentions of you. It polls every 30 seconds and refreshes when you focus the tab.',
      },
      {
        element: '[data-tour="notifications-bell"]',
        position: 'bottom',
        title: 'Open the Drawer',
        intro: 'Click the bell to open the notifications panel. The tour will open it for you.',
        simulateClick: '[data-tour="notifications-bell"]',
      },
      {
        element: '[data-tour="notifications-drawer"]',
        position: 'left',
        title: 'Notification Cards',
        intro:
          'Each card shows the <b>reply author</b> (not the original commenter), the relative time, and a short snippet of what they said. Replies attribute to the actual sender so a long thread does not keep pointing back to the first person. Hover a card to reveal <b>Mark as read</b> / <b>Mark as unread</b> and a <b>Dismiss</b> action.',
      },
      {
        element: '[data-tour="notification-card"]',
        position: 'left',
        title: 'Open a Conversation',
        intro:
          'Clicking any card takes you straight to the underlying <b>comment thread</b>. The notifications popover closes and the thread panel slides in from the right. Click <b>Next</b> and the tour will open the first card. If your inbox is empty the tour will keep narrating without opening anything.',
      },
      {
        title: 'Opening the Thread',
        intro:
          'The tour is clicking the first notification card now. Wait a moment for the thread panel to slide in.',
        simulateClick: '[data-tour="notification-card"]',
        auditSkip: true,
      },
      {
        element: '[data-tour="comment-thread-panel"]',
        position: 'left',
        title: 'The Comment Thread Panel',
        intro:
          'The <b>thread panel</b> slides in from the right. The header shows what the thread is attached to (a Bank/Side, a TagSpec, a rule, or an attribute) and offers a <b>View in Backlog</b> link that jumps to the library row being discussed and pulses it on arrival.',
      },
      {
        element: '[data-tour="comment-thread-panel"]',
        position: 'left',
        title: 'Who Can Post and Who Can Reply',
        intro:
          'Only the <b>operator who has the library checked out</b> can start a <i>new</i> top-level comment thread. Everyone else (including DevOps and Audit) sees a notice at the top of the panel explaining that, and the composer is replaced by a read-only banner. <b>Replies are different</b>: anyone with access to the library can reply to an existing thread, so collaboration keeps flowing even when you are not the active owner. Audit users see the panel as fully read-only.',
      },
      {
        element: '[data-tour="comment-composer"]',
        position: 'left',
        title: 'Starting a New Comment',
        intro:
          'At the top of the panel is the <b>comment composer</b> (shown only to the current operator). Top-level comments are markdown-safe (sanitized) and capped at 2000 characters. If you do not see a composer here, it means another operator owns the checkout — scroll down and use <b>Reply</b> on any existing thread instead.',
      },
      {
        element: '[data-tour="comment-composer-textarea"]',
        position: 'left',
        title: 'Typing a Comment',
        intro:
          'The tour is typing a sample comment into the composer. Nothing will be posted.',
        simulateType: { target: '[data-tour="comment-composer-textarea"]', value: 'Looking into this now.' },
        auditSkip: true,
      },
      {
        element: '[data-tour="comment-composer-textarea"]',
        position: 'left',
        title: 'Mentioning Someone',
        intro:
          'Typing <b>@</b> opens the mention picker, filtered by display name. The tour is clearing the textarea and typing an at-sign so you can see the picker.',
        simulateSequence: [
          { type: 'type', target: '[data-tour="comment-composer-textarea"]', value: '', at: 200 },
          { type: 'type', target: '[data-tour="comment-composer-textarea"]', value: '@', at: 700 },
        ],
        auditSkip: true,
      },
      {
        element: '[data-tour="mention-autocomplete"]',
        position: 'left',
        title: 'The Mention Picker',
        intro:
          'A floating list of operators appears below the cursor. Keep typing letters to narrow it down, then click or press Enter to insert the chip. When you post, the mentioned operator receives a notification with you listed as the sender.',
      },
      {
        element: '[data-tour="comment-composer-textarea"]',
        position: 'left',
        title: 'Clearing the Composer',
        intro:
          'The tour is clearing the composer so the existing thread comments stay readable. Nothing was posted.',
        simulateSequence: [
          { type: 'type', target: '[data-tour="comment-composer-textarea"]', value: '', at: 200 },
        ],
        auditSkip: true,
      },
      {
        element: '[data-tour="thread-item"]',
        position: 'left',
        title: 'A Thread',
        intro:
          'Below the composer are the existing threads. Each <b>thread card</b> shows the original author, their avatar, the relative time, and the comment body. Threads marked <i>Resolved</i> get an emerald frame and roll into a collapsible group at the bottom of the panel.',
      },
      {
        element: '[data-tour="thread-reply-button"]',
        position: 'left',
        title: 'Reply to a Thread',
        intro:
          'The <b>Reply</b> action under each thread opens an inline composer scoped to that thread. The first 5 replies render inline; older ones collapse behind a <i>Show N earlier replies</i> toggle so long threads stay scannable. Click <b>Next</b> and the tour will open the reply composer.',
      },
      {
        title: 'Opening the Reply Composer',
        intro: 'The tour is clicking <b>Reply</b> on the first thread.',
        simulateClick: '[data-tour="thread-reply-button"]',
        auditSkip: true,
      },
      {
        element: '[data-tour="reply-composer"]',
        position: 'left',
        title: 'The Reply Composer',
        intro:
          'The reply composer behaves like the top-level composer: type the body, use <b>@</b> for mentions. The footer offers three actions: <b>Reject</b> (mark the suggestion as turned down), <b>Resolve</b> (close the thread out), or a default post that just records the reply. The tour will type a sample and then cancel.',
      },
      {
        element: '[data-tour="reply-composer-textarea"]',
        position: 'left',
        title: 'Typing a Reply',
        intro: 'The tour is typing a sample reply.',
        simulateType: { target: '[data-tour="reply-composer-textarea"]', value: 'Thanks, I will update this thread shortly.' },
        auditSkip: true,
      },
      {
        element: '[data-tour="reply-composer-textarea"]',
        position: 'left',
        title: 'Mentioning in a Reply',
        intro:
          'The same <b>@</b> picker is available inside a reply. The tour is clearing the textarea and typing an at-sign to show the picker, then cancelling without posting.',
        simulateSequence: [
          { type: 'type', target: '[data-tour="reply-composer-textarea"]', value: '', at: 200 },
          { type: 'type', target: '[data-tour="reply-composer-textarea"]', value: '@', at: 700 },
        ],
        auditSkip: true,
      },
      {
        element: '[data-tour="mention-autocomplete"]',
        position: 'left',
        title: 'Same Mention Picker',
        intro:
          'The reply composer reuses the exact same mention picker. Selecting an operator inserts a chip and sends them a notification when the reply is posted.',
      },
      {
        title: 'Cancelling the Reply',
        intro:
          'The tour is clearing the reply textarea and hiding the composer. Nothing was posted.',
        simulateSequence: [
          { type: 'type', target: '[data-tour="reply-composer-textarea"]', value: '', at: 200 },
          { type: 'click', target: '[data-tour="thread-reply-button"]', at: 700 },
        ],
        auditSkip: true,
      },
      {
        element: '[data-tour="comment-thread-close"]',
        position: 'left',
        title: 'Closing the Thread',
        intro:
          'The <b>X</b> in the header closes the panel and returns you to whichever tab you were on. The Escape key does the same thing. Click <b>Next</b> and the tour will close it.',
      },
      {
        title: 'Closing the Panel',
        intro: 'The tour is closing the thread panel now.',
        simulateClick: '[data-tour="comment-thread-close"]',
        auditSkip: true,
      },
      {
        tabLabel: 'Backlog',
        element: '[data-tour="backlog-view"]',
        title: 'Comments on Tag Definitions',
        intro:
          'You can also open a thread directly from a tag, without going through the notifications inbox. Every Backlog row and every tag definition carries a chat bubble that opens the same thread panel.',
      },
      {
        element: '[data-tour="tag-comment-icon"]',
        position: 'left',
        title: 'The Chat Bubble',
        intro:
          'The bubble shows an <b>unread count</b> when there are new comments since you last opened it. Clicking it opens the same thread panel as the notification flow. Threads belonging to that tag are pre-loaded for you.',
      },
    ],
  },

  sharing: {
    label: 'Sharing',
    icon: '🔗',
    description: 'Send a teammate a pre-filtered view of transactions with a one-click link.',
    steps: [
      {
        element: '[data-tour="share-icon"]',
        position: 'bottom',
        title: 'The Share Icon',
        intro:
          'When you have a library checked out, a <b>chain-link icon</b> appears in the header. It opens the Share dialog. The icon is hidden when there is no active checkout.',
      },
      {
        element: '[data-tour="share-icon"]',
        position: 'bottom',
        title: 'Open the Share Dialog',
        intro:
          'Click the icon to open the dialog. The tour will open it for you.',
        simulateClick: '[data-tour="share-icon"]',
        auditSkip: false,
      },
      {
        title: 'What Gets Shared',
        intro:
          'The link encodes the <b>bank and side</b>, every <b>active filter</b>, your <b>view settings</b> (compact mode, incremental pagination, show attributes), and an optional <b>note</b> up to 500 characters describing what you want the recipient to look at.',
      },
      {
        title: 'Pre-Login Persistence',
        intro:
          'If the recipient opens the link while logged out, the portal stores the parameters in session storage. After they sign in, the filters and toggles are applied automatically and a <b>Shared View</b> banner shows who shared the link and the note you wrote.',
      },
    ],
  },

  settings: {
    label: 'Settings',
    icon: '⚙️',
    description: 'Tags hierarchy, attributes, extractions, and LOVs — everything inside the Settings tab.',
    steps: [
      {
        tabLabel: 'Settings',
        title: 'The Settings Tab',
        intro:
          'The <b>Settings</b> tab is where you manage everything <i>about</i> your tags rather than the transactions themselves. It is organized into four sub-tabs in the left sidebar: <b>Tags Hierarchy</b>, <b>Attributes</b>, <b>Extractions</b>, and <b>LOVs</b>. The tour will walk through Tags Hierarchy first, then the LOV catalog and reusable extraction templates.',
      },
      // ── TAGS HIERARCHY SUB-TAB ────────────────────────────────────────────
      {
        element: '[data-tour="settings-subtab-tags"]',
        position: 'right',
        title: 'Tags Hierarchy',
        intro:
          'The first sub-tab is the <b>Tags Hierarchy</b>. It shows all your tags organized into groups, so you can browse, search, create, edit, archive, and delete tags. The tour will switch to it now.',
        simulateClick: '[data-tour="settings-subtab-tags"]',
      },
      // ── THE TREE ─────────────────────────────────────────────────────────
      {
        title: 'The Tag Tree',
        intro:
          'Tags are organized in a <b>tree</b>. Each row is either a <b>group</b> (click to expand and see the tags inside) or an individual <b>tag</b>. Rows highlighted in <b>blue</b> are newly added; <b>amber</b> rows have been recently edited.',
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
          'Use the <b>search box</b> to find any tag by name or code. The list filters as you type; matching text is highlighted in yellow. The tour will type a search to show you.',
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
          'The <b>pencil icon</b> opens the edit form with the current values pre-filled. You can update the name, description, or any other setting. Click <b>Next</b> and the tour will open the edit form for you.',
      },
      {
        title: 'Opening the Edit Form',
        intro:
          'The tour is clicking the <b>pencil</b> now to open the edit form.',
        simulateClick: '[data-tour="tag-row-actions"] button:first-child',
        auditSkip: true,
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
        title: 'Closing the Edit Form',
        intro: 'The tour is clicking <b>Cancel</b> to close the form without saving.',
        simulateSequence: [{ type: 'click', target: '[data-tour="tag-edit-cancel"]', at: 200 }],
        auditSkip: true,
      },
      // ── NEW TAG ───────────────────────────────────────────────────────────
      {
        element: '[data-tour="new-tag-button"]',
        title: 'Create a New Tag',
        intro:
          'Click <b>+ New Tag</b> to open the creation form. Click <b>Next</b> and the tour will open it for you so you can explore each field.',
      },
      {
        title: 'Opening the New Tag Form',
        intro: 'The tour is clicking <b>+ New Tag</b> now.',
        simulateClick: '[data-tour="new-tag-button"]',
        auditSkip: true,
      },
      // ── TAG EDIT MODAL ────────────────────────────────────────────────────
      {
        wizardStep: true,
        title: 'The New Tag Form',
        intro:
          'A form is now open for creating a new tag. Choose the <b>Type</b> first: <i>Tag (T)</i> for a regular tag, or <i>Group (G)</i> to create a category that holds multiple tags. The tour will now walk through every field.',
      },
      {
        wizardStep: true,
        element: '[data-tour="tag-edit-code"]',
        title: 'Tag Code',
        intro:
          'The <b>Tag Code</b> is the unique identifier: short uppercase letters, no spaces (e.g. <b>PAYMENTCR</b>). The tour is typing an example code now.',
        simulateType: { target: '[data-tour="tag-edit-code"] input', value: 'TOURTAG' },
        auditSkip: true,
      },
      {
        wizardStep: true,
        element: '[data-tour="tag-edit-name"]',
        title: 'Display Name',
        intro:
          'The <b>Name</b> is the human-readable label shown in the UI and reports. It can be longer and more descriptive than the code. The tour is filling it in now.',
        simulateType: { target: '[data-tour="tag-edit-name"] input', value: 'Tour Example' },
        auditSkip: true,
      },
      {
        wizardStep: true,
        element: '[data-tour="tag-edit-description"]',
        title: 'Description',
        intro:
          'The <b>Description</b> is an optional note explaining what this tag represents. The tour is typing one in for you.',
        simulateType: { target: '[data-tour="tag-edit-description"] input', value: 'A demo tag created during the onboarding tour.' },
        auditSkip: true,
      },
      {
        wizardStep: true,
        element: '[data-tour="tag-edit-parent"]',
        title: 'Parent Tag',
        intro:
          'The <b>Parent Tag</b> lets you nest this tag under another, useful for subtypes or variations. The tour will type to search, then select the first result.',
        simulateSequence: [
          { type: 'type', target: '[data-tour="tag-edit-parent"] input', value: 'T', at: 900 },
          { type: 'click', target: '[data-tour="tag-edit-parent"] .absolute button:nth-child(2)', at: 2100 },
        ],
        auditSkip: true,
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
        auditSkip: true,
      },
      {
        wizardStep: true,
        element: '[data-tour="tag-edit-create"]',
        position: 'top',
        title: 'Creating the Tag',
        intro:
          "All fields are filled in: the <b>Create</b> button is now active. Click <b>Next</b> when you're ready and the tour will save the tag for you.",
      },
      {
        wizardStep: true,
        title: 'Saving the Tag',
        intro:
          'The tour is clicking <b>Create</b> now to save the tag. It will appear in the hierarchy right away, marked as <i>unsynchronised</i> until you confirm the sync.',
        simulateClick: '[data-tour="tag-edit-create"]',
        auditSkip: true,
      },
      // ── SYNC TAGS ─────────────────────────────────────────────────────────
      {
        element: '[data-tour="sync-tags-button"]',
        position: 'bottom',
        title: 'Sync Tags',
        intro:
          'After making changes (creating, editing, or archiving tags), a <b>Sync Tags</b> button appears here at the top right. The button pulses with a soft amber outline whenever you have unsynced changes. Click <b>Next</b> and the tour will open it for you.',
      },
      {
        title: 'Opening the Sync Review',
        intro: 'The tour is clicking <b>Sync Tags</b> now to show you the review screen.',
        simulateClick: '[data-tour="sync-tags-button"]',
        auditSkip: true,
      },
      {
        wizardStep: true,
        title: 'The Sync Review',
        intro:
          'This is the <b>Sync Review</b> screen. It shows a summary of everything that changed: tags <b>added</b> in green, <b>modified</b> in yellow, and <b>removed</b> in red. Review the list, then click <b>Sync Tags</b> to push the changes to the server, or <b>Cancel</b> to go back without syncing.',
      },
      {
        wizardStep: true,
        title: 'Closing the Review',
        intro: 'The tour is closing the review without syncing.',
        simulateClick: '[data-tour="sync-review-close"]',
        auditSkip: true,
      },
      // NEW: Sync-Before-Leave guard
      {
        title: 'Sync-Before-Leave Guard',
        intro:
          'If you try to navigate away from the Settings tab while you still have unsynced changes, the portal interrupts you with a dialog: <b>Sync Now</b> runs the sync flow, <b>Leave Without Syncing</b> keeps the local state and lets you navigate, and <b>Cancel</b> stays on Settings. This stops accidental drops of in-flight changes.',
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
          'The <b>yellow archive button</b> marks a tag or group as <i>archived</i>. It stays in the system but is hidden from active use. You can bring it back at any time using the <b>green reactivate button</b>: nothing is permanently lost.',
      },
      {
        element: '[data-tour="tag-group-delete-button"]',
        position: 'bottom',
        title: 'Delete a Tag',
        intro:
          "The <b>red delete button</b> <i>permanently removes</i> a tag or group. A confirmation dialog appears first so you can't delete by accident. Use this only when you are sure it is no longer needed.",
      },
      // ── ATTRIBUTES SUB-TAB ───────────────────────────────────────────────
      {
        element: '[data-tour="settings-subtab-attributes"]',
        position: 'right',
        title: 'Attributes Sub-Tab',
        intro:
          'The next sub-tab is <b>Attributes</b>. Attributes are the named values your rules can extract from a transaction (for example <i>BeneficiaryName</i>, <i>ReferenceNumber</i>, <i>SenderBank</i>). This is where you manage that catalog. The tour will switch to it now.',
        simulateClick: '[data-tour="settings-subtab-attributes"]',
      },
      {
        element: '[data-tour="attributes-page"]',
        position: 'top',
        title: 'Attributes Catalog',
        intro:
          'The page lists every active attribute. Each row shows the <b>Name</b> (English display label), the <b>Value</b> (the PascalCase key used in payloads and the rule builder), a short <b>Description</b>, and the <b>Suggested LOV</b> if the attribute validates against a list of values.',
      },
      {
        element: '[data-tour="attributes-search"]',
        position: 'bottom',
        title: 'Search Attributes',
        intro:
          'Use the <b>search box</b> to filter the catalog by Name or Value as you type. The tour will type a sample query, then clear it.',
        simulateSequence: [
          { type: 'type', target: '[data-tour="attributes-search"]', value: 'Ban', at: 400 },
          { type: 'type', target: '[data-tour="attributes-search"]', value: '', at: 1800 },
        ],
      },
      {
        element: '[data-tour="attributes-create-button"]',
        position: 'left',
        title: 'Create a New Attribute',
        intro:
          'Click <b>+ Create Attribute</b> to open the bilingual form. Click <b>Next</b> and the tour will open it so you can see every field. Nothing will be saved.',
      },
      {
        title: 'Opening the Attribute Form',
        intro: 'The tour is clicking <b>+ Create Attribute</b> now. Wait a moment for the dialog to fade in.',
        simulateClick: '[data-tour="attributes-create-button"]',
        auditSkip: true,
      },
      {
        wizardStep: true,
        element: '[data-tour="attribute-form"]',
        title: 'The Attribute Form',
        intro:
          'A dialog is open. The form is <b>bilingual</b> (English on the left, Arabic on the right) and has a <b>Value</b> field that auto-generates as PascalCase from the English Name. You can also pick a <b>Suggested LOV</b> so the wizard auto-fills validation. The tour will type a few sample values into the inputs to show how it behaves, then close the dialog without saving.',
      },
      {
        wizardStep: true,
        element: '[data-tour="attribute-form-name-en"]',
        title: 'English Name',
        intro:
          'The <b>English Name</b> is what operators see in the wizard. The <i>Value</i> tile updates live to a PascalCase derivation as you type. The tour is typing a sample.',
        simulateType: { target: '[data-tour="attribute-form-name-en"]', value: 'Tour Attribute' },
        auditSkip: true,
      },
      {
        wizardStep: true,
        element: '[data-tour="attribute-form-desc-en"]',
        title: 'English Short Description',
        intro:
          'The <b>Short Description</b> explains what the attribute represents. Both languages are required to save. The tour is filling it in.',
        simulateType: { target: '[data-tour="attribute-form-desc-en"]', value: 'A sample attribute created during onboarding.' },
        auditSkip: true,
      },
      {
        wizardStep: true,
        element: '[data-tour="attribute-form-name-ar"]',
        title: 'Arabic Name',
        intro:
          'The form also requires an <b>Arabic Name</b> and <b>Arabic Short Description</b>, rendered right-to-left. The tour is typing a sample.',
        simulateType: { target: '[data-tour="attribute-form-name-ar"]', value: 'سمة تجريبية' },
        auditSkip: true,
      },
      {
        wizardStep: true,
        element: '[data-tour="attribute-form-cancel"]',
        position: 'top',
        title: 'Closing Without Saving',
        intro:
          'You can save by clicking <b>Create</b> once all four required fields are filled. For this tour, click <b>Next</b> and we will close the form without saving anything.',
      },
      {
        wizardStep: true,
        title: 'Closing the Attribute Form',
        intro: 'The tour is clicking <b>Cancel</b> to close the form. Nothing was saved.',
        simulateClick: '[data-tour="attribute-form-cancel"]',
        auditSkip: true,
      },
      {
        element: '[data-tour="attributes-table"]',
        position: 'top',
        title: 'Per-Row Delete',
        intro:
          'Each row has a <b>red delete button</b> on the right. Clicking it opens a confirmation dialog (no accidental deletes). Deletes are <i>soft</i>: the attribute is marked archived and hidden from the list, so existing rules that still reference it keep working. The Create and Delete buttons are hidden for Audit users.',
      },
      // ── EXTRACTIONS SUB-TAB ──────────────────────────────────────────────
      {
        element: '[data-tour="settings-subtab-extractions"]',
        position: 'right',
        title: 'Extractions Sub-Tab',
        intro:
          'The next sub-tab is <b>Extractions</b>. This is where you author reusable named extraction templates (for example <i>KSA IBAN</i>, <i>VAT number</i>, <i>Reference after REF:</i>). Author a template once and the wizard\'s extraction method picker can apply it by name across all your rules. The tour will switch to it now.',
        simulateClick: '[data-tour="settings-subtab-extractions"]',
      },
      {
        element: '[data-tour="extractions-page"]',
        position: 'top',
        title: 'Extractions Catalog',
        intro:
          'The page lists every active extraction template. Each row shows the <b>Name</b>, the underlying <b>Regex</b> (the pattern the template runs), and a short <b>Description</b>. Rules in the builder reference templates by name, so renaming or replacing a template propagates wherever it is used.',
      },
      {
        element: '[data-tour="extractions-search"]',
        position: 'bottom',
        title: 'Search Extractions',
        intro:
          'The <b>search box</b> filters by Name, Value (regex), or Description as you type. The tour will type a sample query, then clear it.',
        simulateSequence: [
          { type: 'type', target: '[data-tour="extractions-search"]', value: 'IBAN', at: 400 },
          { type: 'type', target: '[data-tour="extractions-search"]', value: '', at: 1800 },
        ],
      },
      {
        element: '[data-tour="extractions-create-button"]',
        position: 'left',
        title: 'Create a New Extraction',
        intro:
          'Click <b>+ Create Extraction</b> to open the form. You provide a <b>regex pattern</b>, plus a bilingual Name and Description. The pattern is validated client-side before saving. Click <b>Next</b> and the tour will open the form so you can see every field. Nothing will be saved.',
      },
      {
        title: 'Opening the Extraction Form',
        intro: 'The tour is clicking <b>+ Create Extraction</b> now. Wait a moment for the dialog to fade in.',
        simulateClick: '[data-tour="extractions-create-button"]',
        auditSkip: true,
      },
      {
        wizardStep: true,
        element: '[data-tour="extraction-form"]',
        title: 'The Extraction Form',
        intro:
          'A dialog is open. The <b>Regex</b> field sits at the top: invalid patterns flag with an inline error, and duplicates of an existing template also block save. Below it is the bilingual Name and Description. The tour will type sample values into each input and then close the dialog without saving.',
      },
      {
        wizardStep: true,
        element: '[data-tour="extraction-form-regex"]',
        title: 'Regex Pattern',
        intro:
          'The <b>Regex</b> is the actual pattern the template runs. It is validated as you type using JavaScript\'s native regex engine. The tour is typing a simple sample pattern.',
        simulateType: { target: '[data-tour="extraction-form-regex"]', value: 'REF[0-9]+' },
        auditSkip: true,
      },
      {
        wizardStep: true,
        element: '[data-tour="extraction-form-name-en"]',
        title: 'English Name',
        intro:
          'A short, human-readable English Name shown in the wizard picker. The tour is typing a sample.',
        simulateType: { target: '[data-tour="extraction-form-name-en"]', value: 'Tour Reference' },
        auditSkip: true,
      },
      {
        wizardStep: true,
        element: '[data-tour="extraction-form-desc-en"]',
        title: 'English Short Description',
        intro:
          'A short description explaining what this template extracts. The tour is filling it in.',
        simulateType: { target: '[data-tour="extraction-form-desc-en"]', value: 'A sample extraction created during onboarding.' },
        auditSkip: true,
      },
      {
        wizardStep: true,
        element: '[data-tour="extraction-form-cancel"]',
        position: 'top',
        title: 'Closing Without Saving',
        intro:
          'You would normally click <b>Create</b> once everything is filled. For this tour, click <b>Next</b> and we will close the form without saving.',
      },
      {
        wizardStep: true,
        title: 'Closing the Extraction Form',
        intro: 'The tour is clicking <b>Cancel</b> to close the form. Nothing was saved.',
        simulateClick: '[data-tour="extraction-form-cancel"]',
        auditSkip: true,
      },
      {
        element: '[data-tour="extraction-row-edit"]',
        position: 'left',
        title: 'Edit an Existing Extraction',
        intro:
          'The <b>pencil icon</b> on any existing row re-opens the same form with its current values pre-filled. Click <b>Next</b> and the tour will open it to show you, then close without saving.',
      },
      {
        title: 'Opening the Edit Form',
        intro: 'The tour is clicking the <b>pencil</b> on the first row. The form will load with that row\'s values pre-filled.',
        simulateClick: '[data-tour="extraction-row-edit"]',
        auditSkip: true,
      },
      {
        wizardStep: true,
        element: '[data-tour="extraction-form"]',
        title: 'The Edit Form',
        intro:
          'The same form appears, now pre-filled from the row you selected. You could edit any field and click <b>Save Changes</b>. For this tour, click <b>Next</b> and we will close the form without saving.',
      },
      {
        wizardStep: true,
        title: 'Closing the Edit Form',
        intro: 'The tour is clicking <b>Cancel</b> now to close the edit form. Nothing was changed.',
        simulateClick: '[data-tour="extraction-form-cancel"]',
        auditSkip: true,
      },
      {
        element: '[data-tour="extractions-table"]',
        position: 'top',
        title: 'Per-Row Delete',
        intro:
          'Each row also has a <b>red delete button</b> next to the pencil. It opens a confirmation dialog (no accidental deletes). Like attributes, extraction deletes are <i>soft</i>: references from existing rules keep working because they bind to the saved snapshot, not the template entry. Create, Edit, and Delete are all hidden for Audit users.',
      },
      // ── LOVS SUB-TAB ─────────────────────────────────────────────────────
      {
        element: '[data-tour="settings-subtab-lovs"]',
        position: 'right',
        title: 'LOVs Sub-Tab',
        intro:
          'The last sub-tab is <b>LOVs</b>: a read-only browser of every <b>List of Values</b> the portal uses to validate and label extracted attribute values. The tour will switch to it now.',
        simulateClick: '[data-tour="settings-subtab-lovs"]',
      },
      {
        element: '[data-tour="lov-category-list"]',
        position: 'right',
        title: 'Category List',
        intro:
          'The left sidebar lists every non-internal LOV category. Each entry shows the humanized tag and an item-count badge. Internal LOVs (used by the wizard plumbing) are filtered out so the list stays focused on operator-facing catalogs.',
      },
      {
        element: '[data-tour="lov-items-pane"]',
        position: 'left',
        title: 'Items Pane',
        intro:
          'Selecting a category shows its items in a two-column table: <b>Value</b> (the raw key) and <b>Label</b> (the human-friendly display). Click a row to reveal alias tags. The new <b>COUNTRIES</b> LOV maps ISO-3166 codes to country names, so an attribute extracting a country code resolves to <i>"Saudi Arabia"</i> instead of <i>"SA"</i>.',
      },
      {
        element: '[data-tour="lov-items-pane"]',
        position: 'left',
        title: 'Search Within a Category',
        intro:
          'A second search box filters items by value, label, or any alias tag. Useful when an LOV has hundreds of entries.',
      },
      {
        title: 'Inline LOV Drawer in the Wizard',
        intro:
          'When you author a rule, the wizard\'s LOV-backed dropdowns expose a <b>Browse this LOV</b> link. It opens the LOV browser as a side drawer without leaving the rule, so you can sanity-check the catalog while authoring.',
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
        tabLabel: 'Backlog',
        element: '[data-tour="backlog-view"]',
        title: 'The Backlog',
        intro:
          'This is the <b>Backlog</b>: a table showing every bank account tracked by the system. Each row represents one bank and side combination (Debit or Credit) and tells you how many tag rules are defined and who is working on it.',
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
          'The <b>Statistics</b> bar shows how well the transactions for this bank are tagged. The progress bar fills up as more transactions get matched. Coloured badges break it down further: <b>Clean</b>, <b>Near-Clean</b>, <b>Problematic</b>, <b>Untagged</b>, and <b>Dead End</b>.',
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
          "The <b>Transactions</b> button takes you directly to the transaction list for that bank and side, filtered to show only that bank's data. Use it to quickly review what's in the system without checking out.",
        position: 'left',
      },
      // ── COMPARE BUTTON ───────────────────────────────────────────────────
      {
        element: '[data-tour="backlog-compare-button"]',
        title: 'Compare Button',
        intro:
          'The <b>Compare</b> button appears only when a row is <b>In Progress</b>. It opens a side-by-side view of the current (checked-out) version versus the last saved version, so you can see exactly what has changed before checking in. Rules added are shown in <b>green</b>, removed in <b>red</b>, and modified in <b>yellow</b>. Every entry is clickable: clicking an added or modified item opens the tag in the rule builder, and clicking a removed item shows a read-only snapshot of what is about to be deleted.',
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
          'The <b>Rollback</b> button discards all unsaved changes and reverts the bank back to the last checked-in version. <b>This cannot be undone</b>; a confirmation dialog appears before anything is deleted. It also only appears on rows you own.',
        position: 'left',
      },
      // ── IMPORT BUTTON ────────────────────────────────────────────────────
      {
        element: '[data-tour="backlog-import-button"]',
        title: 'Import',
        intro:
          'The <b>Import</b> button lets you load tag rule definitions from a <b>JSON file</b> that was previously exported. Useful for copying rules between environments or restoring a backup.',
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
          'The <b>View All Transactions</b> button switches to the Transactions tab with <i>no bank filter applied</i>: you see every transaction across all banks at once. Useful for a broad overview.',
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
          'Each expanded row shows a list of <b>Tag Rule Cards</b>: one for every tag rule defined for that bank. Each card shows the tag name and its status badges. Click a card to expand it and see the full rule details.',
      },
      // ── EXPAND A CARD ─────────────────────────────────────────────────────
      {
        element: '[data-tour="tag-rule-card-toggle"]',
        title: 'Opening a Rule Card',
        intro:
          'Click any rule card to expand it and see the <b>matching conditions</b>, <b>attributes</b>, and <b>validity dates</b> for that rule. The tour will open the first one now.',
        simulateClick: '[data-tour="tag-rule-card-toggle"]',
      },
      // NEW: Comments on tag definitions
      {
        element: '[data-tour="tag-comment-icon"]',
        position: 'left',
        title: 'Comments on Tag Definitions',
        intro:
          'Every tag definition carries a <b>comment thread</b>. The chat icon shows how many comments exist and lights up with an unread count when there is new activity. Open the thread to read, reply, or @-mention a teammate. See the <b>Notifications and Comments</b> tour for the full workflow.',
      },
      // ── EDIT BUTTON ──────────────────────────────────────────────────────
      {
        element: '[data-tour="tag-rule-card-edit"]',
        title: 'Edit a Rule',
        intro:
          'The <b>Edit</b> button reopens the rule builder pre-filled with all the current settings for that tag, so you can adjust conditions, attributes, or other fields and save the changes. The tour will click it now.',
        position: 'top',
        simulateClick: '[data-tour="tag-rule-card-edit"]',
        auditSkip: true,
      },
      {
        wizardStep: true,
        title: 'The Edit Form',
        intro:
          'The rule builder opens with all existing settings pre-filled. You can update the tag name, conditions, attributes, or validity dates and then save. From here you can also <b>Delete</b> the tag from the rule builder footer (the deletion is local-only until your next check-in). Click <b>Next</b> and the tour will close this form.',
      },
      {
        wizardStep: true,
        title: 'Closing the Editor',
        intro: 'The tour is closing the edit form now.',
        simulateClick: '[data-tour="wizard-cancel-button"]',
        auditSkip: true,
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
          "The <b>Delete</b> button permanently removes this tag rule. A confirmation dialog will appear so you cannot delete by accident. Use this only when you are sure the rule is no longer needed.",
        position: 'top',
      },
    ],
  },

  integrationLogs: {
    label: 'Integration Logs',
    icon: '🛠️',
    description: 'DevOps view of every outbound call to upstream banking endpoints, with replay.',
    requiresRole: 'devops',
    steps: [
      {
        tabLabel: 'Integration Logs',
        element: '[data-tour="integration-logs-tab"]',
        title: 'Integration Logs Tab',
        intro:
          'This tab is only visible to users with the <b>DevOps</b> role. It surfaces every outbound integration call between TEP and upstream banking endpoints so you can troubleshoot connector failures without database access.',
      },
      {
        element: '[data-tour="integration-logs-tab"]',
        title: 'Log Table',
        intro:
          'Each row shows the <b>endpoint</b>, the <b>statement id</b>, the <b>start time</b>, the <b>duration</b>, an HTTP <b>status badge</b>, and a short <b>description</b>. The Actions column on the right offers <b>View</b> (open the payload viewer) and, when applicable, <b>Rerun</b>.',
      },
      {
        element: '[data-tour="integration-logs-tab"]',
        title: 'Filter Toolbar',
        intro:
          'The filter pills above the table support endpoint, statement id, status type, status code, and a date range. The filters fire live as you type (debounced ~400 ms), so you do not need an Apply button. A <b>Reset filters</b> link appears whenever any filter is active.',
      },
      {
        element: '[data-tour="integration-logs-row"]',
        title: 'Inspect a Row',
        intro:
          'Click <b>View</b> on any row to open the payload viewer. It shows the request headers, the request body (pretty-printed JSON), the response body, and any error trace, each with a copy-to-clipboard button.',
      },
      {
        element: '[data-tour="integration-logs-rerun"]',
        position: 'left',
        title: 'Per-Endpoint Rerun Gate',
        intro:
          'The <b>Rerun</b> button is hidden on rows whose endpoint last failed with a hard auth error (401 or 403) or a payload-shape error (4xx with a structural validation message), because repeating those calls without a configuration change cannot succeed. A tooltip explains why when the button is gated off.',
      },
      {
        element: '[data-tour="integration-logs-tab"]',
        title: 'Audit Users',
        intro:
          'If a DevOps user also has the Audit role (an unusual combination, but supported), the Rerun button is hidden entirely. The rest of the tab remains visible for read-only inspection.',
      },
    ],
  },
};
