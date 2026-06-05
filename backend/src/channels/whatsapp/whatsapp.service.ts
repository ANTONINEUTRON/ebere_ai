import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

// ─── WhatsApp Cloud API types (minimal, only what we handle) ─────────────────

export interface WhatsAppMessage {
  from: string;
  id: string;
  type: 'text' | 'image' | 'audio' | string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; sha256?: string };
  audio?: { id: string; mime_type?: string };
}

export interface WhatsAppBody {
  object: string;
  entry: Array<{
    changes: Array<{
      value: {
        messaging_product: string;
        messages?: WhatsAppMessage[];
      };
    }>;
  }>;
}

// ─── Normalised payload passed to the runner ─────────────────────────────────

export interface WhatsAppPayload {
  from: string;
  text?: string;
  /** WhatsApp media ID — download via `downloadMedia()` before passing to runner. */
  mediaId?: string;
  mediaType?: 'image' | 'audio';
}

@Injectable()
export class WhatsAppService {
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly appSecret: string;
  private readonly graphBase = 'https://graph.facebook.com/v19.0';

  constructor(private readonly config: ConfigService) {
    this.accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    this.phoneNumberId = this.config.get<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
      '',
    );
    this.appSecret = this.config.get<string>('WHATSAPP_APP_SECRET', '');
  }

  /**
   * Validates the `X-Hub-Signature-256` header against the raw request body
   * using HMAC-SHA256 with `WHATSAPP_APP_SECRET`.
   * Uses constant-time comparison to prevent timing attacks.
   */
  validateSignature(rawBody: Buffer, signatureHeader: string): boolean {
    if (!signatureHeader?.startsWith('sha256=')) return false;
    const expected = Buffer.from(
      'sha256=' +
        createHmac('sha256', this.appSecret).update(rawBody).digest('hex'),
    );
    const received = Buffer.from(signatureHeader);
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  }

  /**
   * Normalises a WhatsApp Cloud API webhook body into a flat payload.
   * Supported types: text, image, audio.
   * Returns `null` when there are no messages (e.g. status update events).
   */
  extractPayload(body: WhatsAppBody): WhatsAppPayload | null {
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages?.length) return null;

    const msg = messages[0];
    const from = msg.from;

    if (msg.type === 'text') {
      return { from, text: msg.text?.body };
    }
    if (msg.type === 'image') {
      return { from, mediaId: msg.image?.id, mediaType: 'image' };
    }
    if (msg.type === 'audio') {
      return { from, mediaId: msg.audio?.id, mediaType: 'audio' };
    }

    return null; // unsupported type — caller should acknowledge and drop
  }

  /**
   * Fetches the binary content for a WhatsApp media ID.
   * Step 1: GET `/{mediaId}` → resolves `{ url, mime_type }`
   * Step 2: GET the resolved URL for the actual bytes
   */
  async downloadMedia(
    mediaId: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const metaRes = await fetch(`${this.graphBase}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    const meta = (await metaRes.json()) as { url: string; mime_type: string };

    const mediaRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    return {
      buffer: Buffer.from(await mediaRes.arrayBuffer()),
      mimeType: meta.mime_type,
    };
  }

  /** Sends a plain-text message to a WhatsApp phone number. */
  async sendMessage(to: string, text: string): Promise<void> {
    await fetch(`${this.graphBase}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });
  }
}
