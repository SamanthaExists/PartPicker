# Tool Pick List Tracker

A warehouse tool picking application built with React, TypeScript, and Supabase.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui components
- **Backend**: Supabase (PostgreSQL + real-time subscriptions)
- **State**: React hooks with Supabase real-time sync
- **PWA**: Vite PWA plugin for offline support

## Project Structure

```
src/
├── components/
│   ├── dialogs/          # Modal dialogs (ManageTools, SaveAsTemplate, etc.)
│   ├── layout/           # MainLayout, GlobalSearch
│   ├── picking/          # PickingInterface, LineItemDialog, PrintPickList
│   ├── pwa/              # PWA components (InstallPrompt, UpdatePrompt)
│   └── ui/               # shadcn/ui base components
├── hooks/                # Custom React hooks for data fetching
│   ├── useOrders.ts      # Order CRUD operations
│   ├── usePicks.ts       # Pick recording and history
│   ├── useLineItems.ts   # Line item management
│   ├── useIssues.ts      # Issue reporting
│   └── ...
├── lib/
│   ├── supabase.ts       # Supabase client configuration
│   ├── excelParser.ts    # Excel/CSV import parsing
│   ├── excelExport.ts    # Excel export functionality
│   └── utils.ts          # Utility functions (cn, formatDate, etc.)
├── pages/                # Route components
│   ├── Dashboard.tsx     # Home dashboard with stats
│   ├── Orders.tsx        # Order list with filters
│   ├── OrderDetail.tsx   # Single order view with picking
│   ├── Import.tsx        # Excel/CSV import wizard
│   └── ...
└── types/                # TypeScript type definitions
```

## Key Features

- **Order Management**: Create, import, and track sales orders
- **Multi-Tool Support**: Orders can have multiple tools, each with independent picking
- **Picking Interface**: Touch-optimized with swipe gestures on mobile
- **Real-time Sync**: Changes sync across devices via Supabase
- **Offline Support**: PWA with service worker for offline picking
- **Excel Import/Export**: Import orders from Excel, export pick lists
- **Issue Tracking**: Report and track picking issues per line item
- **Parts Catalog**: Maintain a catalog of parts with locations

## Database Schema (Supabase)

Main tables:
- `orders` - Sales orders with SO number, customer, dates
- `tools` - Tools within orders (e.g., "3137-1", "3137-2")
- `line_items` - Parts to pick (part_number, qty_per_unit, location)
- `picks` - Pick records (who picked what, when)
- `issues` - Reported issues (shortage, damage, wrong_part)
- `parts_catalog` - Master parts list with descriptions/locations
- `bom_templates` - Saved bill of materials templates

## Commands

```bash
npm run dev      # Start dev server (Vite)
npm run build    # Production build
npm run preview  # Preview production build
```

## Environment Variables

Copy `.env.example` to `.env` and configure:
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

## Mobile Considerations

The app is optimized for warehouse use on mobile devices:
- Minimum 48px touch targets for gloved hands
- Swipe-to-pick gestures in picking interface
- Safe area support for notched devices
- Collapsible search on mobile header
- Responsive layouts with mobile-first approach
- Fixed bottom action bars with safe-area-bottom padding

## Code Patterns

### Adding a new hook
Hooks in `src/hooks/` follow a pattern of:
1. Using Supabase client from `@/lib/supabase`
2. Managing loading/error states
3. Subscribing to real-time changes where appropriate
4. Returning data + mutation functions

### Adding UI components
UI components use shadcn/ui patterns:
1. Base components in `src/components/ui/`
2. Use `cn()` utility for conditional classes
3. Use Tailwind responsive prefixes (sm:, md:, lg:)
4. Touch-friendly sizes available: `touch`, `touch-lg`, `touch-xl`

### Mobile-responsive patterns
- Use `flex-col sm:flex-row` for stacking on mobile
- Use `hidden sm:inline` for text that hides on mobile (icon-only)
- Use `overflow-x-auto scrollbar-hide` for horizontal scroll areas
- Use `flex-shrink-0` on items that shouldn't compress

## Key Page Logic

### Items to Order Page (`/items-to-order`)

Shows parts that have **insufficient stock** to complete active orders. This includes:
- **Out of Stock**: `qty_available = 0`
- **Low Stock**: `qty_available > 0` but less than remaining quantity needed

**Logic** (`src/hooks/useItemsToOrder.ts`):
1. Fetch all line items from active orders (not complete/cancelled)
2. Calculate `remaining = total_qty_needed - total_picked` for each
3. Filter to items where `qty_available < remaining` (not enough stock)
4. Group by part number, aggregating across orders
5. Calculate `qty_to_order = remaining - qty_available`

**Key fields in `ItemToOrder` type**:
- `remaining`: Total quantity still needed to pick (across all orders)
- `qty_available`: Current stock on hand
- `qty_to_order`: How many we need to order (`remaining - qty_available`)

### Inventory Sync (`src/hooks/useInventorySync.ts`)

Updates `qty_available` on line items from external Excel inventory files:
1. Parse Excel with columns: Product ID, Lot ID, Location, Qty Available
2. Skip certain locations (AWAITING INSPECTION, QA, QUARANTINE)
3. Keep only newest lot per part (highest Lot ID)
4. Update all line_items with matching part numbers

## Scripts

Utility scripts in `scripts/` for database operations:
- `import-excel.mjs` - Import orders from Excel files
- `check-orders.mjs` - Debug order data
- `verify-picks.mjs` - Verify pick data integrity
