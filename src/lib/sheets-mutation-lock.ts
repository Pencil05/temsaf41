import "server-only";

let mutationQueue = Promise.resolve();

export async function withSheetsMutationLock<T>(operation: () => Promise<T>) {
  const previous = mutationQueue;
  let release!: () => void;
  mutationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;

  try {
    return await operation();
  } finally {
    release();
  }
}
