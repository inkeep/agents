/**
 * Minimal type declarations for @napi-rs/keyring
 * Based on the keyring-node package API
 */

declare module '@napi-rs/keyring' {
  export class Entry {
    constructor(service: string, name: string);
    getPassword(): string | null;
    setPassword(password: string): void;
    deletePassword(): void;
  }
}
