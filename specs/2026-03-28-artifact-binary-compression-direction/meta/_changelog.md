# Changelog

## 2026-03-28

- Initialized spec from the existing binary compression findings document.
- Captured current-state evidence from branch-local implementation and prior investigation.
- Framed the current decision space around tool-call grouping, artifact roles, binary context synthesis, and whether to keep `derivedFrom` in this flow.
- Confirmed that `derivedFrom` should be removed from this binary-artifact flow before merge.
- Confirmed that artifact roles should be inferred initially rather than added as explicit metadata in this iteration.
- Broadened binary descriptor synthesis guidance so it does not depend on MCP block order as a required contract.
