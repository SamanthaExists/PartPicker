// Supabase pagination
export const SUPABASE_PAGE_SIZE = 1000;
export const SUPABASE_BATCH_SIZE = 50; // For .in() queries to avoid URL length limits

// localStorage keys
export const STORAGE_KEYS = {
  SETTINGS: 'tool-pick-list-settings',
  SORT_PREFERENCE: 'picking-sort-preference',
  HIDE_COMPLETED: 'picking-hide-completed',
  SHOW_OUT_OF_STOCK: 'picking-show-out-of-stock',
} as const;

// Limits
export const SEARCH_RESULT_LIMIT = 20;
export const ACTIVITY_FEED_LIMIT = 20;
export const PICKS_QUERY_LIMIT = 50000;
