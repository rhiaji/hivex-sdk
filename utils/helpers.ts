/** Small shared helpers. */

/** Safely parse a JSON string without throwing. */
export function safeJsonParse(
  input: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** Deterministic blockchain-position event id. */
export function buildEventId(
  blockNumber: number,
  transactionIndex: number,
  operationIndex: number,
): string {
  return `${blockNumber}-${transactionIndex}-${operationIndex}`;
}

/** Derive the signing account from the authority arrays when unambiguous. */
export function deriveAccount(
  requiredAuths: string[],
  requiredPostingAuths: string[],
): string | null {
  if (requiredPostingAuths.length === 1) return requiredPostingAuths[0] ?? null;
  if (requiredAuths.length === 1) return requiredAuths[0] ?? null;
  return requiredPostingAuths[0] ?? requiredAuths[0] ?? null;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
