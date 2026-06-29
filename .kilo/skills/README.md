# Karta-AD Skills

Specialized skills for the Karta-AD public transport application.

## Available Skills

| Skill | Description |
|-------|-------------|
| `karta-ad-maps` | OpenStreetMap, Leaflet, and OSRM integration |
| `karta-ad-transport` | Transport domain logic (routes, schedules, stops) |
| `karta-ad-gps` | GPS tracking and geolocation features |
| `karta-ad-supabase` | Supabase database schema and RLS policies |
| `karta-ad-realtime` | Realtime subscriptions for vehicle positions |
| `karta-ad-deployment` | Vercel and GitHub deployment configuration |

## Loading Skills

Skills are automatically loaded from `.kilo/skills/` directory. Each skill consists of:

- `SKILL.md` - Main skill documentation (required)
- `references/` - Detailed reference files
- `scripts/` - Executable utilities
- `assets/` - Templates and static assets

## Usage

Skills are referenced in `.kilo/kilo.json` under the `skills` key.