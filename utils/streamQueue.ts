/**
 * Turns a push-based stream engine into an async iterator.
 *
 * It never reads the blockchain itself: the caller owns the single
 * StreamEngine (which owns the single block reader) and simply pushes
 * normalized events into the queue.
 */
export interface QueueDrivenStream {
  start: () => Promise<void>;
  stop: () => void;
}

export async function* iterateEngine<E>(
  engine: QueueDrivenStream,
  register: (push: (event: E) => void) => void,
): AsyncGenerator<E, void, void> {
  const queue: E[] = [];
  let notify: (() => void) | null = null;
  let finished = false;
  let failure: unknown = null;

  const wake = () => {
    notify?.();
    notify = null;
  };

  register((event) => {
    queue.push(event);
    wake();
  });

  const loop = engine
    .start()
    .catch((error: unknown) => {
      failure = error;
    })
    .finally(() => {
      finished = true;
      wake();
    });

  try {
    while (true) {
      while (queue.length > 0) {
        yield queue.shift() as E;
      }
      if (failure) throw failure;
      if (finished) return;
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
    }
  } finally {
    engine.stop();
    await loop;
  }
}
