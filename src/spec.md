# Specification

## Summary
**Goal:** Keep the last known location dot visually anchored to the same geographic coordinate during zoom interactions, and prefer high-accuracy (precise) geolocation with clear guidance when only approximate location is available.

**Planned changes:**
- Fix canvas map zoom/pinch-zoom rendering so the stored last-known location lat/lng projects to a consistent on-screen position relative to map tiles (no dot shifting/jumping), including when GPS tracking is paused.
- Ensure zooming does not implicitly change the stored/used map center coordinate unless the user pans/recenters or a new location update is received in auto-follow mode.
- Update geolocation tracking to request high accuracy where supported (e.g., enableHighAccuracy for watch/refresh reads).
- Add UI messaging when reported accuracy suggests approximate location, explaining how the user can enable Precise Location in OS/browser settings while keeping the app functional with approximate location.

**User-visible outcome:** When zooming in/out (buttons or pinch), the last location dot stays pinned to the same place on the map, and the app requests precise location when possible while showing guidance if the browser only provides an approximate location radius.
