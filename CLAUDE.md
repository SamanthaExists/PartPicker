# Tool Pick List Tracker - Angular App

> **IMPORTANT: Keep this Angular app feature-identical to the React app (Pick App).** Any new features, bug fixes, or changes made to the React version should be mirrored here. The React app is the primary implementation - this Angular version serves as a secondary/alternative implementation using a different framework stack.

A warehouse tool picking application built with Angular and Bootstrap.

## Hosting & Infrastructure

### Production URLs
| Service | URL |
|---------|-----|
| **React App (Primary)** | https://partpick.netlify.app |
| **GitHub Repo** | https://github.com/Jbcox1988/PartPicker.git |

### Supabase (Backend/Database)
- **Project URL**: https://uewypezgyyyfanltoyfv.supabase.co
- **Dashboard**: https://supabase.com/dashboard/project/uewypezgyyyfanltoyfv
- **Project Ref**: `uewypezgyyyfanltoyfv`
- **Features Used**: PostgreSQL, Real-time subscriptions, Row Level Security

**Note**: This Angular app shares the same Supabase backend as the React app.

### Environment Variables
Required environment variables in `src/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  supabaseUrl: 'https://uewypezgyyyfanltoyfv.supabase.co',
  supabaseAnonKey: '<your-anon-key>'
};
```

## Tech Stack

- **Frontend**: Angular 17+ (standalone components)
- **Styling**: Bootstrap 5 + Bootstrap Icons
- **Backend**: Supabase (PostgreSQL + real-time subscriptions)
- **State**: Angular services with RxJS BehaviorSubjects
- **Excel Processing**: xlsx library

## Project Structure

```
src/
├── app/
│   ├── components/
│   │   ├── dialogs/             # Modal dialogs
│   │   ├── layout/              # Layout components
│   │   ├── picking/             # Picking UI components
│   │   └── pwa/                 # PWA support
│   ├── directives/              # Custom directives (keyboard navigation, swipe gestures)
│   ├── models/
│   │   └── index.ts             # TypeScript interfaces for all data types
│   ├── services/
│   │   ├── supabase.service.ts      # Supabase client wrapper
│   │   ├── orders.service.ts        # Order CRUD operations
│   │   ├── picks.service.ts         # Pick recording and history
│   │   ├── line-items.service.ts    # Line item management
│   │   ├── issues.service.ts        # Issue reporting
│   │   ├── consolidated-parts.service.ts  # Consolidated parts view
│   │   ├── parts-catalog.service.ts      # Parts master list
│   │   ├── bom-templates.service.ts      # Template management
│   │   ├── excel.service.ts         # Excel import/export
│   │   ├── inventory-sync.service.ts    # Inventory syncing
│   │   ├── global-search.service.ts     # Search functionality
│   │   ├── offline.service.ts       # Offline support
│   │   ├── settings.service.ts      # User settings
│   │   ├── part-list-sync.service.ts    # Parts list synchronization
│   │   └── utils.service.ts         # Utility functions
│   ├── pages/
│   │   ├── dashboard/           # Home dashboard with stats
│   │   ├── orders/              # Order list with filters
│   │   ├── order-detail/        # Single order view with picking
│   │   ├── consolidated-parts/  # Cross-order parts view
│   │   ├── items-to-order/      # Parts needing to be ordered
│   │   ├── issues/              # Issue tracking
│   │   ├── import/              # Excel/CSV import wizard
│   │   ├── activity/            # Activity log
│   │   └── settings/            # User settings
│   ├── app.component.ts         # Root component with navigation
│   └── app.routes.ts            # Route definitions
├── environments/                # Environment configuration
└── main.ts                      # Application bootstrap
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
- **Offline Support**: Service worker for offline picking
- **Excel Import/Export**: Import orders from Excel, export pick lists
- **Issue Tracking**: Report and track picking issues per line item
- **Undo Audit Trail**: When picks are undone, the pick is marked as undone (via `undone_at` and `undone_by` fields) but remains in the `picks` table for history. A snapshot is also saved to `pick_undos` for backwards compatibility. Undone picks are excluded from quantity calculations but visible in pick history with a "Deleted" indicator
- **Parts Catalog**: Maintain a catalog of parts with locations
- **BOM Templates**: Save and reuse bill of materials templates

## Database Schema (Supabase)

Main tables:
- `orders` - Sales orders with SO number, customer, dates, status
- `tools` - Tools within orders (e.g., "3137-1", "3137-2")
- `line_items` - Parts to pick (part_number, qty_per_unit, location)
- `picks` - Pick records (who picked what, when, for which tool, plus undone_at/undone_by for soft-delete)
- `pick_undos` - Audit trail of undone picks (denormalized snapshots with part_number, tool_number, so_number, undone_by)
- `issues` - Reported issues (out_of_stock, damaged, wrong_part, other)
- `parts_catalog` - Master parts list with descriptions/locations
- `bom_templates` - Saved bill of materials templates
- `bom_template_items` - Items in BOM templates

## Commands

```bash
npm install          # Install dependencies
ng serve             # Start dev server (localhost:4200)
ng build             # Production build
ng build --watch     # Build with watch mode
```

## Mobile Considerations

The app is optimized for warehouse use on mobile devices:
- Minimum 48px touch targets for gloved hands
- Swipe-to-pick gestures in picking interface
- Safe area support for notched devices
- Collapsible search on mobile header
- Responsive layouts with mobile-first approach
- Fixed bottom action bars with safe-area-bottom padding

## Code Patterns

### Services
Services in `src/app/services/` use:
- BehaviorSubjects for reactive state
- Supabase real-time subscriptions for live updates
- Async/await for database operations
- Error handling with user-friendly messages

### Components
Components use Angular standalone component pattern:
- Bootstrap for styling (no component library)
- Direct service injection
- OnPush change detection where appropriate
- Reactive forms for user input

### Mobile-responsive patterns
- Use Bootstrap responsive utilities (`d-none d-md-block`, etc.)
- Use `flex-column flex-sm-row` for stacking on mobile
- Use Bootstrap Icons with appropriate sizing
- Use `overflow-auto` for scrollable areas

### Checkbox styling (styles.css)
In the `@media (pointer: coarse)` block for touch devices:
- `.form-check` uses flexbox with `align-items: center` to properly align checkbox and label
- `.form-check-input` has `margin-top: 0` to prevent Bootstrap's default offset
- Checkboxes are NOT included in the 48px minimum touch target rule (unlike buttons/inputs) because the oversized invisible hit area causes click alignment issues. The label provides adequate touch target.

## Key Page Logic

### Items to Order Page (`/items-to-order`)

Shows parts that have **insufficient stock** to complete active orders, with a tabbed view:

**Tabs**:
- **Need to Order**: Items where `qty_to_order > 0` (stock + on-order doesn't cover remaining need)
- **On Order**: Items where `qty_on_order > 0` (includes both fully and partially covered items)

Filters (search, order, location, sort) and stats update per active tab.

**Logic** (`ItemsToOrderService` in `consolidated-parts.service.ts`):
1. Fetch all line items from active orders (not complete/cancelled)
2. Calculate `remaining = total_qty_needed - total_picked` for each
3. Skip fully picked items (`remaining <= 0`)
4. Group by part number, aggregating across orders
5. Calculate `qty_to_order = remaining - qty_available - qty_on_order`
6. Split into two observables: `items$` (qty_to_order > 0) and `onOrderItems$` (qty_on_order > 0)

**Key fields in `ItemToOrder` type**:
- `remaining`: Total quantity still needed to pick (across all orders)
- `qty_available`: Current stock on hand
- `qty_on_order`: Quantity already on order from supplier
- `qty_to_order`: How many we still need to order (`remaining - qty_available - qty_on_order`)

### Inventory Sync

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

## Data Flow

1. **Orders** contain multiple **Tools** (the actual units being built)
2. **LineItems** are parts needed for an order
3. **Picks** record when parts are picked for specific tools
4. Progress is calculated by counting completed line items (parts), not individual quantities. A line item counts as complete when `total_picked >= total_qty_needed`. Progress = `completed_parts / total_parts`.

## Routes

- `/` - Dashboard
- `/orders` - Order list
- `/orders/:id` - Order detail with picking
- `/parts` - Consolidated parts view
- `/items-to-order` - Parts needing to be ordered
- `/issues` - Issue tracking
- `/import` - Excel/CSV import wizard
- `/activity` - Activity log
- `/pick-history` - Pick history with date/time filtering
- `/settings` - User settings

### Pick History Page (`/pick-history`)

Filter and view all picks and undo events within a specific date/time range. Features:
- **Quick Presets**: Today, Yesterday, This Week, Last 7 Days, This Month, Last 30 Days
- **Custom Range**: Datetime pickers for precise start/end filtering
- **Activity Type Filters**: Toggle visibility of Picks, Issues, and Undos
- **Search Within Results**: Filter by picker name, part number, SO number, location
- **Summary Stats**: Total picks, total quantity, unique parts, unique pickers, undo count
- **Undo Records**: Displayed with red "Undo" badge, shows who undid and who originally picked
- **Export to Excel**: Download filtered results as an Excel file (includes "Undo History" sheet)

## SO Spreadsheet Format

The SO spreadsheets (SO-XXXX.xlsx) should contain:
- Part numbers
- Descriptions
- Quantities per unit
- Location information
- Tool assignments

## Migration from React Version

This Angular version is a complete rewrite of the React application, maintaining the same functionality:

| React | Angular |
|-------|---------|
| React Hooks | Angular Services with RxJS |
| React Router | Angular Router |
| Tailwind CSS | Bootstrap 5 |
| Radix UI | Native Bootstrap components |
| Vite | Angular CLI |
| Custom hooks (useOrders, etc.) | Services (OrdersService, etc.) |
