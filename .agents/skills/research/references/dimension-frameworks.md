Use when: Building the Research Rubric in Step 1.2; selecting dimensions for a report type
Priority: P0
Impact: Without this, you'll propose generic dimensions that don't match the report type or miss critical facets

---

# Dimension Frameworks by Report Type

Starter dimensions for common research report types. Use these as a foundation during the Collaborative Scoping Protocol—add, remove, or adjust based on the user's specific context.

---

## 1. Capability Assessment

**Primary Question:** "Can X do Y for our use case?"

Use when evaluating whether a technology meets specific requirements.

| # | Dimension | Common Facets | Typical Depth | Notes |
|---|-----------|---------------|---------------|-------|
| 1 | **Core Functionality** | Feature coverage, API surface, extensibility points | Deep | Always include—this is the primary question |
| 2 | **Data Model** | Schema flexibility, relationships, constraints, migrations | Deep | Critical for data-intensive use cases |
| 3 | **Authentication & Authorization** | Auth methods (OAuth, SAML, API keys), RBAC, row-level security | Deep | Security-critical; often overlooked |
| 4 | **Multi-tenancy** | Isolation model, data segregation, tenant context propagation | Deep | Essential for SaaS use cases |
| 5 | **Scalability** | Horizontal scaling, sharding, connection pooling, rate limits | Moderate | Unless scale is the primary concern |
| 6 | **Performance** | Latency characteristics, throughput, caching, indexing | Moderate | Benchmark if performance-critical |
| 7 | **Reliability & Durability** | HA options, backup/restore, disaster recovery, data guarantees | Moderate | Critical for production systems |
| 8 | **Observability** | Logging, metrics, tracing, alerting integration | Moderate | Often needed for production readiness |
| 9 | **Developer Experience** | SDK quality, documentation, debugging tools, error messages | Moderate | Affects implementation velocity |
| 10 | **Deployment & Operations** | Hosting options (self-hosted/managed), upgrade path, maintenance burden | Moderate | Hidden costs often live here |
| 11 | **Integration Surface** | Webhooks, events, import/export, ecosystem connectors | Moderate | Depends on integration needs |
| 12 | **Licensing & Cost** | License type, pricing model, usage limits, vendor lock-in | Moderate | Often a decision-gate |
| 13 | **Security Posture** | Encryption at rest/transit, audit logging, compliance certifications | Deep if regulated | SOC2, HIPAA, GDPR requirements |
| 14 | **Maturity & Ecosystem** | Age, community size, third-party tools, hiring market | Skip unless comparing | Context for risk assessment |

### Proactive Suggestions for Capability Assessment

- "If you're evaluating for a **SaaS product**, multi-tenancy and auth architecture are usually P0—teams often regret not investigating these early."
- "For **regulated industries**, security posture dimensions become non-negotiable. Should we go deep on compliance?"
- "**Hidden operational burden** often lives in deployment/operations—worth investigating if you're resource-constrained."

---

## 2. Technology Deep-Dive

**Primary Question:** "How does X work internally?"

Use when you need to understand internals for integration, extension, or contribution.

| # | Dimension | Common Facets | Typical Depth | Notes |
|---|-----------|---------------|---------------|-------|
| 1 | **Architecture Overview** | Component diagram, data flow, key abstractions | Deep | Foundation for everything else |
| 2 | **Core Data Structures** | Internal schemas, state management, persistence layer | Deep | How data is actually stored/moved |
| 3 | **Execution Model** | Threading, async patterns, event loops, scheduling | Deep | Critical for performance understanding |
| 4 | **Extension Points** | Plugin architecture, hooks, middleware, custom handlers | Deep | Where you can safely extend |
| 5 | **Configuration System** | Config sources, precedence, runtime vs static, secrets | Moderate | How to customize behavior |
| 6 | **Error Handling** | Error types, propagation, recovery, retry logic | Moderate | How failures manifest |
| 7 | **Dependency Graph** | External dependencies, version constraints, isolation | Moderate | Integration complexity |
| 8 | **Testing Infrastructure** | Test patterns, mocking, fixtures, CI setup | Moderate | How to validate changes |
| 9 | **Build & Release** | Build system, artifacts, versioning, release process | Moderate | How to work with the codebase |
| 10 | **Security Boundaries** | Trust zones, privilege levels, input validation | Deep if security-sensitive | Where security is enforced |
| 11 | **Performance Characteristics** | Hot paths, caching layers, optimization patterns | Moderate | Where performance matters |
| 12 | **Observability Internals** | Internal metrics, debug modes, introspection | Moderate | How to troubleshoot |

### Proactive Suggestions for Technology Deep-Dive

- "If you're planning to **contribute upstream**, build & release plus testing infrastructure become essential."
- "For **security-sensitive integration**, trust boundaries deserve deep investigation."
- "If you're **wrapping or extending** the system, extension points are your P0 dimension."

---

## 3. Comparative Analysis

**Primary Question:** "Should we use X or Y?"

Use when selecting between alternatives for a specific purpose.

| # | Dimension | Common Facets | Typical Depth | Notes |
|---|-----------|---------------|---------------|-------|
| 1 | **Feature Parity** | Capability matrix, gaps, unique features | Deep | Core comparison |
| 2 | **Architecture Fit** | Alignment with existing stack, paradigm match | Deep | Integration complexity |
| 3 | **Performance Comparison** | Benchmarks, latency, throughput under load | Deep if perf-critical | Apples-to-apples comparison |
| 4 | **Operational Complexity** | Setup, maintenance, upgrade burden, monitoring | Moderate | Hidden long-term costs |
| 5 | **Developer Experience** | Learning curve, documentation, tooling, debugging | Moderate | Affects team velocity |
| 6 | **Community & Ecosystem** | Adoption, plugins, integrations, hiring pool | Moderate | Long-term viability signal |
| 7 | **Cost Model** | Licensing, infrastructure, operational overhead | Moderate | TCO comparison |
| 8 | **Scalability Trajectory** | Growth path, limits, migration complexity | Moderate | Future-proofing |
| 9 | **Security & Compliance** | Security features, certifications, audit history | Deep if regulated | Non-negotiable requirements |
| 10 | **Vendor/Project Risk** | Funding, governance, roadmap, bus factor | Moderate | Long-term bet assessment |
| 11 | **Migration Path** | Effort to switch, data portability, lock-in | Moderate | Exit strategy |
| 12 | **Case Studies** | Who uses it, success/failure stories, scale examples | Skip unless deciding factor | Social proof |

### Proactive Suggestions for Comparative Analysis

- "**Operational complexity** often differentiates similar tools more than features—worth going deep if your team is small."
- "For **long-term bets**, vendor/project risk becomes important. Should we investigate governance and funding?"
- "If you might need to **switch later**, migration path deserves attention now."

---

## 4. Integration Research

**Primary Question:** "How do we connect X to our system?"

Use when planning implementation of an integration.

| # | Dimension | Common Facets | Typical Depth | Notes |
|---|-----------|---------------|---------------|-------|
| 1 | **API Surface** | Endpoints, methods, request/response formats | Deep | Primary integration point |
| 2 | **Authentication Flow** | Auth methods, token management, refresh patterns | Deep | Often the first blocker |
| 3 | **Data Mapping** | Schema alignment, transformations, type mismatches | Deep | Where bugs hide |
| 4 | **Error Handling** | Error formats, retry patterns, circuit breakers | Moderate | Production resilience |
| 5 | **Rate Limits & Quotas** | Limits, throttling behavior, quota management | Moderate | Capacity planning |
| 6 | **Webhooks & Events** | Event types, delivery guarantees, retry policy | Moderate if event-driven | Real-time integration |
| 7 | **SDK Quality** | Official SDKs, type safety, maintenance status | Moderate | Build vs buy decision |
| 8 | **Sandbox/Testing** | Test environments, mock servers, fixture data | Moderate | Development workflow |
| 9 | **Versioning & Stability** | API versioning, deprecation policy, changelog | Moderate | Maintenance burden |
| 10 | **Security Requirements** | TLS versions, IP allowlisting, credential storage | Deep if sensitive | Compliance requirements |
| 11 | **Performance Characteristics** | Latency, batch operations, pagination | Moderate | Efficiency at scale |
| 12 | **Support & Documentation** | API docs quality, support channels, SLA | Moderate | Operational dependency |

### Proactive Suggestions for Integration Research

- "**Authentication flow** is often more complex than it appears—worth going deep to avoid surprises."
- "If you're handling **high volume**, rate limits and batch operations become critical."
- "**Webhook delivery guarantees** vary wildly—if you need exactly-once semantics, investigate carefully."

---

## 5. Architecture Documentation

**Primary Question:** "What does this system look like?"

Use when capturing knowledge about an existing system for team reference.

| # | Dimension | Common Facets | Typical Depth | Notes |
|---|-----------|---------------|---------------|-------|
| 1 | **System Overview** | High-level diagram, key components, boundaries | Deep | Entry point for readers |
| 2 | **Component Inventory** | Services, databases, queues, external dependencies | Deep | What exists |
| 3 | **Data Flow** | Request paths, data transformations, event flows | Deep | How things connect |
| 4 | **Data Model** | Core entities, relationships, storage locations | Deep | Where data lives |
| 5 | **Authentication & Authorization** | Auth architecture, permission model, session management | Moderate | Security architecture |
| 6 | **Deployment Topology** | Environments, infrastructure, networking | Moderate | How it runs |
| 7 | **Scaling Architecture** | Load balancing, auto-scaling, sharding | Moderate | Growth patterns |
| 8 | **Observability Stack** | Logging, metrics, tracing, alerting | Moderate | How to troubleshoot |
| 9 | **Security Architecture** | Trust boundaries, encryption, secrets management | Deep if security-focused | Security posture |
| 10 | **Failure Modes** | Known weaknesses, blast radius, recovery procedures | Moderate | Operational resilience |
| 11 | **Key Decisions** | ADRs, historical context, constraints | Moderate | Why it's built this way |
| 12 | **Development Workflow** | Local setup, testing, deployment process | Moderate | Onboarding support |

### Proactive Suggestions for Architecture Documentation

- "**Key decisions** (ADRs) are often missing but invaluable—should we document the 'why' behind major choices?"
- "If this is for **onboarding**, development workflow deserves more depth."
- "**Failure modes** are rarely documented but critical for on-call—worth capturing?"

---

## Dimension Template (For Custom Dimensions)

When adding dimensions beyond these frameworks:

```markdown
| # | Dimension | Common Facets | Typical Depth | Notes |
|---|-----------|---------------|---------------|-------|
| N | **[Name]** | [Facet 1], [Facet 2], [Facet 3] | [Deep/Moderate/Skip] | [When this matters] |
```

**Checklist for custom dimensions:**
- [ ] Dimension has clear, actionable facets
- [ ] Depth recommendation tied to use case
- [ ] Notes explain when/why this matters
- [ ] Not redundant with existing dimensions

---

## Using These Frameworks

1. **Start with the matching framework** for your report type
2. **Walk through each dimension** using the Decision Support Protocol in SKILL.md
3. **Add custom dimensions** based on user's specific context
4. **Remove dimensions** that don't apply (document as non-goals)
5. **Adjust depth** based on timeline and priority
6. **Determine report stance** (conclusions vs factual/academic) — see Step 1.2 F in SKILL.md
7. **Produce the final rubric** for user confirmation before researching

**Important:** Report stance (conclusions vs factual) affects how you write findings, not which dimensions to investigate. Always ask about stance during scoping.
