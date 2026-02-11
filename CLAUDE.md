# Tool Pick List Tracker

> **🚀 ACTIVE DEVELOPMENT**: This project uses Angular. See `AngularBootstrap/CLAUDE.md` for full documentation.

A warehouse tool picking application built with Angular, Bootstrap, and Supabase.

## Quick Links

| Resource | URL |
|----------|-----|
| **Live App** | https://partpick.netlify.app |
| **GitHub Repo** | https://github.com/Jbcox1988/PartPicker.git |
| **Netlify Dashboard** | https://app.netlify.com/sites/partpick |
| **Supabase Dashboard** | https://supabase.com/dashboard/project/uewypezgyyyfanltoyfv |

## Project Structure

```
Pick App/
├── AngularBootstrap/        # PRIMARY Angular application (see CLAUDE.md inside)
│   ├── src/app/            # Angular source code
│   ├── angular.json        # Angular CLI configuration
│   └── package.json        # Dependencies
├── supabase/               # Shared Supabase backend
│   ├── migrations/         # Database migrations
│   └── functions/          # Edge functions (Inventory API)
├── netlify.toml            # Netlify deployment config
└── CLAUDE.md               # This file
```

## Development

All development work should be done in the **AngularBootstrap/** directory.

See `AngularBootstrap/CLAUDE.md` for:
- Full project documentation
- Tech stack details
- Development setup
- Database schema
- Feature documentation

## Deployment

The Angular app is automatically deployed to Netlify when changes are pushed to the `main` branch.

**Build Configuration** (netlify.toml):
- Base Directory: `AngularBootstrap`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist/tool-pick-list-tracker/browser`

## Supabase Backend

The Supabase backend (`supabase/` directory) is shared and contains:
- **Database migrations**: PostgreSQL schema and updates
- **Edge Functions**: Inventory API for external integrations
- **Configuration**: Local development settings

For Supabase operations:
```bash
supabase db push                          # Apply migrations
supabase functions deploy inventory-api   # Deploy edge function
```

## History

**February 2026**: Removed deprecated React implementation. Angular is now the sole maintained codebase.

---

For complete documentation, see: **`AngularBootstrap/CLAUDE.md`**
