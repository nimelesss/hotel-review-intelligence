export function createId(prefix: string): string {
  const seed = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${seed}`;
}
