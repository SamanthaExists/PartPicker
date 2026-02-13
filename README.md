# 🔧 PartPicker — Warehouse Pick List Tracker

A production warehouse application for tracking parts picking across sales orders. Built with Angular 17 and Supabase, designed for tablets and mobile devices in manufacturing environments.

**[Live Preview →](https://samanthaexists.github.io/PartPicker/)**

## What It Does

Manufacturing shops receive sales orders that each require specific parts picked from inventory. PartPicker manages this workflow:

1. **Import orders** from Excel — SO#, PO#, customer, tool model, quantities
2. **Track picking** — workers pick parts from bin locations, app tracks progress in real-time
3. **Monitor dashboard** — see active orders, due dates, overdue alerts, picks per day, leaderboard
4. **Manage issues** — report out-of-stock, wrong parts, damaged items
5. **Catalog management** — BOM templates, part relationships, assembly hierarchies

## Features

### Core Workflow
- 📋 **Order management** — create, import (Excel/CSV), edit, complete, cancel
- 📦 **Picking interface** — per-tool picking with assembly groups, location hints, quantity tracking
- 🔍 **Global search** (Ctrl+K) — instant search across parts, orders, locations with keyboard navigation
- 📊 **Dashboard analytics** — picks/day bar chart, top pickers leaderboard, 14-day completion trend (pure SVG, zero dependencies)
- 🖨️ **Print-friendly pick lists** — professional formatting optimized for warehouse paper copies
- ⚠️ **Issues tracking** — out of stock, wrong part, damaged, with resolution workflow

### Mobile & Tablet First
- 📱 **48px touch targets** — designed for gloved hands on dusty tablets
- 📷 **Barcode scanner** — native BarcodeDetector API, rear camera, torch toggle, vibration feedback (Alt+S)
- 🌐 **PWA installable** — add to home screen, offline indicator, background sync
- 🎨 **Responsive layout** — sidebar collapses to backdrop-blur overlay on mobile, iOS zoom prevention

### Professional Polish
- 🎯 **Industrial design system** — teal/amber brand palette, dark navy sidebar, gradient stat cards
- 🌙 **Dark mode** — full dark theme with deeper navy backgrounds, bright accent colors
- ✨ **Micro-animations** — fadeInUp page transitions, pulsing indicators, pick success flash
- ⌨️ **Keyboard shortcuts** — press `?` for help modal, Ctrl+K search, Alt+S scan
- 🔔 **Toast notifications** — non-blocking success/error/warning/info replacing all alert() popups
- 📈 **SVG charts** — bar charts, line charts, leaderboard — zero chart library dependencies

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Angular 17 (standalone components, lazy routing) |
| **UI** | Bootstrap 5 + Bootstrap Icons + custom design system |
| **Database** | Supabase (PostgreSQL + realtime + edge functions) |
| **Excel** | xlsx library (lazy-loaded, only when importing) |
| **Charts** | Pure SVG components (no chart libraries) |
| **Scanner** | Native BarcodeDetector API (Chrome Android 88+) |
| **PWA** | Angular Service Worker + Web App Manifest |
| **Hosting** | GitHub Pages (preview) / Netlify (production) |

## Quick Start

```bash
# Install dependencies
npm install

# Configure Supabase (copy and edit)
cp src/environments/environment.example.ts src/environments/environment.ts

# Start dev server
npm start
# → http://localhost:4200/
```

### Environment Setup

Create `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  supabaseUrl: 'YOUR_SUPABASE_URL',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY'
};
```

## Project Structure

```
src/
├── app/
│   ├── components/
│   │   ├── barcode-scanner/    # Camera-based barcode scanning
│   │   ├── charts/             # Pure SVG bar & line charts
│   │   ├── dialogs/            # Modal dialogs (save template, distribute, etc.)
│   │   ├── layout/             # Global search, theme toggle, toast, keyboard help
│   │   ├── parts/              # Part detail, classification badges, exploded BOM
│   │   ├── picking/            # Print pick list, print tag dialog
│   │   ├── pwa/                # Install prompt, update prompt, offline indicator
│   │   └── auth/               # Password gate, name prompt
│   ├── pages/
│   │   ├── dashboard/          # Stats, due-soon, activity, analytics charts
│   │   ├── orders/             # Order list with filtering/sorting
│   │   ├── order-detail/       # Main picking interface (2,100+ lines)
│   │   ├── consolidated-parts/ # Cross-order parts view
│   │   ├── unified-catalog/    # Parts catalog + BOM templates
│   │   ├── items-to-order/     # Purchase needed list
│   │   ├── issues/             # Issue management
│   │   ├── import/             # Excel/CSV import
│   │   ├── pick-history/       # Activity log with undo
│   │   └── settings/           # App configuration
│   ├── services/               # 15+ Angular services (Supabase, orders, picks, etc.)
│   └── models/                 # TypeScript interfaces
├── styles.css                  # Design system v2.0 (1,200+ lines)
└── manifest.webmanifest        # PWA manifest
```

## Build

```bash
# Production build
npm run build

# Build for GitHub Pages
npx ng build --base-href /PartPicker/

# Deploy to GitHub Pages
npx angular-cli-ghpages --dir=dist/tool-pick-list-tracker/browser
```

**Build stats:** ~1.01 MB initial (150 KB compressed), lazy chunks load on demand. The xlsx library (422 KB) only loads when importing Excel files.

## Database Schema

| Table | Purpose |
|-------|---------|
| `orders` | Sales orders (SO#, PO#, customer, tool model, dates, status) |
| `tools` | Individual tools/units within orders |
| `line_items` | Parts to pick (part number, qty, location, assembly group) |
| `picks` | Pick records — append-only for sync reliability |
| `pick_undos` | Audit trail of undone picks (denormalized snapshots) |
| `issues` | Picking issues (out of stock, wrong part, damaged) |
| `parts_catalog` | Part numbers, descriptions, classifications, locations |
| `part_relationships` | Hierarchical BOM — parent/child assemblies |
| `bom_templates` | Reusable bill-of-materials for common tool models |
| `bom_template_items` | Items within BOM templates |
| `activity_log` | Full audit trail |

## Development History

This app evolved through 5 phases of iterative improvement:

1. **Design System Foundation** — CSS custom properties, design tokens, responsive grid
2. **Page Consistency** — 12 pages standardized with unified headers, stat cards, filter bars
3. **Productivity Features** — Toast notifications, print layouts, keyboard shortcuts, dashboard charts
4. **Visual Overhaul** — Industrial brand identity, micro-animations, dark mode, mobile-first
5. **Hardware Integration** — Native barcode scanning, global search (Ctrl+K), PWA install/offline

---

*Built for [Corvaer](https://corvaer.com) manufacturing by a human-AI team.*
