/**
 * The minimal shape recharts passes to a custom Tooltip `content` function.
 * The active data row is `payload[0].payload`; every chart's tooltip reads
 * that row and renders from it, so nothing here depends on recharts' generic
 * TooltipContentProps types.
 */
export interface TooltipRenderProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }> | null;
}

export function activeRow<T>(props: TooltipRenderProps): T | null {
  if (!props.active || !props.payload || props.payload.length === 0) return null;
  return (props.payload[0]?.payload as T | undefined) ?? null;
}
