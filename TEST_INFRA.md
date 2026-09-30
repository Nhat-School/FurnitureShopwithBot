# E2E Test Infra: Furproject

## Test Philosophy
- Opaque-box, requirement-driven. Derives strictly from `ORIGINAL_REQUEST.md`, `PROJECT.md`, and system design specifications.
- Methodology: Category-Partition, Boundary Value Analysis, Pairwise Interaction, and Real-World Workload Testing across 4 distinct tiers.
- Independent validation: Tests interact directly with public HTTP endpoints and database states without coupling to internal function implementations.

## Feature Inventory & Test Target
| # | Feature | Requirement Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) | Tier 4 (Workload) |
|---|---------|-------------------|:-----------------:|:-----------------:|:----------------------:|:-----------------:|
| 1 | F1: Users & Customer Profiles | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 2 | F2: Address Book | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 3 | F3: Persistent Cart | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 4 | F4: Order Linkage | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 5 | F5: Shipments & Payments | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 6 | F6: Google OAuth PKCE | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 7 | F7: Session & Logout | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 8 | F8: Config & Environment | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 9 | F9: Cart APIs | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 10 | F10: Price Immutability Checkout | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 11 | F11: Order History & Addresses | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 12 | F12: Storefront Auth UI | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 13 | F13: Storefront Checkout UI | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test runner: Lightweight Node.js test runner using native `node:test` and `node:assert/strict` requiring zero external npm bloat.
- Location: `tests/e2e/runner.mjs` and tier test modules in `tests/e2e/tier1_feature.test.mjs`, `tests/e2e/tier2_boundary.test.mjs`, `tests/e2e/tier3_cross_feature.test.mjs`, `tests/e2e/tier4_real_world.test.mjs`.
- Execution command: `node tests/e2e/runner.mjs`

## Coverage Thresholds
- Tier 1: ≥ 65 test cases (5 per feature across 13 features)
- Tier 2: ≥ 65 test cases (boundary, invalid input, negative testing)
- Tier 3: ≥ 15 test cases (pairwise interactions: auth + cart + checkout, address switch + order, catalog price change + historical order lookup)
- Tier 4: ≥ 7 end-to-end realistic user scenarios
- Total Target: ≥ 150 test cases
