# Store listing source (canonical)

This is the listing text Jason hand-wordsmiths and pastes into every web store. **It is the single source of truth for listing text and style. Never edit the text between the fences except to paste a new version from Jason.**
`scripts/ci/listing_lint.py` writes a cleaned copy, `docs/store-listing.cleaned.md`, and the pipeline uses only that copy. In the cleaned copy, `### RELEASE NOTES` is rebuilt from `store-listing/release-notes/*.md`, newest first, and the deterministic fixes are applied. See [store-listing-review.md](store-listing-review.md) for the content issues.

Pipeline output:
- AMO: `**bold**` and `### HEADINGS` become `<strong>`, and the `---` lines become blank lines. Sent with PATCH.
- Chrome Web Store and Edge: plain-text paste file (Chrome has no listing API).
- App Store: plain text, at most 4,000 characters. Sent with PATCH when the App Store Connect key is present.

<!-- listing:start -->
<!-- PENDING-VERBATIM-PASTE -->
Paste Jason's listing here, exactly as he wrote it (message t33u, Oct 25, 2026).
<!-- listing:end -->
