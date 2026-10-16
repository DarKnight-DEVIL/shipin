# Animation Improvement Plans

| # | Title | Severity | Status |
|---|-------|----------|--------|
| 001 | Throttle ticket mouse move parallax | HIGH | TODO |
| 002 | Fix expand section animation to use transform instead of height | HIGH | TODO |
| 003 | Standardize hero section animation durations to UI budgets | MEDIUM | TODO |
| 004 | Standardize GSAP easing to match CSS tokens | MEDIUM | TODO |
| 005 | Create duration and easing tokens for animation consistency | MEDIUM | TODO |
| 006 | Stop globe updates when reduced motion is enabled | LOW | TODO |

## Recommended Execution Order

1. 002 - Fix expand section animation to use transform instead of height (HIGH impact, addresses performance)
2. 001 - Throttle ticket mouse move parallax (HIGH impact, addresses purpose/frequency)
3. 003 - Standardize hero section animation durations to UI budgets (MEDIUM impact, addresses easing/duration)
4. 004 - Standardize GSAP easing to match CSS tokens (MEDIUM impact, addresses cohesion/tokens)
5. 005 - Create duration and easing tokens for animation consistency (MEDIUM impact, addresses cohesion/tokens)
6. 006 - Stop globe updates when reduced motion is enabled (LOW impact, addresses performance/accessibility)

## Dependencies

- Plan 005 (tokens) should be implemented before or alongside 003 and 004, as they will use the tokens.
- Plan 004 depends on the token values being available (though it can be implemented with hardcoded values that match the tokens, then updated when tokens exist).
- Plan 003 can be implemented independently but will be improved by token usage from plan 005.

## Notes

All plans are written to be self-contained and executable by an agent with zero context. Each plan includes exact values, file paths, and verification steps.