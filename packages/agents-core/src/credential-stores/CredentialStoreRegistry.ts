import type { CredentialStore } from '../types/server';
import { getLogger } from '../utils/logger';

/**
 * Registry for managing credential stores in the application context
 * Provides methods to register, retrieve, and manage credential stores
 */
export class CredentialStoreRegistry {
  private stores = new Map<string, CredentialStore>();
  private logger = getLogger('credential-store-registry');

  constructor(initialStores: CredentialStore[] = []) {
    for (const store of initialStores) {
      this.add(store);
    }
  }

  /**
   * Add a credential store to the registry
   */
  add(store: CredentialStore): void {
    if (this.stores.has(store.id)) {
      this.logger.warn(
        { storeId: store.id },
        `Credential store ${store.id} already registered, replacing`
      );
    }
    this.stores.set(store.id, store);
    this.logger.info(
      { storeId: store.id, storeType: store.type },
      `Registered credential store: ${store.id} (type: ${store.type})`
    );
  }

  /**
   * Get a credential store by ID
   */
  get(id: string): CredentialStore | undefined {
    return this.stores.get(id);
  }

  /**
   * Get all registered credential stores
   */
  getAll(): CredentialStore[] {
    return Array.from(this.stores.values());
  }

  /**
   * Get all credential store IDs
   */
  getIds(): string[] {
    return Array.from(this.stores.keys());
  }

  /**
   * Check if a credential store is registered
   */
  has(id: string): boolean {
    return this.stores.has(id);
  }

  /**
   * Remove a credential store
   */
  remove(id: string): boolean {
    const removed = this.stores.delete(id);
    if (removed) {
      this.logger.info({ id }, `Removed credential store: ${id}`);
    }
    return removed;
  }

  /**
   * Get the number of registered stores
   */
  size(): number {
    return this.stores.size;
  }
}
