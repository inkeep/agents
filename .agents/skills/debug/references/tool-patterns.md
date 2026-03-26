Use when: Phase 3 (Investigate) or Phase 5 (Report & Recommend) needs specific tool sequences.
Priority: P0
Impact: Without concrete tool patterns, the agent uses ad-hoc tool sequences and misses efficient investigation shortcuts.

# Tool Patterns for Debugging

Specific sequences of tool calls for common debugging scenarios. Each pattern describes WHEN to use it, the exact sequence, and how to interpret results.

---

## §1 Tracing Data Flow Backward from an Error

**When:** You have an error at a specific location and need to find where the bad data originated. This is the most common investigation pattern — use it whenever the bug is a wrong value, wrong type, null/undefined, or unexpected state.

```
SEQUENCE:

1. Read the file at the error location (30-line context)
   Tool: Read(file_path, offset=<error_line - 15>, limit=30)
   -> Identify the variable/expression with the wrong value

2. Grep for where that variable is assigned:
   Tool: Grep(pattern="variableName\\s*=", path="src/", glob="*.ts")
   Tool: Grep(pattern="variableName\\s*:", path="src/", glob="*.ts")  # object properties
   Use output_mode="content" with context lines to see surrounding code

3. For each assignment found, Read that location to understand the source

4. If the value comes from a FUNCTION CALL:
   Grep for the function definition:
   Tool: Grep(pattern="function functionName|def functionName|functionName\\s*=", path="src/")
   Read the function body, find its return statements
   -> The return value IS the bad data's source

   NOTE: If the function is in a 3P library and the installed source is
   insufficient — unreadable (compiled/minified/bundled, common in
   node_modules/), or you need git history to trace when behavior changed
   between versions — clone the OSS repo to ~/.claude/oss-repos/<repo-name>
   to access original source and full commit history. See /research skill's
   references/source-code-research.md for the cloning protocol. Check if
   already cloned before cloning again. Reading library source is Level 4
   evidence; always confirm findings by running the actual system.

5. If the value comes from an IMPORT:
   Grep for the export in the source module
   Read the exported definition

6. If the value comes from a PARAMETER:
   Grep for callers of this function:
   Tool: Grep(pattern="functionName\\(", path="src/", glob="*.ts")
   Read each caller to see what they pass

7. REPEAT until you find the origin of the bad data
   TERMINATION: If you've traced through 5+ assignments without finding
   the origin, return to Phase 3 and form a hypothesis about where the
   value diverges — you have enough context to hypothesize.
```

**Key pattern:** Search for DEFINITIONS (where a value is produced), not usages (where it's consumed). When tracing backward, you want producers, not consumers.

**Optimization:** Use Grep tool parameters to reduce noise:
- `glob="*.py"` for Python only
- `glob="*.{ts,tsx}"` for TypeScript
- Use `output_mode="files_with_matches"` for a first pass, then `output_mode="content"` on matches

---

## §2 Strategic Git for Debugging

**When:** Something broke and you need to understand what changed and when. Choose the right git command for your specific question.

```
COMMAND BY QUESTION:

"When did this specific line change?"
  git blame -L <start>,<end> <file>
  -> Shows commit hash, author, date for each line
  -> Then: git show <commit_hash> for full context

"What changed in this file recently?"
  git log --oneline -10 -- <file>
  -> Last 10 commits touching this file
  git log -p -1 -- <file>
  -> Most recent diff for this file

"What changed between working and broken states?"
  git diff <good_commit>..<bad_commit> -- <file_or_directory>
  git diff <good_commit>..<bad_commit> --stat
  -> Summary of which files changed and how much

"Who changed the function that's breaking?"
  git log -p -S "function_name" -- <file>
  -> Commits where the count of "function_name" changed (pickaxe)
  -> -S finds additions/removals; -G uses regex

"Find the exact commit that introduced the bug"
  git bisect start
  git bisect bad HEAD
  git bisect good <known_good>
  git bisect run <test_script.sh>
  -> Automated binary search through history
  git bisect reset  # when done

"What was this code before the recent change?"
  git show <commit>:<file>
  -> File contents at a specific commit
  -> Compare with current to see what changed

"What recent changes might be relevant?"
  git log --oneline --since="3 days ago" -- <directory>
  -> Scoped to recent changes in a specific area
```

**Selection heuristic:**

| Question | Command |
|---|---|
| Who/when changed this line | `git blame` |
| When was this function added/removed | `git log -S` |
| Which commit broke this behavior | `git bisect` |
| What changed between two states | `git diff` |
| What does the old version look like | `git show <commit>:<file>` |

---

## §3 Stack Trace Parsing

**When:** You have a stack trace and need to extract actionable information. Use this as a systematic parsing procedure, not as something to skim.

```
PARSING PROCEDURE:

1. FIND THE ERROR TYPE AND MESSAGE
   - Usually first or last line of the trace
   - This tells you WHAT went wrong
   - Example: "TypeError: Cannot read properties of undefined (reading 'id')"
     -> Something is undefined when we expected an object with .id

2. EXTRACT FRAMES (each line with file:line info)
   - Separate into: YOUR code vs LIBRARY/FRAMEWORK code
   - Your code: files in src/, app/, lib/ (not node_modules, vendor, stdlib)
   - Note: Python tracebacks show most recent call LAST (bottom).
     JavaScript/Java show most recent call FIRST (top).
     Adjust frame reading order accordingly.

3. IDENTIFY THE PRIMARY FRAME
   - First frame in YOUR code (closest to the error)
   - This is where to start investigation

4. IDENTIFY THE CALLER FRAME
   - The frame that called into the primary frame
   - This tells you what data was passed in

5. FOR CHAINED EXCEPTIONS
   ("Caused by:", "__cause__", "The above exception was the direct cause")
   - Start from the INNERMOST cause
   - That's usually the real error; outer exceptions are reactions

THEN:
  READ the primary frame file (line +/- 20 lines)
  READ the caller frame file (line +/- 10 lines)
  If bug isn't obvious:
    GREP for the function name to find all callers
    READ each caller to understand what data they pass
```

**Frames to skip** (almost never the bug's location):

- Framework middleware / pipeline frames
- Event loop / scheduler frames
- Serialization / deserialization wrappers
- Logging / monitoring interceptors
- Test runner infrastructure frames

**Focus on frames where YOUR code makes DECISIONS about data.**

---

## §4 Strategic Diagnostic Logging

**When:** You need to understand runtime behavior and can't use an interactive debugger. This is your primary investigation tool for most agent debugging scenarios.

```
WHERE TO INSERT LOGS (priority order):

1. FUNCTION ENTRY POINTS with parameters
   Log what data the function receives
   "f entered with: x={x}, y={y}"

2. DECISION POINTS (if/else, switch, pattern match)
   Log which branch was taken and why
   "Taking branch A because condition={value}"

3. DATA TRANSFORMATION OUTPUTS
   Log intermediate results after each transform
   "After transform: data={repr(data)}"

4. EXTERNAL CALL BOUNDARIES
   Log before and after: API calls, DB queries, file I/O
   "Calling API: {request}; got: {status}, {body[:200]}"

5. LOOP SUMMARIES (not every iteration)
   Log: count, first item, last item, any items failing sanity check
   Don't log every iteration of a 10,000-item loop
```

**What to capture in each log:**

- Variable values — use `repr()` / `inspect` to see types and special characters
- Collection sizes — `len(list)`, object key count
- Type information — `type(x).__name__`, `typeof x`
- Timestamps — for performance/timing issues
- Thread/process IDs — for concurrency issues

**How to interpret logs:**

1. Compare logged values against expected values at each point
2. Find the FIRST point where actual diverges from expected
3. That divergence point is your investigation target
4. Watch for: null/undefined appearing, types changing unexpectedly, collections being empty, values being 0 or NaN

**Logging heuristic:** Place logs at BOUNDARIES, not in the middle of logic. Boundaries are: function entry/exit, loop start/end, conditional branch points, external calls. Maximum information, minimum noise.

**Cleanup:** Always remove diagnostic logging after diagnosis is complete. It's temporary investigation infrastructure, not permanent code.

---

## §5 Searching for Similar Patterns / Bugs

**When:** You found a bug and want to check if the same pattern exists elsewhere. Also useful during Phase 5 (Report & Recommend) to identify additional fix targets for the implementer.

```
SEQUENCE:

1. ABSTRACT THE BUG PATTERN
   Don't search for the exact code; search for the pattern
   Example: Bug is "using .length on potentially null array"
   -> Pattern: something that could be null followed by .length

2. GREP FOR THE PATTERN
   Tool: Grep(pattern="\\.length", path="src/", glob="*.ts", output_mode="content", -B=2)
   Then filter results for cases where the object might be null

3. For STRUCTURAL PATTERNS, search for the anti-pattern shape:
   Example: missing null check before property access
   Tool: Grep(pattern="response\\.\\w+", path="src/", glob="*.ts", output_mode="content", -B=3)
   Then: are any of these missing a null check above them?

4. SEARCH for the same FUNCTION being called elsewhere:
   Tool: Grep(pattern="brokenFunction\\(", path="src/", glob="*.ts")
   Each call site might have the same bug

5. SEARCH for similar VARIABLE NAMES (same data, different location):
   Tool: Grep(pattern="userData|user_data|userInfo", path="src/", glob="*.{ts,py}")

6. Use git log to find similar PAST FIXES:
   git log --all --oneline --grep="null check"
   git log --all --oneline --grep="TypeError"
   Past fixes for similar issues reveal other vulnerable spots
```

**Efficiency tips:**

- Use Glob to find relevant files first, then Grep within them
- Use `output_mode="files_with_matches"` for a first pass, then `output_mode="content"` on matches
- Search test files too — test assertions reveal expected behavior
- When you find a pattern, use `output_mode="count"` to estimate the scope of the problem

---

## §6 Targeted Fix Verification

> **Note:** This section is not referenced by the debug skill (which never implements fixes). It is retained as general reference material for implementers who receive debug's findings.

**When:** You've made a fix and want to verify it works before running the full suite.

```
VERIFICATION SEQUENCE:

1. RUN THE SPECIFIC FAILING TEST
   pytest path/to/test_file.py::TestClass::test_method      # Python
   npx jest path/to/test.spec.ts -t "test name"             # JavaScript
   go test -run TestName ./package/...                        # Go
   cargo test test_name                                       # Rust
   mvn test -pl module -Dtest=TestClass#testMethod            # Java

2. RUN RELATED TESTS IN THE SAME FILE/MODULE
   pytest path/to/test_file.py
   npx jest path/to/test.spec.ts

3. RUN TESTS FOR THE MODIFIED MODULE
   Find what tests import the modified code:
   grep -rl "from.*modified_module\|import.*modified_module" tests/
   Run those test files

4. TYPE CHECK (if applicable)
   npx tsc --noEmit          # TypeScript
   mypy src/modified_file.py # Python
   cargo check               # Rust

5. LINT CHECK
   npx eslint src/modified_file.ts     # JS/TS
   ruff check src/modified_file.py     # Python
   golangci-lint run ./package/...     # Go

6. SMOKE TEST
   Can the application start?
   Does the specific user-facing behavior work?
```

**Order rationale:**

- Steps 1-2: Verify the fix works (seconds)
- Step 3: Verify no regressions in related code (seconds to minutes)
- Steps 4-5: Catch type/style issues the fix might introduce (seconds)
- Step 6: Final sanity check before committing

**A fix is ready when:**

1. The originally failing test passes
2. All tests in the same file/module pass
3. Type checker and linter are clean
4. You can explain WHY the fix works (not just that it does)

If you can't explain why it works, you don't understand the root cause. Go back to Phase 3.

---

## §7 Runtime State Verification

**When:** You need to verify that runtime state matches what the code implies. Use this whenever your hypothesis depends on the state of services, databases, configuration, or external systems. This is the most commonly skipped verification step — and the one most likely to reveal the real root cause.

```
VERIFICATION BY DOMAIN:

Services & Infrastructure:
  docker ps                              # Are expected containers running?
  docker logs <container> --tail 50      # Recent logs from a specific service
  curl -s localhost:<port>/health         # Is the service responding?
  lsof -i :<port>                        # What's listening on this port?
  ps aux | grep <process>                # Is the process running?

Databases & Stores:
  # Query the actual data — don't assume it matches what the code writes
  # For SpiceDB/authz: zed relationship read ...
  # For PostgreSQL: psql -c "SELECT ..."
  # For Redis: redis-cli GET key
  # For MongoDB: mongosh --eval "db.collection.find({...})"
  # Compare actual stored format vs what the code expects

Environment & Configuration:
  echo $ENV_VAR                          # Is the env var set?
  cat .env | grep KEY                    # What's in the env file?
  printenv | grep -i relevant_prefix     # All related env vars
  # Compare env values against what code expects

API & Network:
  curl -s http://localhost:PORT/endpoint  # What does the API actually return?
  curl -v ...                             # Include headers for auth debugging
  # Compare actual response shape/values vs code expectations

Logs & Output:
  tail -100 /path/to/log                 # Recent log entries
  docker compose logs --tail 50 service  # Container logs
  # Search for error patterns, unexpected values
```

**Key heuristic:** When the code says "write X to store Y" and later "read X from store Y," verify BOTH operations independently. A common bug pattern is: the write succeeds with format A, but the read expects format B. Code reading alone won't catch format mismatches — you need to see the actual stored value.

**Verification sequence:**

1. Identify what state your hypothesis depends on
2. Query that state directly (don't trust code to tell you what's there)
3. Compare actual state vs expected state
4. If they differ — that's your lead. Trace why they differ

---

## §8 Error Message Interpretation

**When:** Phase 1 (Triage) — you have an error output and need to extract actionable information before reading code.

**Error anatomy:**

- **Exception type:** The KIND of error (TypeError, NullPointerException, ENOENT) — narrows the category
- **Message text:** The WHAT — what went wrong in human-readable terms
- **Location:** The WHERE (file, line, column) — symptom location, not necessarily root cause
- **Stack trace:** The HOW — call chain that led to the error
- **Caused by / chained exceptions:** The WHY — root cause, if the framework exposes it

**Interpretation heuristics:**

1. The exception type tells you WHAT to look for (null? wrong type? missing file? permission denied?)
2. The first frame in YOUR code is the primary investigation point — skip framework/library frames
3. The innermost "Caused by" exception is usually more diagnostic than the outer exception
4. If the error is in framework code with no user frames: the bug is in how you CALL the framework
5. If the error location doesn't match the code you see: verify the build is fresh and source maps are correct

---

## §9 Browser-Based Diagnostic Investigation

**When:** The bug involves UI/frontend behavior and code-level investigation (Observe + Diagnose tiers) is insufficient to confirm or refute your hypothesis. This is an **Escalate-investigate** pattern — use it only when escalation triggers are met (see §Action tiers in SKILL.md).

**Routing gate:** Use `/browser` (Playwright) for all web page interaction. Do NOT use `mcp__peekaboo__*` or `mcp__claude-in-chrome__*` for web content — those are for OS-level automation only.

```
SEQUENCE:

1. LOAD THE BROWSER SKILL
   Invoke /browser to get Playwright primitives
   -> This gives you: navigation, screenshots, console capture,
      network inspection, JavaScript execution, DOM queries

2. NAVIGATE TO THE BUG
   Open the page/route where the bug manifests
   Take a baseline screenshot before attempting reproduction
   -> If the app isn't running, start it first (Phase 2, Step 0)

3. CAPTURE CONSOLE ERRORS DURING REPRODUCTION
   Start console capture -> perform the reproduction steps -> collect errors
   Compare console errors against your code-level hypothesis:
   - Do the errors match what you predicted from reading code?
   - Are there unexpected errors revealing a different root cause?
   - Are there warnings that suggest configuration/environment issues?

4. INSPECT NETWORK REQUESTS DURING REPRODUCTION
   Start network capture -> reproduce -> collect failed/unexpected requests
   Verify API behavior matches code expectations:
   - Request URL, method, headers — does the frontend send what the code constructs?
   - Response status, body — does the backend return what the code expects?
   - Timing — are requests firing in the expected order?
   - Missing requests — is a request that should fire not being sent?

5. VISUAL VERIFICATION (for layout/rendering bugs)
   Take screenshots at each step of reproduction
   Compare against expected layout:
   - Element visibility, positioning, overlap
   - Responsive behavior at different viewport sizes
   - State-dependent rendering (loading, error, empty, populated)

6. BROWSER STATE INSPECTION (for state-related bugs)
   Use JavaScript execution to query:
   - localStorage / sessionStorage values
   - Cookie values and attributes
   - In-memory application state (framework devtools, window.__store__, etc.)
   - DOM attributes and computed styles
   Compare actual browser state against what the code writes/reads

7. CORRELATE WITH CODE-LEVEL FINDINGS
   Every browser observation must tie back to a code location:
   - Console error → which code path produces it?
   - Failed request → which fetch/axios call? What data does it send?
   - Wrong visual state → which component renders it? What props/state?
   - Stale browser state → which code writes it? When is it cleared?
   -> If browser evidence CONFIRMS your hypothesis: raise confidence to HIGH
   -> If browser evidence CONTRADICTS your hypothesis: reject it, form a new one
```

**Exit criteria:**

- You have runtime evidence that either confirms or refutes your code-level hypothesis
- Every browser observation is mapped to a specific code location
- You can explain the bug's mechanism end-to-end (code → runtime behavior → user-visible symptom)

**Heuristic:** Browser investigation is confirmation, not exploration. Have a specific hypothesis before opening the browser. "Let me see what happens" is not a valid reason — that's exploration, and you should do more code reading first.

**Cleanup:** Close browser sessions when investigation is complete. Do not leave browsers running.
