# Zustand Performance: Object Selectors vs Atomic Selectors

## The Problem

When you write code like this:

```typescript
// ❌ BAD: This will cause unnecessary re-renders
const { toolLookup, agentToolConfigLookup, edges } = useGraphStore((state) => ({
  toolLookup: state.toolLookup,
  agentToolConfigLookup: state.agentToolConfigLookup,
  edges: state.edges,
}));
```

**Every time ANY part of the store changes, your component will re-render**, even if `toolLookup`, `agentToolConfigLookup`, and `edges` haven't changed.

## Why This Happens

Zustand uses `Object.is()` (strict equality) to compare selector results:

```typescript
// These are different object references, even with identical content
const obj1 = { toolLookup: {}, edges: [] };
const obj2 = { toolLookup: {}, edges: [] };
console.log(Object.is(obj1, obj2)); // false ❌

// This means your selector always returns a "new" result
const selector = (state) => ({
  toolLookup: state.toolLookup,  // Same data...
  edges: state.edges,            // Same data...
}); // ...but NEW OBJECT every time!
```

## Solutions

### Solution 1: Use Atomic Selectors (Recommended)

```typescript
// ✅ GOOD: Each selector only triggers re-renders when its value changes
const toolLookup = useGraphStore((state) => state.toolLookup);
const agentToolConfigLookup = useGraphStore((state) => state.agentToolConfigLookup);
const edges = useGraphStore((state) => state.edges);
```

### Solution 2: Use Our Custom Hooks (Even Better)

```typescript
// ✅ BEST: Pre-built atomic selectors
const toolLookup = useGraphToolLookup();
const agentToolConfigLookup = useGraphAgentToolConfigLookup();
const edges = useGraphEdges();
```

### Solution 3: Use Shallow Comparison (If You Must Use Objects)

```typescript
import { shallow } from 'zustand/shallow';

// ✅ ACCEPTABLE: Object selector with shallow comparison
const { toolLookup, agentToolConfigLookup, edges } = useGraphStore(
  (state) => ({
    toolLookup: state.toolLookup,
    agentToolConfigLookup: state.agentToolConfigLookup,
    edges: state.edges,
  }),
  shallow // This prevents unnecessary re-renders
);
```

## Performance Impact

### With Object Selector (Bad)
- Component re-renders on **every store change**
- Even when your selected values haven't changed
- Can cause cascading re-renders in child components

### With Atomic Selectors (Good)
- Component only re-renders when **your specific values change**
- Much better performance in large applications
- Cleaner, more predictable behavior

## Real Example

```typescript
// ❌ This component will re-render when ANYTHING in the store changes
const BadComponent = () => {
  const { nodes, edges, dirty } = useGraphStore((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    dirty: state.dirty,
  }));
  
  console.log('BadComponent rendered'); // This will log A LOT
  return <div>Nodes: {nodes.length}, Edges: {edges.length}</div>;
};

// ✅ This component only re-renders when nodes or edges actually change
const GoodComponent = () => {
  const nodes = useGraphNodes();
  const edges = useGraphEdges();
  // We don't subscribe to 'dirty' so changes to it won't cause re-renders
  
  console.log('GoodComponent rendered'); // This will log much less
  return <div>Nodes: {nodes.length}, Edges: {edges.length}</div>;
};
```

## Key Takeaway

**Always prefer atomic selectors over object selectors** for better performance and more predictable re-rendering behavior.
