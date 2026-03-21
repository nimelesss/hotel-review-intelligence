export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function extractErrorMessage(response: Response): Promise<string> {
  const fallback = `HTTP ${response.status}`;
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload?.message === "string" && payload.message.trim()) {
        return payload.message;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  try {
    const text = (await response.text()).trim();
    if (!text) {
      return fallback;
    }

    // Some APIs return JSON as plain text; try to extract "message".
    if (text.startsWith("{") && text.endsWith("}")) {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed?.message === "string" && parsed.message.trim()) {
        return parsed.message;
      }
    }

    return text;
  } catch {
    return fallback;
  }
}
