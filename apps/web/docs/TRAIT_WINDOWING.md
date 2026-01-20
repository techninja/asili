# Trait Windowing Optimization

## Problem
The frontend was loading all 655 traits at once, causing:
- High CPU usage during rendering
- Ever-increasing memory footprint
- Poor user experience with lag

## Solution
Implemented a windowed rendering approach with IndexedDB caching:

### 1. Trait Cache Manager (`trait-cache-manager.js`)
- Stores trait metadata in IndexedDB
- Syncs with streamed `trait_manifest.db` data
- Provides fast local access without re-downloading

### 2. Windowed Rendering
- Renders only 50 traits per category initially
- "Load More" button loads next 50 traits on demand
- Lazy loads risk calculations only for visible cards

### 3. Caching Strategy
- First load: Streams from `trait_manifest.db` → caches to IndexedDB
- Subsequent loads: Reads from IndexedDB (instant)
- No network requests after initial cache population

## Performance Benefits
- **Memory**: Only renders visible traits (~50 cards vs 655)
- **CPU**: Reduces initial render time by ~90%
- **Network**: Zero requests after first load
- **UX**: Instant subsequent page loads

## Usage
The optimization is automatic. Users will see:
1. Fast initial load from cache (if available)
2. Progressive loading as they scroll
3. "Load More" buttons to expand categories

## Technical Details
- Window size: 50 traits per category
- Cache database: `asili-trait-cache` (IndexedDB)
- Batch caching: 200ms debounce during streaming
- Risk data: Loaded only for visible cards
