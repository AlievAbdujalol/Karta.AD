# UI Layout & Supabase Configuration Fix Plan

## Goal
Resolve Supabase client initialization errors and UI layout issues (overlapping elements, overflow, improper sizing) to create a clean, responsive, and maintainable interface.

## Steps

### 1. Environment & Supabase Configuration
- [ ] Verify `.env.local` exists and contains:
  - `VITE_SUPABASE_URL=https://eotkmnwneivithfkweds.supabase.co`
  - `VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (replace placeholder with actual anon key)
- [ ] Verify `.env.example` contains correct template values.
- [ ] Confirm Supabase project settings:
  - Site URL: `https://karta-ad.vercel.app`
  - Redirect URLs: `https://karta-ad.vercel.app/**`
- [ ] Update `supabase.js` to throw explicit error when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is undefined instead of logging.

### 2. UI Layout Fixes
- [ ] **HomeHeader**: Remove `overflow-hidden` from header card to prevent search dropdown clipping.
- [ ] **SchedulePanel**: 
  - Update `md:left-[412px]` → `md:left-[400px]` to align with sidebar width.
  - Ensure card has `overflow-hidden` to contain content.
- [ ] **BottomSheet**:
  - Desktop sidebar: `top-24` → `top-20` for better vertical alignment.
  - Add `overflow-hidden` to route card containers to prevent overflow.
  - Add `min-w-0` and `truncate` to route card text elements for proper truncation.
  - Fix mobile sheet height: `calc(100dvh - 100px)` to account for bottom navigation.
- [ ] **StopWatcher**: Add `max-w-[260px]` to dropdown container for consistent width.
- [ ] **HomeHeader**: Adjust info pills position to `top-24 md:top-4` to avoid overlap with header.
- [ ] **MapView**: Ensure map container padding and vehicle markers don't overlap.
- [ ] **MapView**: Ensure top bar and route info don't overlap map container.
- [ ] **BottomSheet**: Ensure desktop sidebar width (380px) and position (`left-4`) are consistent with SchedulePanel positioning.
- [ ] **Layout**: Ensure all floating elements have proper `z-index` stacking order to prevent visual layering issues.

### 3. UI Component Containment
- [ ] All route cards (BottomSheet) must have `overflow-hidden` and `min-w-0` on text containers.
- [ ] All panels (SchedulePanel, HomeHeader, BottomSheet) must have `overflow-hidden` or proper scroll containers.
- [ ] Ensure `z-index` hierarchy prevents elements from visually overlapping.

### 4. Testing & Validation
- [ ] Test on desktop (1440px) and mobile (375px) viewports.
- [ ] Verify no horizontal scrollbars appear.
- [ ] Verify route cards stay within their panels.
- [ ] Verify no elements appear "behind" others (z-index conflicts).
- [ ] Verify mobile bottom sheet transitions smoothly and doesn't cover bottom navigation.
- [ ] Verify search dropdown in HomeHeader is fully visible and accessible.

### 8. Final Validation
- [ ] Restart dev server after all `.env` and config changes.
- [ ] Confirm Supabase client initializes without errors.
- [ ] Verify all UI elements are properly contained and responsive.
- [ ] Confirm no console errors appear during normal usage.