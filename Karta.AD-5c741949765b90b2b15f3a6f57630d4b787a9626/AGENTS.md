# Karta-AD Development Commands

## Documentation
- [SUPABASE.md](./SUPABASE.md) — Supabase integration, schema, RLS, real-time
- [CONFIGURATION_REPORT.md](./CONFIGURATION_REPORT.md) — Production configuration summary

## Lint and Typecheck

```bash
npm run lint       # ESLint check
npm run lint:fix   # Auto-fix ESLint issues
npm run typecheck  # TypeScript check (tsc -p ./jsconfig.json)
npm run test       # Run tests (vitest)
npm run dev        # Start development server
npm run build      # Build for production
```

## Supabase Commands

```bash
supabase --help                    # List all commands
supabase db query                    # Execute SQL directly
supabase db push                     # Apply migrations
supabase db pull <name> --local      # Generate migration from changes
supabase db advisors                 # Check for security/performance issues
```

## Vercel Commands

```bash
vercel --prod        # Deploy to production
vercel --prebuilt    # Deploy pre-built output
vercel logs <url>    # View deployment logs
```