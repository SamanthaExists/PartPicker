# Tool Pick List Tracker

> **IMPORTANT: This is the PRIMARY implementation.** There is an Angular version (`../AngularBootstrap/`) that should be kept feature-identical to this React app. Any new features, bug fixes, or changes made here should be mirrored to the Angular version.

A warehouse tool picking application built with React, TypeScript, and Supabase.

## Hosting & Infrastructure

### Production URLs
| Service | URL |
|---------|-----|
| **Live App** | https://partpick.netlify.app |
| **GitHub Repo** | https://github.com/Jbcox1988/PartPicker.git |

### Netlify (Frontend Hosting)
- **Project Name**: partpick
- **Production URL**: https://partpick.netlify.app
- **Admin Dashboard**: https://app.netlify.com/projects/partpick
- **Site ID**: `870749d5-40dd-4bfa-8fb6-6d792f53423e`
- **Account**: josh.cox@corvaer.com
- **Team**: josh-cox-1hujq7m's team
- **Build Command**: `npm run build`
- **Publish Directory**: `dist`

### Supabase (Backend/Database)
- **Project URL**: https://uewypezgyyyfanltoyfv.supabase.co
- **Dashboard**: https://supabase.com/dashboard/project/uewypezgyyyfanltoyfv
- **Project Ref**: `uewypezgyyyfanltoyfv`
- **Region**: (check dashboard for region)
- **Features Used**: PostgreSQL, Real-time subscriptions, Row Level Security

### GitHub (Source Control)
- **Repository**: https://github.com/Jbcox1988/PartPicker.git
- **Branch**: `main`
- **Owner**: Jbcox1988

### Environment Variables
Required environment variables (set in Netlify dashboard and local `.env`):
```
VITE_SUPABASE_URL=https://uewypezgyyyfanltoyfv.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### Deployment Workflow
1. Push changes to `main` branch on GitHub
2. Netlify auto-deploys from GitHub (if connected) or run `netlify deploy --prod`
3. PWA service worker updates automatically

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
│   ├── common/           # Reusable UI components (EmptyState, SearchInput, OrderFilterPopover)
│   ├── dialogs/          # Modal dialogs (ManageTools, SaveAsTemplate, etc.)
│   ├── layout/           # MainLayout, GlobalSearch
│   ├── order/            # Order page components (OrderStatusAlerts, OrderInfoCard, PickingSection)
│   ├── picking/          # PickingInterface, LineItemDialog, PrintPickList
│   ├── pwa/              # PWA components (InstallPrompt, UpdatePrompt)
│   └── ui/               # shadcn/ui base components
├── hooks/                # Custom React hooks for data fetching
│   ├── useOrders.ts      # Order CRUD operations
│   ├── usePicks.ts       # Pick recording and history
│   ├── useLineItems.ts   # Line item management
│   ├── useIssues.ts      # Issue reporting
│   ├── useDebouncedValue.ts  # Debounce hook for search inputs
│   ├── useKeyboardNavigation.ts  # Keyboard navigation for lists
│   └── ...
├── lib/
│   ├── supabase.ts       # Supabase client configuration
│   ├── excelParser.ts    # Excel/CSV import parsing
│   ├── excelExport.ts    # Excel export functionality
│   └── utils.ts          # Utility functions (cn, formatDate, alphanumericCompare, etc.)
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
- **Keyboard Navigation**: Arrow keys or j/k to navigate, Enter/Space to pick (desktop)
- **Batch Picking**: "Pick all in location" feature for efficient warehouse operations
- **Low Stock Warnings**: Amber highlighting for items with insufficient stock
- **Hide Completed**: Toggle to hide fully-picked items during picking
- **Real-time Sync**: Changes sync across devices via Supabase
- **Offline Support**: PWA with service worker for offline picking
- **Excel Import/Export**: Import orders from Excel, export pick lists
- **Issue Tracking**: Report and track picking issues per line item
- **Undo Audit Trail**: When picks are undone, a snapshot is saved to `pick_undos` for full traceability (who undid what, when, and who originally picked it)
- **Parts Catalog**: Maintain a catalog of parts with locations

## Database Schema (Supabase)

Main tables:
- `orders` - Sales orders with SO number, customer, dates
- `tools` - Tools within orders (e.g., "3137-1", "3137-2")
- `line_items` - Parts to pick (part_number, qty_per_unit, location)
- `picks` - Pick records (who picked what, when)
- `pick_undos` - Audit trail of undone picks (denormalized snapshots with part_number, tool_number, so_number, undone_by)
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

### Reusable Components (`src/components/common/`)

- **EmptyState**: Consistent empty state display with icon, message, and optional actions
- **SearchInput**: Search input with clear button, supports `large` variant
- **OrderFilterPopover**: Multi-select order filter dropdown with select all/clear

### Order Page Components (`src/components/order/`)

- **OrderStatusAlerts**: Alert banners for completion, cancelled, overdue, due-soon states
- **OrderInfoCard**: Collapsible order information card with inline edit mode
- **PickingSection**: Tool progress pills, filters, and picking interface wrapper

### Utility Hooks (`src/hooks/`)

- **useDebouncedValue**: Debounces rapidly changing values (search inputs)
- **useKeyboardNavigation**: Keyboard navigation for lists (↑/↓ or j/k, Enter/Space, Escape)

## Key Page Logic

### Pick History Page (`/pick-history`)

Filter and view all picks and undo events within a specific date/time range. Features:
- **Quick Presets**: Today, Yesterday, This Week, Last 7 Days, This Month, Last 30 Days
- **Custom Range**: Datetime pickers for precise start/end filtering
- **Activity Type Filters**: Toggle visibility of Picks, Issues, and Undos
- **Search Within Results**: Filter by picker name, part number, SO number, location
- **Summary Stats**: Total picks, total quantity, unique parts, unique pickers, undo count
- **Undo Records**: Displayed with red "Undo" badge, shows who undid and who originally picked
- **Export to Excel**: Download filtered results as an Excel file (includes "Undo History" sheet)

### Items to Order Page (`/items-to-order`)

Shows parts that have **insufficient stock** to complete active orders, with a tabbed view:

**Tabs**:
- **Need to Order**: Items where `qty_to_order > 0` (stock + on-order doesn't cover remaining need)
- **On Order**: Items where `qty_on_order > 0` (includes both fully and partially covered items)

Filters (search, order, location, sort) and stats update per active tab.

**Logic** (`src/hooks/useItemsToOrder.ts`):
1. Fetch all line items from active orders (not complete/cancelled)
2. Calculate `remaining = total_qty_needed - total_picked` for each
3. Skip fully picked items (`remaining <= 0`)
4. Group by part number, aggregating across orders
5. Calculate `qty_to_order = remaining - qty_available - qty_on_order`
6. Split into two lists: `items` (qty_to_order > 0) and `onOrderItems` (qty_on_order > 0)

**Key fields in `ItemToOrder` type**:
- `remaining`: Total quantity still needed to pick (across all orders)
- `qty_available`: Current stock on hand
- `qty_on_order`: Quantity already on order from supplier
- `qty_to_order`: How many we still need to order (`remaining - qty_available - qty_on_order`)

### Inventory Sync (`src/hooks/useInventorySync.ts`)

Updates `qty_available` on line items from external Excel inventory files:
1. Parse Excel with columns: Product ID, Lot ID, Location, Qty Available
2. Skip certain locations (AWAITING INSPECTION, QA, QUARANTINE)
3. Keep only newest lot per part (highest Lot ID)
4. Update all line_items with matching part numbers

## Picking Interface Features

### Keyboard Shortcuts (Desktop)
- `↑` / `k` - Move selection up
- `↓` / `j` - Move selection down
- `Enter` / `Space` - Quick pick selected item
- `Escape` - Clear selection

### Visual Indicators
- **Green background**: Item fully picked for current tool
- **Amber background**: Low stock warning (qty_available < remaining needed)
- **Blue ring**: Keyboard-selected item

### Batch Operations
- **Pick All in Location**: Button in location group headers to pick all remaining items in that location
- **Hide Completed Toggle**: Filter out fully-picked items to focus on remaining work

## Scripts

Utility scripts in `scripts/` for database operations:
- `import-excel.mjs` - Import orders from Excel files
- `check-orders.mjs` - Debug order data
- `verify-picks.mjs` - Verify pick data integrity
