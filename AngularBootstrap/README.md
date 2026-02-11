# Tool Pick List Tracker - Angular + Bootstrap

A comprehensive application for managing pick lists and tracking picking progress for sales orders.

## Features

- **Dashboard**: Overview of active orders, due dates, items to order, and recent activity
- **Orders Management**: Create, import, edit, and track orders
- **Picking Interface**: Track parts picked for each tool in an order
- **Consolidated Parts View**: See all parts needed across active orders
- **Items to Order**: Track parts needing to be ordered and parts currently on order
- **Issues Tracking**: Report and resolve picking issues
- **Excel Import/Export**: Import orders from Excel, export for offline use

## Tech Stack

- **Frontend**: Angular 17 with standalone components
- **UI Framework**: Bootstrap 5 with Bootstrap Icons
- **Database**: Supabase (PostgreSQL with real-time capabilities)
- **Excel Processing**: xlsx library

## Setup

### 1. Install Dependencies

```bash
cd AngularBootstrap
npm install
```

### 2. Configure Supabase

1. Create a Supabase project at https://supabase.com
2. Run the SQL schema in your Supabase SQL editor (see `src/app/services/supabase.service.ts` for the schema)
3. Update `src/environments/environment.ts` with your Supabase credentials:

```typescript
export const environment = {
  production: false,
  supabaseUrl: 'YOUR_SUPABASE_URL',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY'
};
```

### 3. Run the Application

```bash
npm start
```

Navigate to `http://localhost:4200/`

## Project Structure

```
src/
├── app/
│   ├── models/           # TypeScript interfaces
│   ├── services/         # Angular services for data management
│   │   ├── supabase.service.ts      # Supabase client
│   │   ├── orders.service.ts        # Order CRUD operations
│   │   ├── picks.service.ts         # Pick tracking
│   │   ├── issues.service.ts        # Issue management
│   │   ├── settings.service.ts      # User preferences
│   │   ├── consolidated-parts.service.ts
│   │   ├── line-items.service.ts
│   │   ├── excel.service.ts         # Excel import/export
│   │   └── utils.service.ts         # Utility functions
│   ├── pages/            # Page components
│   │   ├── dashboard/
│   │   ├── orders/
│   │   ├── order-detail/
│   │   ├── consolidated-parts/
│   │   ├── items-to-order/
│   │   ├── issues/
│   │   ├── import/
│   │   └── settings/
│   ├── components/       # Shared components
│   ├── app.component.ts  # Root component with layout
│   └── app.routes.ts     # Application routes
├── environments/         # Environment configuration
└── styles.css           # Global styles
```

## Building for Production

```bash
npm run build
```

The build artifacts will be stored in the `dist/` directory.

## Migration from React Version

This Angular version is a complete rewrite of the React application, maintaining the same functionality:

- React Hooks → Angular Services with RxJS
- React Router → Angular Router with lazy loading
- Tailwind CSS → Bootstrap 5
- Radix UI → Native Bootstrap components
- Vite → Angular CLI

## Database Schema

The application uses the following tables in Supabase:

- `orders` - Sales orders
- `tools` - Tools/units within each order
- `line_items` - Parts to be picked
- `picks` - Pick records (append-only for sync)
- `pick_undos` - Audit trail of undone picks (denormalized snapshots for traceability)
- `issues` - Reported picking issues
- `parts_catalog` - Saved part information
- `bom_templates` - Bill of Materials templates
- `bom_template_items` - Items in BOM templates
