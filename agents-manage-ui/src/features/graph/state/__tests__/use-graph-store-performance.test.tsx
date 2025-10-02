import { describe, it, expect } from 'vitest';
import { useGraphStore } from '../use-graph-store';

describe('useGraphStore Performance Demonstration', () => {
  it('should demonstrate the object selector performance issue', () => {
    // This test demonstrates why object selectors cause performance issues
    
    const store = useGraphStore.getState();
    
    // ❌ BAD: Object selector - creates new object reference every time
    const objectSelector = (state: typeof store) => ({
      toolLookup: state.toolLookup,
      agentToolConfigLookup: state.agentToolConfigLookup,
      edges: state.edges,
    });
    
    // ✅ GOOD: Atomic selectors - return stable references
    const toolLookupSelector = (state: typeof store) => state.toolLookup;
    const agentToolConfigSelector = (state: typeof store) => state.agentToolConfigLookup;
    const edgesSelector = (state: typeof store) => state.edges;
    
    // Get initial state
    const initialState = store;
    
    // Object selector returns different references even with same data
    const result1 = objectSelector(initialState);
    const result2 = objectSelector(initialState);
    
    // These will be different objects even though the data is the same
    expect(result1).not.toBe(result2); // Different object references
    expect(result1).toEqual(result2); // But same content
    
    // Atomic selectors return the same references for same data
    const toolLookup1 = toolLookupSelector(initialState);
    const toolLookup2 = toolLookupSelector(initialState);
    const agentConfig1 = agentToolConfigSelector(initialState);
    const agentConfig2 = agentToolConfigSelector(initialState);
    const edges1 = edgesSelector(initialState);
    const edges2 = edgesSelector(initialState);
    
    // These will be the same references
    expect(toolLookup1).toBe(toolLookup2);
    expect(agentConfig1).toBe(agentConfig2);
    expect(edges1).toBe(edges2);
  });

  it('should show how Zustand compares selector results', () => {
    // Zustand uses Object.is() (strict equality) by default to compare selector results
    // This means object selectors will always be considered "changed"
    
    const sameObject = { a: 1, b: 2 };
    const identicalObject1 = { a: 1, b: 2 };
    const identicalObject2 = { a: 1, b: 2 };
    
    // Same reference - no re-render
    expect(Object.is(sameObject, sameObject)).toBe(true);
    
    // Different references - will cause re-render even with same content
    expect(Object.is(identicalObject1, identicalObject2)).toBe(false);
    
    // Primitive values - stable comparison
    expect(Object.is('same', 'same')).toBe(true);
    expect(Object.is(123, 123)).toBe(true);
    expect(Object.is(true, true)).toBe(true);
  });

  it('should demonstrate the solution with shallow comparison', () => {
    // If you must use object selectors, you can use shallow comparison
    // But atomic selectors are still preferred for simplicity
    
    const shallowEqual = (a: any, b: any) => {
      if (Object.is(a, b)) return true;
      if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
        return false;
      }
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(b, key) || !Object.is(a[key], b[key])) {
          return false;
        }
      }
      return true;
    };
    
    const obj1 = { toolLookup: {}, agentToolConfigLookup: {}, edges: [] };
    const obj2 = { toolLookup: {}, agentToolConfigLookup: {}, edges: [] };
    
    // Strict equality fails
    expect(Object.is(obj1, obj2)).toBe(false);
    
    // But shallow equality would work if the nested objects were the same references
    // (This is what zustand/shallow does)
    expect(shallowEqual(obj1, obj2)).toBe(false); // Still false because nested objects are different
    
    // With same nested references
    const shared = {};
    const sharedArray: any[] = [];
    const obj3 = { toolLookup: shared, agentToolConfigLookup: shared, edges: sharedArray };
    const obj4 = { toolLookup: shared, agentToolConfigLookup: shared, edges: sharedArray };
    
    expect(shallowEqual(obj3, obj4)).toBe(true); // Now it works!
  });
});
