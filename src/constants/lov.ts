export const LOV_TAGS = [
  'SADAD_BILLERS',
  'ATTRIBUTES',
  'SADAD_GOVERNMENT_SERVICES',
  'BANKS',
  'ATTRIBUTE_TRANSFORMATON',
  'ARNBSARI_IPS_REJECTION_CODES',
  'ARNBSARI_TRANSACTION_TYPES',
  'EXTRACTIONS',
  'COUNTRIES',
  'DEMO_USER_COMPS',
  'CARD_TYPES'
] as const;

/** The LOV whose items are post-extraction transformation methods (note the
 *  backend's spelling — no second "I"). Items must be engine-implemented
 *  methods; the LOV Management form restricts the Value to the known set. */
export const TRANSFORMATIONS_LIST_TAG = 'ATTRIBUTE_TRANSFORMATON';
