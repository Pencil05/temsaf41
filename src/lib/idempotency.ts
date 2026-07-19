import "server-only";

const operations = new Map<string, { expiresAt: number; promise: Promise<unknown> }>();

export async function withIdempotency<T>(key: string | null, operation: () => Promise<T>): Promise<T> {
  if (!key) return operation();
  const now = Date.now();
  for (const [savedKey, saved] of operations) if (saved.expiresAt <= now) operations.delete(savedKey);
  const existing = operations.get(key);
  if (existing) return existing.promise as Promise<T>;
  const promise = operation().catch((error) => { operations.delete(key); throw error; });
  operations.set(key, { expiresAt: now + 10 * 60 * 1000, promise });
  return promise;
}
