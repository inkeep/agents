---
"@inkeep/agents-core": patch
"@inkeep/agents-manage-ui": patch
---

Simplify cache-state reporting to use the real per-call numbers. Removes the "MISS-regression" state: a cache miss is now a single neutral `MISS` instead of an alarming red "possible regression" vs a "miss is expected" split, which depended on a reliable per-call marker_count and a prior-signature cursor that the trace store does not provide. Also stops synthesizing a marker count: the conversation route and the timeline usage resolver now derive the cache state directly from the real `marker_count` (merged from the raw attributes_number bundle) and `cache_read` instead of fabricating `markerCount = 1` when a prefix signature was present — so the badge and the raw "Cache markers" field agree, and a genuine zero-marker call reads as "Skipped". `deriveCacheState` now treats a cache read as a HIT before checking the marker count, since a read is definitive proof of a hit even when the marker numeric was dropped.
