import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

const BASE_URL = 'https://api.z-api.io';

export interface ZApiCredentials {
  instanceId: string;
  token: string;
  clientToken: string;
}

export interface SentMessage {
  zaapId: string;
  messageId: string;
}

@Injectable()
export class ZApiClient {
  private readonly logger = new Logger(ZApiClient.name);

  async sendText(
    credentials: ZApiCredentials,
    phone: string,
    message: string,
  ): Promise<SentMessage> {
    const url = `${BASE_URL}/instances/${credentials.instanceId}/token/${credentials.token}/send-text`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': credentials.clientToken,
        },
        body: JSON.stringify({ phone, message }),
      });
    } catch (error) {
      this.logger.error(
        `Z-API is unreachable for instance ${credentials.instanceId}: ${(error as Error).message}`,
      );

      throw new ServiceUnavailableException('WhatsApp provider is unreachable');
    }

    if (!response.ok) {
      this.logger.error(
        `Z-API refused a message for instance ${credentials.instanceId}: ${response.status} ${await response.text()}`,
      );

      throw new ServiceUnavailableException('WhatsApp provider refused the message');
    }

    const body = (await response.json()) as SentMessage;

    return { zaapId: body.zaapId, messageId: body.messageId };
  }
}
