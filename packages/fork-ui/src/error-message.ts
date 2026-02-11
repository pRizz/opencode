export function errorMessage(err: unknown, fallback = "An unexpected error occurred") {
  if (err && typeof err === "object") {
    if ("data" in err) {
      const data = (err as { data?: { message?: string; error?: { message?: string } } }).data
      if (data?.message) return data.message
      if (data?.error?.message) return data.error.message
    }
    if ("message" in err && typeof (err as { message?: unknown }).message === "string") {
      return (err as { message: string }).message
    }
  }
  if (err instanceof Error) return err.message
  return fallback
}
