/** D2 reports syntax errors as a JSON array, which is noisy inline. */
export function describeD2Error(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)

  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const messages = parsed
        .map((item) => item?.errmsg)
        .filter((message): message is string => typeof message === 'string')
      if (messages.length > 0) return messages.join('\n')
    }
  } catch {
    // Not a structured D2 error.
  }

  return raw
}
