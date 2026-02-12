let counter = 1000;

export function generateId(): number {
  return Date.now() + counter++;
}

export function generateExpressionId(tagId: number, prefix: string, index: number): string {
  return `uuid-${tagId}-${prefix}-${index}`;
}
