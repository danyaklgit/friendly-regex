export function generateId(): string {
  return crypto.randomUUID();
}

export function generateExpressionId(tagId: string, prefix: string, index: number): string {
  return `${tagId}-${prefix}-${index}`;
}
