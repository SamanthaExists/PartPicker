# PartPicker Demo Guide

**Demo URL:** [samanthaexists.github.io/PartPicker/?demo=true](https://samanthaexists.github.io/PartPicker/?demo=true)

This loads the app with realistic sample data — no database connection needed. Everything works: picking, searching, filtering, reports.

## What You're Looking At

PartPicker is a warehouse tool-picking tracker. Workers use it on tablets and phones to:
- See which parts need to be picked for each sales order
- Mark parts as picked (with who picked it and when)
- Track issues (out of stock, wrong part, damaged)
- Manage a parts catalog and bill-of-materials templates

## Features to Try

### 🏠 Dashboard
- **Stats at a glance** — active orders, items picked today, completion rates
- **Due soon alerts** — orders approaching their due date
- **Charts** — picks per day, top pickers leaderboard, 14-day trend

### 📋 Orders
- Click any order to see its picking interface
- Filter by status (Active/Complete/Cancelled)
- Sort by date, customer, progress

### 🔧 Order Detail (Picking Interface)
- **Pick items** — tap the green Pick button next to any part
- **Pick All in Location** — batch pick everything at one shelf location
- **Sort by** part number, location, or assembly group
- **Search** within the order's parts
- **Keyboard shortcuts** — press `?` to see them all
- **When you pick the last item** — 🎉 confetti celebration!
- **Haptic feedback** — vibrates on tablets/phones when you pick

### 🔍 Global Search
- Use the search bar in the sidebar
- Finds parts, orders, templates across everything

### 📷 Barcode Scanner
- Tap the barcode icon in the sidebar
- Uses your device's camera to scan part barcodes
- Works on Chrome Android 88+ (most warehouse tablets)

### 📦 Catalog
- Browse all parts with locations and classifications
- Create new parts, assemblies, and BOM templates
- View part relationships (parent/child assemblies)

### 📊 Other Pages
- **Consolidated Parts** — all parts needed across active orders
- **Items to Order** — parts that need purchasing
- **Issues** — reported problems with resolutions
- **Activity Log** — full audit trail of picks with undo
- **Import** — Excel/CSV import for bulk data
- **Settings** — user name, tag printing, dark mode

## Mobile Tips
- Designed for tablets first (48px touch targets)
- Works on phones too — sidebar collapses to hamburger menu
- Install as PWA: "Add to Home Screen" for app-like experience
- Dark mode available in Settings

---

*Built with Angular 17 + Bootstrap 5 + Supabase. Demo mode uses in-memory mock data.*
