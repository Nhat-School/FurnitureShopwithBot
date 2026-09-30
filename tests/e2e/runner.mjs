#!/usr/bin/env node
import process from 'node:process';
import { performance } from 'node:perf_hooks';

// Color formatting utilities (supports NO_COLOR environment variable)
const useColor = !process.env.NO_COLOR && process.stdout.isTTY !== false;
const colors = {
  reset: useColor ? '\x1b[0m' : '',
  bold: useColor ? '\x1b[1m' : '',
  dim: useColor ? '\x1b[2m' : '',
  green: useColor ? '\x1b[32m' : '',
  red: useColor ? '\x1b[31m' : '',
  yellow: useColor ? '\x1b[33m' : '',
  blue: useColor ? '\x1b[34m' : '',
  magenta: useColor ? '\x1b[35m' : '',
  cyan: useColor ? '\x1b[36m' : '',
  white: useColor ? '\x1b[37m' : '',
  bgRed: useColor ? '\x1b[41m\x1b[37m' : '',
  bgGreen: useColor ? '\x1b[42m\x1b[30m' : '',
};

class E2ETestRunner {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.currentTier = 1;
    this.options = this.parseArgs();
  }

  parseArgs() {
    const args = process.argv.slice(2);
    const opts = {
      tier: null,
      grep: null,
      bail: false,
      verbose: true,
    };

    for (const arg of args) {
      if (arg.startsWith('--tier=')) {
        opts.tier = parseInt(arg.split('=')[1], 10);
      } else if (arg.startsWith('--grep=')) {
        opts.grep = new RegExp(arg.split('=')[1], 'i');
      } else if (arg === '--bail') {
        opts.bail = true;
      } else if (arg === '--quiet') {
        opts.verbose = false;
      }
    }
    return opts;
  }

  setTier(tierNum) {
    this.currentTier = tierNum;
  }

  describe(title, fn, options = {}) {
    const tier = options.tier || this.currentTier;
    const suite = {
      title,
      tier,
      tests: [],
      beforeAllHooks: [],
      afterAllHooks: [],
      beforeEachHooks: [],
      afterEachHooks: [],
    };

    const prevSuite = this.currentSuite;
    this.currentSuite = suite;
    this.suites.push(suite);

    try {
      fn();
    } finally {
      this.currentSuite = prevSuite;
    }
  }

  before(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeAllHooks.push(fn);
    }
  }

  after(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterAllHooks.push(fn);
    }
  }

  beforeEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeEachHooks.push(fn);
    }
  }

  afterEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterEachHooks.push(fn);
    }
  }

  test(name, fn) {
    if (!this.currentSuite) {
      this.describe('Default Suite', () => this.test(name, fn));
      return;
    }
    this.currentSuite.tests.push({
      name,
      fn,
      tier: this.currentSuite.tier,
    });
  }

  it(name, fn) {
    this.test(name, fn);
  }

  async run() {
    console.log(`\n${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}   Furproject E2E Test Suite Runner (Node.js Native Harness)      ${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════${colors.reset}\n`);

    const startTime = performance.now();
    const stats = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
    };

    const tierStats = {
      1: { name: 'Tier 1: Feature Coverage (F1-F13)', total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 },
      2: { name: 'Tier 2: Boundary & Error Conditions', total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 },
      3: { name: 'Tier 3: Cross-Feature Combinations', total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 },
      4: { name: 'Tier 4: Real-World Workload Journeys', total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 },
    };

    for (const suite of this.suites) {
      if (this.options.tier && suite.tier !== this.options.tier) {
        continue;
      }

      console.log(`${colors.bold}${colors.blue}▶ [Tier ${suite.tier}] ${suite.title}${colors.reset}`);
      const suiteStartTime = performance.now();

      // Run beforeAll hooks
      for (const hook of suite.beforeAllHooks) {
        await hook();
      }

      for (const testCase of suite.tests) {
        const fullTestName = `[Tier ${suite.tier}] ${suite.title} > ${testCase.name}`;

        if (this.options.grep && !this.options.grep.test(fullTestName)) {
          stats.skipped++;
          tierStats[suite.tier].skipped++;
          continue;
        }

        stats.total++;
        tierStats[suite.tier].total++;
        const testStartTime = performance.now();

        try {
          // Run beforeEach hooks
          for (const hook of suite.beforeEachHooks) {
            await hook();
          }

          // Run the test
          await testCase.fn();

          // Run afterEach hooks
          for (const hook of suite.afterEachHooks) {
            await hook();
          }

          const testDuration = (performance.now() - testStartTime).toFixed(1);
          stats.passed++;
          tierStats[suite.tier].passed++;
          console.log(`  ${colors.green}✓${colors.reset} ${testCase.name} ${colors.dim}(${testDuration}ms)${colors.reset}`);
        } catch (err) {
          // Run afterEach hooks even on error
          for (const hook of suite.afterEachHooks) {
            try { await hook(); } catch (_) {}
          }

          const testDuration = (performance.now() - testStartTime).toFixed(1);
          stats.failed++;
          tierStats[suite.tier].failed++;
          console.log(`  ${colors.red}✗${colors.reset} ${testCase.name} ${colors.dim}(${testDuration}ms)${colors.reset}`);
          console.log(`    ${colors.red}Error: ${err.message}${colors.reset}`);

          stats.failures.push({
            suiteTitle: suite.title,
            testName: testCase.name,
            tier: suite.tier,
            error: err,
          });

          if (this.options.bail) {
            console.log(`\n${colors.yellow}Bailing out due to failure (--bail enabled).${colors.reset}`);
            break;
          }
        }
      }

      // Run afterAll hooks
      for (const hook of suite.afterAllHooks) {
        try { await hook(); } catch (_) {}
      }

      tierStats[suite.tier].duration += performance.now() - suiteStartTime;
      console.log('');

      if (this.options.bail && stats.failed > 0) {
        break;
      }
    }

    const totalDuration = (performance.now() - startTime).toFixed(1);

    // Summary Reporting
    console.log(`${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}${colors.white}                    E2E TEST SUMMARY STATISTICS                  ${colors.reset}`);
    console.log(`${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════${colors.reset}`);

    console.log(`${colors.bold}${'Tier'.padEnd(42)} ${'Total'.padStart(7)} ${'Pass'.padStart(6)} ${'Fail'.padStart(6)} ${'Rate'.padStart(8)} ${'Time'.padStart(9)}${colors.reset}`);
    console.log(`${colors.dim}──────────────────────────────────────────────────────────────────${colors.reset}`);

    for (const [tierNum, t] of Object.entries(tierStats)) {
      if (this.options.tier && parseInt(tierNum, 10) !== this.options.tier) continue;
      const rate = t.total > 0 ? `${((t.passed / t.total) * 100).toFixed(1)}%` : 'N/A';
      const timeStr = `${t.duration.toFixed(0)}ms`;
      const color = t.failed > 0 ? colors.red : (t.passed > 0 ? colors.green : colors.dim);
      console.log(
        `${t.name.padEnd(42)} ` +
        `${String(t.total).padStart(7)} ` +
        `${String(t.passed).padStart(6)} ` +
        `${String(t.failed).padStart(6)} ` +
        `${rate.padStart(8)} ` +
        `${timeStr.padStart(9)}`
      );
    }

    console.log(`${colors.dim}──────────────────────────────────────────────────────────────────${colors.reset}`);
    const grandRate = stats.total > 0 ? `${((stats.passed / stats.total) * 100).toFixed(1)}%` : '0.0%';
    console.log(
      `${colors.bold}${'Grand Total'.padEnd(42)} ` +
      `${String(stats.total).padStart(7)} ` +
      `${String(stats.passed).padStart(6)} ` +
      `${String(stats.failed).padStart(6)} ` +
      `${grandRate.padStart(8)} ` +
      `${(totalDuration + 'ms').padStart(9)}${colors.reset}`
    );
    console.log(`${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════════${colors.reset}\n`);

    if (stats.failures.length > 0) {
      console.log(`${colors.bold}${colors.red}Failures Detail (${stats.failures.length}):${colors.reset}`);
      stats.failures.forEach((f, idx) => {
        console.log(`\n${colors.bold}${idx + 1}. [Tier ${f.tier}] ${f.suiteTitle} > ${f.testName}${colors.reset}`);
        console.log(`   ${colors.red}${f.error.stack || f.error.message}${colors.reset}`);
      });
      console.log('');
    }

    if (stats.failed === 0 && stats.total > 0) {
      console.log(`${colors.bgGreen}${colors.bold} PASS ${colors.reset} ${colors.green}All ${stats.passed} test cases passed successfully in ${totalDuration}ms!${colors.reset}\n`);
      return true;
    } else {
      console.log(`${colors.bgRed}${colors.bold} FAIL ${colors.reset} ${colors.red}${stats.failed} out of ${stats.total} test cases failed (${totalDuration}ms).${colors.reset}\n`);
      return false;
    }
  }
}

export const runner = new E2ETestRunner();
export const describe = runner.describe.bind(runner);
export const test = runner.test.bind(runner);
export const it = runner.it.bind(runner);
export const before = runner.before.bind(runner);
export const after = runner.after.bind(runner);
export const beforeEach = runner.beforeEach.bind(runner);
export const afterEach = runner.afterEach.bind(runner);

// If executed directly, dynamically import test tier modules and run
if (process.argv[1] === import.meta.filename) {
  (async () => {
    try {
      runner.setTier(1);
      await import('./tier1_feature.test.mjs');
      runner.setTier(2);
      await import('./tier2_boundary.test.mjs');
      runner.setTier(3);
      await import('./tier3_cross_feature.test.mjs');
      runner.setTier(4);
      await import('./tier4_real_world.test.mjs');

      const success = await runner.run();
      process.exit(success ? 0 : 1);
    } catch (err) {
      console.error('Fatal Test Runner Error:', err);
      process.exit(1);
    }
  })();
}
