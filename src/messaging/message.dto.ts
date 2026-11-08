import { z } from 'zod';

export const sendMessageSchema = z.object({
  phone: z.string().regex(/^\d{10,15}$/, 'Digits only, with country and area code'),
  message: z.string().min(1).max(4096),
});

export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const receivedCallbackSchema = z
  .object({
    instanceId: z.string().optional(),
    messageId: z.string().optional(),
    phone: z.string().optional(),
    fromMe: z.boolean().optional(),
    type: z.string().optional(),
    text: z.object({ message: z.string() }).partial().optional(),
  })
  .loose();

export type ReceivedCallback = z.infer<typeof receivedCallbackSchema>;
