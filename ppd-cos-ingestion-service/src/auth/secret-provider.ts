export interface SecretProvider {
  getHmacKey(keyId: string): Promise<Uint8Array | null>;
}

export class InMemorySecretProvider implements SecretProvider {
  constructor(private readonly keys: ReadonlyMap<string, Uint8Array>) {}

  async getHmacKey(keyId: string): Promise<Uint8Array | null> {
    return this.keys.get(keyId) ?? null;
  }
}

export class UnavailableSecretProvider implements SecretProvider {
  async getHmacKey(): Promise<Uint8Array | null> {
    throw new Error('Secret provider unavailable');
  }
}
