Repository guideline for AI assistants (COPILOT)

Purpose
-------
This file documents repository-specific conventions and expectations for automated code assistants and contributors.

Key rules (short)
-----------------
1. App module exports in `app.js` MUST use bare identifiers (e.g., `AdvancedSearchAddField`) when the defining script is guaranteed to load before `app.js` via `manifest.json` ordering.
2. If load order cannot be guaranteed, use a `get` accessor or a safe runtime resolver, or ensure the module file is listed in `manifest.json` before `app.js`.
3. Avoid writing `...: window.Name` in `app.js` unless intentionally taking a snapshot of the global at manifest load time. Prefer direct `Name` entries for consistency.
4. When adding new feature modules, update `manifest.json` so their script appears before `app.js` in the `content_scripts[js]` array.
5. Prefer top-level `const ModuleName = { ... }` modules that are then merged into `App` in `app.js`.
6. Keep global exposures explicit: write `window.ModuleName = ModuleName;` within the feature file if necessary for runtime access.
7. ALWAYS place styles in CSS under /styles rather than inline
8. Avoid adding defensive runtime null/`if` checks around module usage in consumer modules (for example, avoid `if (window.X) window.X.doThing()` everywhere).
   - Instead, ensure the module is loaded before the consumer by updating `manifest.json` ordering or by defining modules as bare identifiers included in `app.js`.
   - The preferred pattern is to guarantee load order and call module functions directly (e.g., `ModuleName.init()`), not to scatter runtime guards.
   - If you cannot guarantee load order, do not silently wrap calls with `if` checks that hide bugs; either reorder scripts, add a getter in `app.js`, or ask the repo owner for guidance.

Why this matters
-----------------
- Using bare identifiers provides consistent module aggregation in `app.js` and matches project style.
- Ensuring manifest load order avoids runtime ReferenceErrors in content-script environments.
- Silent runtime guards (`if (window.X) { ... }`) can mask load-order bugs and make regressions harder to find. The project prefers manifest-driven ordering and explicit failures so problems surface during development rather than being silently ignored in production.

What to do if you're an assistant
---------------------------------
- Before changing `app.js`, search `manifest.json` and ensure the referenced module file appears earlier in the `js` array. If it doesn't, either reorder `manifest.json` or use a defensive approach (getter or runtime resolver) — but prefer reordering.
- When adding a new feature file, update `manifest.json` accordingly.
- If asked to change load-order-sensitive code but you cannot modify `manifest.json` (permissions), ask for confirmation and explain risks.
- Before adding runtime `if` checks, prefer adjusting `manifest.json` or refactoring so modules are defined as bare identifiers merged into `App`.
- If you must tolerate uncertain load order temporarily, document the risk and propose a follow-up change to fix ordering or use a getter accessor that explicitly documents the deferred resolution.

Example (preferred) in `app.js`
--------------------------------
window.App = {
  ..._prev,
  DOMUtils,
  AdvancedSearch,
  AdvancedSearchAddField,
  ...
};

Manifest ordering note
----------------------
Ensure `features/advancedSearchAddField.js` appears in `manifest.json` before `app.js`.

Contact
-------
If this file needs to be adjusted for new conventions, update it and call out the change in the PR description.
