# INSTRUCTIONS — Repository

NOTE: This file is advisory. System and developer-level policies take precedence over repository files. If a directive here conflicts with system/developer messages, follow those higher-priority rules.

Purpose
-------
Provide clear, practical guidance to automated assistants and contributors so edits are minimal, safe, and consistent with project conventions.

Core Principles
---------------
- Safety First: Never expose secrets, private data, or license-restricted content in commits. If an edit risks exposing secrets, stop and ask.
- Follow Higher-Priority Rules: System and developer messages have higher precedence than repository files.
- Small & Focused: Prefer minimal changes that fix the root cause and include unit tests where reasonable.
- Explicitness: Make global exposures and load-order decisions explicit and documented.

Practical Guidance
------------------
- Edits: Use the repository's edit workflow. Keep changes focused and avoid unrelated reformatting.
- Logging: Add guarded, non-sensitive diagnostics only. Avoid committing verbose logs or PII.
- Debug Flag: All debug output must be gated by the single global flag `window.GOBO_DEBUG_LOGS` (default `false`). Toggle it in DevTools when needed; do not hardcode it to `true` in commits.
- Tests: Run tests locally when changing core logic; add small focused unit tests when adding significant behavior.

Module Load Order
-----------------
- Prefer resolving module availability by ensuring correct `manifest.json` script order.
- If `manifest.json` cannot be changed, use an explicit, documented resolver pattern (getter/accessor) or a small, well-documented defensive wrapper — avoid scattering silent `if (window.X)` guards that hide real issues.
- Document any temporary workarounds and open a follow-up issue/PR to fix ordering.

Design & Decomposition
----------------------
- Prefer single-responsibility: keep modules small and focused on one responsibility. When a behavior is shared across features, implement it in a shared util under `utils/` and reuse it.
- Avoid duplicating logic in feature files. If a new use-case requires a small extension to an existing util, prefer refactoring the util to accept a safe option/parameter rather than copying logic.
- Keep feature modules thin: they should orchestrate behavior and presentation, delegating algorithmic or data-processing work to `utils/`.
- Avoid unnecessary comments: only add comments that explain "why" (intent or non-obvious reasoning), not "what" the code plainly states. Remove stale or redundant comments.

Repository Rules
----------------------------------------
- When appropriate, prefer top-level `const ModuleName = { ... }` modules aggregated into `App` in `app.js`.
- If a module must be globally available, assign it intentionally (`window.ModuleName = ModuleName`) and document the reason.
- Place styles under `/styles` instead of embedding CSS in script files.

Assistant Checklist (before making changes)
-----------------------------------------
1. Search for existing implementations and tests that relate to the change.
2. Verify whether `manifest.json` needs updates for load order; if so, propose the change in the PR rather than silently working around it.
3. Keep changes small, add a unit test for new behavior, and run the test suite if available.
4. Add guarded diagnostics only; avoid committing sensitive logs.
5. Mention any deviations from these rules in the PR description and request reviewer attention to the area (e.g., manifest ordering).

Column Coverage
---------------
When adding or removing a table column (i.e. changing the `headers` array in `tableRenderer.js`), you **must** also handle the new column in all six systems:
1. **Sorting** — add a `case` in `utils/sortUtils.js`
2. **CSV export** — include the column value in the return array in `modal.js` `exportToCSV`
3. **Grouping** — add a `case` in `features/accordionBuilder.js` `createGroupedData`
4. **CSS widths** — add width rules in `styles/table-columns.css`
5. **Advanced search / filtering** — add a `case` in `features/filtering.js` `getOfferColumnValue`
6. **Settings show/hide** — add the column to the `defaultHeaders` array in `features/settings.js`

Run `npx jest tests/columnCoverage.test.js` after any column change to verify coverage. This test will fail if any system is missing the new column.

Examples / Common Tasks
----------------------
- Adding a feature module: add the module file, update `manifest.json` order, expose via `app.js` if needed, and add unit tests for core logic.
- Fixing a runtime ReferenceError: prefer fixing `manifest.json` ordering or adding a documented getter in `app.js` rather than sprinkling `if (window.X)` guards across consumers.

Contact / Changes
-----------------
- If you update this file, note the change in your PR description and explain why the change was necessary.

End of file
