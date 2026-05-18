import type { MessageType } from './messages';

export interface SseEvent {
  id?: string;
  event: MessageType;
  data: unknown;
  retryMs?: number;
}

export function serializeSseEvent({ id, event, data, retryMs }: SseEvent): string {
  const lines: string[] = [];
  if (id) lines.push(`id: ${id}`);
  lines.push(`event: ${event}`);
  if (retryMs !== undefined) lines.push(`retry: ${retryMs}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  return `${lines.join('\n')}\n\n`;
}

export function serializeSseComment(comment: string): string {
  return `: ${comment}\n\n`;
}
