Use when: Phase 1 (Triage) identifies a bug category. Load the relevant section.
Priority: P0
Impact: Without category-specific playbooks, the agent uses generic investigation and misses category-specific shortcuts that dramatically accelerate diagnosis.

# Bug Category Triage Playbooks

Each section below is a diagnostic decision tree for a specific bug category. Follow the tree from START, branching based on what you observe. The trees encode the most efficient investigation path for each category based on where bugs in that category are most commonly found.

---

## §1 Build / Compilation Failures

**Key principle:** Cascade errors are the norm. The first error is almost always the only one that matters; subsequent errors are downstream noise.

```
START
  |
  v
[Read the build/compiler output]
  |
  v
[Find the FIRST error message — ignore everything after it]
  |
  v
[Classify the first error]
  |
  +-- Syntax error?
  |     |-> Read the indicated line AND the line above it
  |     |-> Common causes: missing closing brace/paren on previous line,
  |     |   missing semicolon, unclosed string literal, stray character
  |     |-> Fix -> rebuild -> reassess from the new first error
  |
  +-- Import / module-not-found?
  |     |-> Check 1: Does the file/module actually exist? (glob for it)
  |     |-> Check 2: Is the import path correct? (relative vs absolute)
  |     |-> Check 3: Is the dependency installed? (check package.json,
  |     |   requirements.txt, go.mod, Cargo.toml)
  |     |-> Check 4: Version mismatch? (dependency requires different
  |     |   version of a transitive dep)
  |     |-> Fix -> rebuild -> reassess
  |
  +-- Type error at build time? (TypeScript, Rust, Go, Java)
  |     |-> Jump to §5 (Type Errors)
  |
  +-- Linker error?
  |     |-> Check: missing library, wrong library version, symbol not
  |     |   exported, duplicate symbols
  |     |-> Trace the undefined symbol back to its source package
  |     |-> Check: is the library installed? Correct version? Correct
  |     |   build flags? Architecture mismatch (x86 vs ARM)?
  |     |-> Fix -> rebuild -> reassess
  |
  +-- Configuration / toolchain error?
  |     |-> Check build config (tsconfig, webpack, vite, Cargo,
  |     |   Makefile, CMakeLists, etc.)
  |     |-> Compare against known-good config (git diff or reference)
  |     |-> Jump to §9 (Configuration Issues)
  |
  v
[If first-error fix didn't resolve everything]
  |-> Rebuild and repeat with the NEW first error
  |-> After 3 cycles with no progress: try a clean build
  |     (delete build artifacts, node_modules, .cache, target/, etc.)
  |-> After clean build still fails: check environment (§9)
```

**Heuristic:** Fix one error at a time, always the first one. Rebuild after each fix. Resist the urge to fix multiple errors simultaneously — they are likely cascading.

**When to try a clean build:** After 2-3 fix-rebuild cycles with no progress, OR when errors reference generated/cached files, OR after major dependency changes.

**Exit:** You've identified the first real error and its cause (syntax, import, type, linker, or config). Return to SKILL.md Phase 2 with the error location and category to continue the workflow.

---

## §2 Runtime Exceptions / Crashes

**Key principle:** The stack trace is the primary artifact. Parse it systematically — don't scan it casually.

```
START
  |
  v
[Capture the full error message + stack trace]
  |
  v
[Parse the stack trace — extract structured data]
  |  - Exception type (NullPointerException, TypeError, SegFault, etc.)
  |  - Error message text
  |  - Each frame: file, line number, function name
  |  - For chained exceptions: find the root "Caused by:"
  |
  v
[Find the first frame in YOUR code]
  |  - Skip framework/library frames (node_modules, stdlib, vendor/)
  |  - For "Caused by:" chains: start from the innermost cause
  |  - This is your primary investigation point
  |
  v
[Read the code at that line + surrounding context (30 lines)]
  |
  v
[Classify the exception type]
  |
  +-- Null / undefined reference?
  |     |-> Trace the variable backward: where was it assigned?
  |     |-> Check: uninitialized? Failed lookup? Missing return value?
  |     |-> Check: conditional path that skips assignment?
  |     |-> Check: async operation that hasn't resolved yet?
  |
  +-- Type error (runtime)?
  |     |-> What type was expected vs. received?
  |     |-> Trace the value backward through the call chain
  |     |-> Check: API response shape changed? Serialization issue?
  |     |-> Jump to §5 for deep type tracing
  |
  +-- Index out of bounds / key error?
  |     |-> What is the actual size/contents of the collection?
  |     |-> Trace the index value: is it computed correctly?
  |     |-> Check: off-by-one? Empty collection not guarded?
  |
  +-- Permission / access error?
  |     |-> File permissions? Network access? Auth tokens expired?
  |     |-> Jump to §9 (Configuration/Environment)
  |
  +-- Out of memory / stack overflow?
  |     |-> Stack overflow: look for infinite recursion (missing base case)
  |     |   Search for the recursive function, verify base case logic
  |     |-> OOM: look for unbounded data accumulation, leaked references
  |     |   Check: growing collections in loops, event listener leaks,
  |     |   unclosed streams/connections, large file reads without streaming
  |
  v
[If crash is in framework/library code with no user frames]
  |-> The bug is in how you CALL the framework, not the framework itself
  |-> Check: wrong arguments, wrong initialization order, missing config,
  |   lifecycle method violations
  |-> Read the framework's error message carefully — good frameworks
  |   tell you what they expected
  |
  v
[If root cause isn't clear from the stack trace]
  |-> Add logging ABOVE the crash point to capture input state
  |-> Check recent changes: git diff HEAD~5 -- <file>
  |-> Reproduce with minimal input to isolate the trigger
```

**Frame selection heuristic — most relevant frames in a stack trace:**

1. The first frame in your own code (most likely bug location)
2. The frame just above it (the caller that passed bad data)
3. The deepest "Caused by" frame (root cause in chained exceptions)

**When to trace backward vs. check recent changes:**

- Trace backward (up the call stack) when: the error is a data issue (null, wrong type, bad value) — the bug is in whoever produced that data
- Check recent changes when: the code was working before and inputs haven't changed, OR the stack trace points to code that hasn't been modified recently

**Exit:** You've identified the primary frame in your code, the exception category, and the likely data source. Return to SKILL.md Phase 2 to build your mental model of expected vs. actual behavior.

---

## §3 Test Failures

**Key principle:** Before fixing anything, determine whether the TEST is wrong or the CODE is wrong. This changes your entire approach.

```
START
  |
  v
[Read the test failure output]
  |  - Which test(s) failed?
  |  - What was expected vs. actual?
  |  - Is there a stack trace (crash) or an assertion failure (wrong value)?
  |
  v
[If test CRASHES (exception, not assertion failure)]
  |-> This is a runtime error, not a logic error
  |-> Jump to §2 (Runtime Exceptions)
  |
  v
[For assertion failures: analyze expected vs. actual]
  |
  v
[DECISION: Is the test wrong, or is the code wrong?]
  |
  |  Apply these checks IN ORDER:
  |
  |  1. Was the test recently modified? (git log -1 -- <test_file>)
  |     If yes -> suspect the test first
  |
  |  2. Was the code-under-test recently modified?
  |     If yes -> suspect the code first (likely regression)
  |
  |  3. Is this a new test for new functionality?
  |     If yes -> both are suspect; verify test logic first
  |
  |  4. Did the test pass in the last CI run / on the main branch?
  |     If yes -> this is a regression from your changes
  |     If no  -> pre-existing failure or test environment issue
  |
  |  5. Does the expected value in the assertion look correct?
  |     Read the test as a specification: does it describe the RIGHT
  |     behavior? Cross-reference with requirements/docs if available.
  |
  v
[If CODE is wrong (regression)]
  |-> git diff main -- <files_under_test>
  |-> Find which change broke it
  |-> Does the expected value still make sense? If so, the code needs fixing (report to implementer)
  |
  v
[If TEST is wrong]
  |-> Outdated assertion? (expected value no longer matches
  |   intentional behavior change)
  |-> Incorrect setup/fixture? (wrong input data)
  |-> Fragile assumption? (order-dependent, timing, floating-point
  |   equality without epsilon)
  |
  v
[If MULTIPLE tests fail]
  |-> Look for a common root cause:
  |     - Shared fixture/setup that broke?
  |     - Single function called by all failing tests?
  |     - Environment/config issue (§9)?
  |-> Group failures by the function they test, not by test name
  |
  v
[If ONE test fails intermittently]
  |-> Jump to §6 (Flaky Failures)
```

**Assertion analysis heuristic — when expected != actual, ask:**

- Is the actual value CLOSE to expected? (rounding, floating-point, encoding)
- Is the actual value from a PREVIOUS version? (stale cache, stale test data)
- Is the actual value null/empty when expected is populated? (missing setup)
- Is the actual value a completely different type? (serialization issue)

**Exit:** You've determined whether the test or the code is wrong, and identified the relevant files and changes. Return to SKILL.md Phase 2 to reproduce and comprehend the failure.

---

## §4 "It Worked Before" Regressions

**Key principle:** This is a binary search problem. The bug was introduced in a specific commit. The question is whether `git bisect` is worth the setup cost.

```
START
  |
  v
[Confirm it actually worked before]
  |  - Can you identify a specific commit/tag/release where it worked?
  |  - Is there a test demonstrating the correct behavior?
  |  - If no known-good state: this may not be a regression at all
  |
  v
[DECISION: Use git bisect or manual investigation?]
  |
  |  USE GIT BISECT when:
  |  - You have a clear good commit and bad commit
  |  - There are >10 commits between good and bad
  |  - You have an automated test/script to verify good/bad
  |  - The build is fast enough to test each commit (<5 min)
  |  - You have no strong hypothesis about which change caused it
  |
  |  USE MANUAL INVESTIGATION when:
  |  - There are <10 commits between good and bad
  |  - You have a strong suspicion about which file/change caused it
  |  - The build is slow (>10 min per iteration)
  |  - The failure requires manual verification
  |  - The commit history is messy (many merge commits, reverts)
  |
  +-- [GIT BISECT PATH]
  |     |
  |     |  git bisect start
  |     |  git bisect bad HEAD
  |     |  git bisect good <known_good_commit>
  |     |
  |     |  [With a test script:]
  |     |    git bisect run <test_script.sh>
  |     |    # script exits 0=good, 1-124/126-127=bad, 125=skip
  |     |    # Use exit 125 for commits that don't compile
  |     |
  |     |  [Manually:]
  |     |    At each step: build, test, mark good/bad
  |     |
  |     |  Result: exact introducing commit identified
  |     |  git bisect reset  # return to original state
  |     |
  |     |  Efficiency: log2(n) steps
  |     |    100 commits -> ~7 tests
  |     |    1000 commits -> ~10 tests
  |     |
  |     v
  |   [Examine the identified commit]
  |     |-> git show <commit>
  |     |-> Read the diff — the root cause is usually clear once you know
  |     |   which commit introduced the bug
  |
  +-- [MANUAL INVESTIGATION PATH]
        |
        |  git log --oneline <good>..<bad> -- <suspected_files>
        |  git diff <good>..<bad> -- <suspected_files>
        |
        |  For each suspicious commit:
        |    git stash && git checkout <commit> && test && git checkout -
        |
        v
      [Identify the breaking change — root cause located]
```

**Bisect script heuristic — a good bisect test script should:**

1. Build the project (exit 125 if build fails — tells bisect to skip)
2. Run the specific failing test
3. Exit 0 if test passes, exit 1 if test fails
4. Timeout after reasonable duration (exit 125 on timeout)

**Exit:** You've identified the introducing commit (via bisect or manual investigation). Return to SKILL.md Phase 2 — read the breaking change and continue to Phase 3 with the commit as your primary evidence.

---

## §5 Type Errors

**Key principle:** Type errors are chain problems. The mismatch at the error site is a symptom; the real bug is where the wrong type was introduced upstream.

```
START
  |
  v
[Read the type error message]
  |  - What type was expected?
  |  - What type was received?
  |  - At what location (file:line)?
  |
  v
[Build-time or runtime type error?]
  |
  +-- Build-time (TypeScript, Rust, Java, Go)
  |     |
  |     |  [Read the code at the error location]
  |     |  [Identify the variable/expression with wrong type]
  |     |
  |     |  [Trace backward through the assignment chain:]
  |     |    Where was this variable assigned?
  |     |    -> Function return? Check return type AND actual returns
  |     |    -> Data transformation? Check the transformation logic
  |     |    -> API/external source? Check type def matches actual shape
  |     |    -> Generic type? Check inference — hover/inspect inferred type
  |     |
  |     |  [Common build-time patterns:]
  |     |    - Union type not narrowed (need type guard)
  |     |    - Optional/nullable not checked (need null guard)
  |     |    - Generic inference chose wrong type (need explicit param)
  |     |    - Library type definitions outdated (@types version)
  |     |    - Implicit 'any' hiding real type issues
  |     |
  |     v
  |   [Fix at the earliest point where wrong type is introduced]
  |   [Do NOT cast/suppress at the error site unless you've verified
  |    the actual runtime value is correct and the type system is wrong]
  |
  +-- Runtime (Python, JavaScript, Ruby)
        |
        |  [Add type inspection at the error site:]
        |    print(type(x), repr(x))   # Python
        |    console.log(typeof x, x)  # JavaScript
        |
        |  [Trace the value backward:]
        |    At each step: what type is it? Where does it change?
        |
        |  [Common runtime type error sources:]
        |    - JSON double-encoding (parse returns string, not object)
        |    - API returns different shape than expected
        |    - undefined propagating through operations (JS)
        |    - None returned from function expected to return value (Python)
        |    - String/number confusion from form inputs or env vars
        |
        v
      [Fix: add type validation/conversion at the boundary where
       untrusted data enters your code (API response, user input,
       file parsing, deserialization)]
```

**Type tracing heuristic:**

1. Start at the error site
2. Identify the immediate source of the value (assignment, parameter, return)
3. Jump to that source
4. Repeat until you find where the type diverges from expectation
5. The fix belongs at the divergence point, not the error site

**Exit:** You've traced the type mismatch to its origin point (where the wrong type was introduced). Return to SKILL.md Phase 2 with the divergence location to continue the workflow.

---

## §6 Intermittent / Flaky Failures

**Key principle:** Flaky failures have exactly three root causes: timing/concurrency, shared mutable state (test pollution), or environment differences. Determine which category first.

```
START
  |
  v
[Establish the failure is actually intermittent]
  |  - Run the failing test 10-20 times in isolation
  |  - Record frequency: how many times does it fail?
  |
  v
[Does it ALWAYS pass when run in isolation?]
  |
  +-- YES -> Likely TEST POLLUTION (order dependency)
  |     |
  |     |  [Diagnosis:]
  |     |  - Run the suite with randomized order
  |     |  - Find which other test causes the failure when run first
  |     |  - Look for shared mutable state: global variables, database
  |     |    records, files on disk, environment variables, singletons
  |     |
  |     |  [Fix:]
  |     |  - Add proper setup/teardown to isolate test state
  |     |  - Use transactions that roll back, temp dirs, mocks
  |     |  - Never rely on test execution order
  |
  +-- NO -> Fails even in isolation (sometimes)
        |
        v
      [Correlates with machine load or timing?]
        |
        +-- YES -> Likely RACE CONDITION / TIMING
        |     |
        |     |  [Diagnosis:]
        |     |  - Look for: sleep/timeout waits, shared resources
        |     |    accessed by multiple threads, async operations
        |     |    assumed to complete in a specific order
        |     |  - Check for hardcoded timeouts or polling intervals
        |     |  - Pattern: "set up -> async thing -> assert" without sync
        |     |
        |     |  [Fix:]
        |     |  - Replace sleeps with proper synchronization
        |     |    (events, semaphores, polling with retry + backoff)
        |     |  - Use deterministic ordering where possible
        |     |  - Add proper locking around shared resources
        |
        +-- NO -> Fails randomly regardless of load
              |
              v
            [Fails only on CI / different machine?]
              |
              +-- YES -> ENVIRONMENT ISSUE (jump to §9)
              |
              +-- NO -> Truly random
                    |
                    |  [Less common causes:]
                    |  - Uninitialized memory (C/C++)
                    |  - Hash map iteration order (non-deterministic)
                    |  - Floating-point precision across platforms
                    |  - System clock granularity
                    |  - Random seed not fixed in tests
                    |
                    v
                  [Instrument heavily]
                    |  Log at every state transition
                    |  Compare passing vs failing runs side-by-side
                    |  Find the first point of divergence
```

**Distinguishing signal:**

- **Environment:** consistent failure in one env, consistent pass in another
- **Race condition:** random failures everywhere, sometimes correlated with load
- **Test pollution:** only fails when run after specific other tests

**Exit:** You've classified the flaky failure (timing, test pollution, or environment) and identified the mechanism. Return to SKILL.md Phase 3 — your hypothesis is the classification; test it with the targeted diagnostic from the relevant branch above.

---

## §7 Silent Failures (No Error, Wrong Output)

**Key principle:** The computation diverges from your mental model somewhere in the pipeline. Use binary search on the pipeline to find the divergence point.

```
START
  |
  v
[Define PRECISELY what the expected output should be]
  |  - Write it down explicitly
  |  - If you can't specify the expected output, you can't debug
  |  - Identify the exact input that produces wrong output
  |
  v
[Map the data flow from input to output]
  |  - List every transformation step
  |  - Example: input -> parse -> validate -> transform -> format -> output
  |
  v
[BINARY SEARCH THE PIPELINE]
  |
  |  Check the value at the MIDDLE of the pipeline
  |  (add logging or use a debugger)
  |
  +-- Value correct at midpoint?
  |     |-> Bug is in the second half
  |     |-> Move midpoint forward, repeat
  |
  +-- Value ALREADY wrong at midpoint?
  |     |-> Bug is in the first half
  |     |-> Move midpoint backward, repeat
  |
  v
[Continue until you find the exact step: correct -> wrong]
  |
  v
[Examine that transformation step in detail]
  |  - What does the code do here?
  |  - What are the exact inputs? (log them)
  |  - What is the exact output? (log it)
  |  - Walk through the logic line by line with actual values
  |
  v
[Common silent failure causes:]
  - Off-by-one (fencepost)
  - Wrong comparison operator (< vs <=, == vs ===)
  - Integer division truncation
  - Operator precedence (missing parentheses)
  - Short-circuit evaluation skipping side effects
  - Mutating shared data (one consumer changes what another needs)
  - Shallow copy when deep copy needed
  - String encoding issues (UTF-8, byte vs char)
  - Default argument values being wrong
  - Swapped function arguments
  - Catching and silently swallowing exceptions
```

**Silent failure heuristic:** If you can't map the data pipeline clearly, the architecture itself may be the problem. Create a written trace of the expected data flow first. Any step you're unsure about is the most likely bug location.

**Exit:** You've found the exact pipeline step where correct input produces wrong output. Return to SKILL.md Phase 3 with this step as your investigation target.

---

## §8 Performance Regressions

**Key principle:** Don't profile blindly. Form a hypothesis first, then profile to confirm or deny it.

```
START
  |
  v
[Quantify the regression]
  |  - What was performance before? What is it now?
  |  - Be specific: "200ms -> 800ms", not "it feels slow"
  |  - Is it latency, throughput, memory, or CPU?
  |
  v
[Can you identify WHEN it regressed?]
  |
  +-- YES -> This is a git bisect problem (§4)
  |     |  Once you find the commit, the fix is usually obvious
  |
  +-- NO (gradual degradation or unknown timeline)
        |
        v
      [Form a hypothesis BEFORE profiling]
        |
        |  Common hypotheses (check in this order):
        |  1. Data volume grew (N increased, O(n^2) now hurts)
        |  2. New code path added (extra DB query, API call, etc.)
        |  3. Caching disabled or cache hit rate dropped
        |  4. Resource contention (locks, connection pool exhaustion)
        |  5. External dependency slowed (DB, API, network)
        |  6. Memory pressure causing GC thrashing
        |
        v
      [Test with targeted measurement]
        |  - H1: Log sizes of key data structures
        |  - H2: Time individual operations with timestamps
        |  - H3: Check cache hit/miss metrics
        |  - H4: Check connection pool stats, lock contention
        |  - H5: Time external calls independently
        |  - H6: Monitor GC frequency and pause times
        |
        v
      [Hypothesis confirmed -> optimize that specific area]
      [Hypothesis denied -> profile to find the real hotspot]
        |
        |  Profiling approach:
        |  1. CPU: flame graph comparing before/after
        |     Look for: new tall stacks, widened existing stacks
        |  2. Memory: heap snapshot comparison
        |     Look for: new large allocations, growing object counts
        |  3. I/O: trace system calls, network requests
        |     Look for: new blocking calls, increased call counts
        |
        v
      [Focus on DIFFERENCES from baseline, not absolute values]
```

**Most common performance regression causes:**

1. Algorithmic complexity increase (O(n) to O(n^2)) — nested loops over growing data
2. N+1 query problems — DB/API calls inside loops
3. Missing or broken caching
4. Synchronous operations that should be async/parallel
5. Excessive logging or serialization in hot paths

**Exit:** You've identified the performance hotspot (either via bisect or targeted profiling). Return to SKILL.md Phase 3 with the specific area to investigate — form a hypothesis about why that area regressed.

---

## §9 Configuration / Environment Issues

**Key principle:** Systematic comparison between working and failing environments. Every difference is a suspect until eliminated.

```
START
  |
  v
[Does the same code work in a different environment?]
  |  - Works locally, fails on CI?
  |  - Works on machine A, fails on machine B?
  |  - Works in dev, fails in staging?
  |
  v
[Systematic comparison — check in this order:]
  |
  |  LAYER 1: Runtime versions
  |  - Language version (node --version, python --version, etc.)
  |  - Package versions (diff lock files between environments)
  |  - OS and architecture (x86 vs ARM, Linux vs macOS)
  |
  |  LAYER 2: Environment variables
  |  - Compare env vars (printenv | sort)
  |  - Check for: missing vars, different values, extra vars
  |  - Common culprits: PATH, HOME, LANG/LC_*, TZ, proxy settings
  |
  |  LAYER 3: File system
  |  - Permissions (especially on CI runners)
  |  - Path separators (Windows vs Unix)
  |  - Case sensitivity (macOS default is case-insensitive)
  |  - Temp directory location and permissions
  |  - Available disk space
  |
  |  LAYER 4: Network
  |  - DNS resolution
  |  - Proxy / firewall settings
  |  - TLS certificate stores
  |  - Available ports
  |
  |  LAYER 5: Configuration files
  |  - Diff config files between environments
  |  - Check for: .env files, config overrides, feature flags
  |  - Environment-specific config not in version control
  |
  v
[For each difference found:]
  |  Make the failing environment match the working one
  |  for this specific variable. Test.
  |  If it fixes -> document the requirement
  |  If not     -> eliminate this variable, move to next
```

**80% of "works on my machine" bugs are caused by:**

1. Different dependency versions (especially transitive)
2. Missing environment variables
3. Different OS behavior (filesystem, line endings, paths)
4. Different available system resources (memory, file handles)

**Exit:** You've identified the environmental difference that causes the failure. Return to SKILL.md Phase 4 — the fix is making the environments consistent or making the code robust to the difference.
