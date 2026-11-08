export const MessageDirection = {
  Inbound: 'INBOUND',
  Outbound: 'OUTBOUND',
} as const;

export type MessageDirection =
  (typeof MessageDirection)[keyof typeof MessageDirection];
