---
name: tdd
description: |
  Universal test-driven development methodology and test design craft.
  Background knowledge for writing behavior-focused tests, mocking strategy,
  vertical slicing, and tracer bullet execution. Auto-loaded when writing tests
  during implementation, review feedback, or standalone test authoring.
  Triggers: writing tests, test design, mocking strategy, test quality,
  behavior testing, integration testing, test-first, red-green-refactor.
---

# Test-Driven Development Methodology

Universal principles for writing good tests. These apply regardless of framework, language, or repo — discover and follow your repo's specific testing tools, commands, and conventions from its project configuration, contributor guides, existing test files, CI/CD config, and any repo-level AI skills or rules.

---

## Core principle

Tests verify **behavior through public interfaces**, not implementation details. Code can change entirely; tests shouldn't break unless behavior changed.

**Good tests** exercise real code paths through public APIs. They describe _what_ the system does, not _how_. A good test reads like a specification — "user can checkout with valid cart" tells you exactly what capability exists. These tests survive refactors because they don't care about internal structure.

**Bad tests** are coupled to implementation. They mock internal collaborators, test private methods, or verify through external means (like querying a database directly instead of using the interface). The warning sign: your test breaks when you refactor, but behavior hasn't changed.

---

## Good vs bad tests

```typescript
// GOOD: Tests observable behavior through the interface
test("created user is retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});

// BAD: Bypasses interface to verify via implementation detail
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});
```

```typescript
// GOOD: Tests the outcome
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});

// BAD: Tests the mechanism
test("checkout calls paymentService.process", async () => {
  const mockPayment = vi.spyOn(paymentService, "process");
  await checkout(cart, payment);
  expect(mockPayment).toHaveBeenCalledWith(cart.total);
});
```

**Red flags** for implementation-coupled tests:
- Mocking internal collaborators (not external boundaries)
- Testing private methods
- Asserting on call counts or call order
- Test breaks on refactor without behavior change
- Test name describes HOW ("calls X") not WHAT ("user can Y")

---

## Mocking philosophy

Mock at **system boundaries** only:
- External APIs (payment, email, third-party services)
- Databases (sometimes — prefer test database when available)
- Time / randomness
- File system (sometimes)

**Do not mock** your own modules, internal collaborators, or anything you control. If you need to mock an internal module to test something, that's a signal the interface design needs work — not that you need more mocks.

**Design for mockability at boundaries:**

```typescript
// Easy to mock — dependency is injected
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// Hard to mock — dependency is internal
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

---

## Vertical slicing (anti-pattern: horizontal slices)

**DO NOT** write all tests first, then all implementation. This is "horizontal slicing" — it produces weak tests:

- Tests written in bulk test _imagined_ behavior, not _actual_ behavior
- You end up testing the _shape_ of things rather than user-facing behavior
- Tests become insensitive to real changes — they pass when behavior breaks, fail when behavior is fine
- You commit to test structure before understanding the implementation

**Correct approach** — vertical slices via tracer bullets:

```
WRONG (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical):
  RED→GREEN: test1→impl1
  RED→GREEN: test2→impl2
  RED→GREEN: test3→impl3
```

Each test responds to what you learned from the previous cycle. Because you just wrote the code, you know exactly what behavior matters and how to verify it.

---

## Tracer bullet

Start with ONE test that proves ONE path works end-to-end:

```
RED:   Write test for first behavior → test fails
GREEN: Write minimal code to pass → test passes
```

This is your tracer bullet — it proves the path works before you invest in breadth. Then add behaviors incrementally, one test at a time.

Rules:
- One test at a time
- Only enough code to pass the current test
- Don't anticipate future tests
- Keep tests focused on observable behavior
- **Never refactor while RED** — get to GREEN first

---

## Per-cycle checklist

```
[ ] Test describes behavior, not implementation
[ ] Test uses public interface only
[ ] Test would survive an internal refactor
[ ] Code is minimal for this test
[ ] No speculative features added
```
