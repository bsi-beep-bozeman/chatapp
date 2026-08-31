export type RegistryResolution =
  | Readonly<{
      kind: 'mapped';
      subjectId: string;
      canonicalEmail: string;
      policyVersion: string;
    }>
  | Readonly<{ kind: 'unmapped' | 'disabled' | 'ambiguous' }>
  | Readonly<{ kind: 'unavailable'; retryable: boolean }>;

export interface AccessRegistryPort {
  resolve(chatUserName: string): Promise<RegistryResolution>;
}

export class MockAccessRegistry implements AccessRegistryPort {
  readonly kind = 'mock-test-only';
  private readonly values: ReadonlyMap<string, RegistryResolution>;

  constructor(values: ReadonlyMap<string, RegistryResolution>) {
    this.values = new Map(
      [...values].map(([name, resolution]) => [name, Object.freeze({ ...resolution })]),
    );
  }

  async resolve(chatUserName: string): Promise<RegistryResolution> {
    if (!/^users\/[A-Za-z0-9._@-]+$/.test(chatUserName)) {
      return Object.freeze({ kind: 'unmapped' });
    }
    return this.values.get(chatUserName) ?? Object.freeze({ kind: 'unmapped' });
  }
}
