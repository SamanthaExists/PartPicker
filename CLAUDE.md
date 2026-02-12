# Tool Pick List Tracker

> **🚀 ACTIVE DEVELOPMENT**: This project is an Angular application deployed to production.

A warehouse tool picking application built with Angular, Bootstrap, and Supabase.

## Quick Links

| Resource | URL |
|----------|-----|
| **Live App** | https://partpick.netlify.app |
| **GitHub Repo** | https://github.com/Jbcox1988/PartPicker.git |
| **Netlify Dashboard** | https://app.netlify.com/sites/partpick |
| **Supabase Dashboard** | https://supabase.com/dashboard/project/uewypezgyyyfanltoyfv |

## Hosting & Infrastructure

### Supabase (Backend/Database)
- **Project URL**: https://uewypezgyyyfanltoyfv.supabase.co
- **Dashboard**: https://supabase.com/dashboard/project/uewypezgyyyfanltoyfv
- **Project Ref**: `uewypezgyyyfanltoyfv`
- **Features Used**: PostgreSQL, Real-time subscriptions, Row Level Security

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
│   │   ├── auth/                # Password gate & name prompt
│   │   ├── dialogs/             # Modal dialogs
│   │   ├── layout/              # Layout components
│   │   ├── parts/               # Part-related components
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
│   │   ├── part-issues.service.ts   # Part issue reporting system
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
│   │   ├── consolidated-parts/  # Cross-order parts view (Part Picker)
│   │   ├── items-to-order/      # Parts needing to be ordered
│   │   ├── issues/              # Issue tracking
│   │   ├── import/              # Excel/CSV import wizard
│   │   ├── pick-history/        # Pick history with date filtering
│   │   ├── parts-catalog/       # Parts catalog
│   │   ├── templates/           # BOM templates
│   │   └── settings/            # User settings
│   ├── app.component.ts         # Root component with navigation
│   └── app.routes.ts            # Route definitions
├── environments/                # Environment configuration
└── main.ts                      # Application bootstrap
```

## Key Features

### Core Functionality
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
- **Part Classification System**: Type/category badges (Raw Material, Hardware, Purchased Part, Assembly, Sub-Assembly)
- **Assembly Verification**: Hierarchical BOM structure with parent-child relationships

### Recent Features (Angular Branch)
- **Password Gate**: Optional password protection for the app
- **Name Prompt**: User identification for pick tracking
- **Part Issue Reporting**: Dedicated system for reporting part problems
- **Copy Part Numbers**: Quick copy buttons for part numbers in tables
- **Order Details Popover**: Toggle detailed order info in consolidated parts view
- **Enhanced Text Contrast**: Improved readability on colored table rows
- **Date Grouping Fix**: Pick history uses local time instead of UTC

### Undo Audit Trail
When picks are undone, the pick is marked as undone (via `undone_at` and `undone_by` fields) but remains in the `picks` table for history. A snapshot is also saved to `pick_undos` for backwards compatibility. Undone picks are excluded from quantity calculations but visible in pick history with a "Deleted" indicator.

## Database Schema (Supabase)

Main tables:
- `orders` - Sales orders with SO number, customer, dates, status
- `tools` - Tools within orders (e.g., "3137-1", "3137-2")
- `line_items` - Parts to pick (part_number, qty_per_unit, location, type, category, assembly info)
- `picks` - Pick records (who picked what, when, for which tool, plus undone_at/undone_by for soft-delete)
- `pick_undos` - Audit trail of undone picks (denormalized snapshots with part_number, tool_number, so_number, undone_by)
- `issues` - Reported issues (out_of_stock, damaged, wrong_part, other)
- `part_issues` - Part-specific issue reports
- `parts_catalog` - Master parts list with descriptions/locations/classification
- `bom_templates` - Saved bill of materials templates
- `bom_template_items` - Items in BOM templates

## Commands

```bash
npm install          # Install dependencies
ng serve             # Start dev server (localhost:4200)
ng build             # Production build
ng build --watch     # Build with watch mode
```

## Routes

- `/` - Dashboard
- `/orders` - Order list
- `/orders/:id` - Order detail with picking
- `/parts` - Part Picker (cross-order aggregated parts view for picking)
- `/parts-catalog` - Catalog (master parts list and reference data)
- `/items-to-order` - Items needing to be ordered
- `/issues` - Issue tracking
- `/templates` - BOM templates
- `/import` - Excel/CSV import wizard
- `/pick-history` - Pick history with date filtering
- `/settings` - User settings

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

## Deployment

The Angular app is automatically deployed to Netlify when changes are pushed to the `main` branch.

**Build Configuration** (netlify.toml):
- Base Directory: `.` (root of repository)
- Build Command: `npm install && npm run build`
- Publish Directory: `dist/tool-pick-list-tracker/browser`

## History

**February 2026**: Consolidated development. The Angular app is now the sole maintained codebase, deployed to production at https://partpick.netlify.app.
