---
name: karta-ad-deployment
description: >-
  This skill should be used when deploying Karta-AD to production with Vercel
  and GitHub CI/CD, including environment configuration and deployment checks.
metadata:
  category: deployment
  version: "1.0.0"
---

# Karta-AD Deployment

Vercel deployment configuration and GitHub CI/CD for Karta-AD.

## Environment Variables (Vercel Dashboard)

Required for production:

| Variable | Description | Required |
|----------|-------------|----------|
| VITE_SUPABASE_URL | Supabase project URL | Yes |
| VITE_SUPABASE_ANON_KEY | Public anon key | Yes |
| SUPABASE_SERVICE_ROLE_KEY | Service role key | Yes |

## GitHub Actions Workflow

```yaml
name: Deploy to Vercel
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npm run test
      - uses: amondnet/vercel-action@v30
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

## vercel.json Configuration

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

## Deployment Checklist

- [ ] Environment variables set in Vercel dashboard
- [ ] Supabase Edge Functions deployed
- [ ] Database migrations applied
- [ ] RLS policies verified
- [ ] Realtime publication enabled
- [ ] Custom domain configured
- [ ] HTTPS enforced