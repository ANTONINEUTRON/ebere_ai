import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ─── Telegram API types (minimal, only what we handle) ───────────────────────

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: { id: number; is_bot: boolean; first_name: string; username?: string };
  chat: { id: number; type: string };
  text?: string;
  photo?: TelegramPhotoSize[];
  voice?: { file_id: string; duration: number; mime_type?: string };
  audio?: { file_id: string; duration: number; mime_type?: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// ─── Normalised payload passed to the runner ─────────────────────────────────

export interface TelegramPayload {
  chatId: string;
  text?: string;
  /** Telegram file_id — download via `downloadFile()` before passing to runner. */
  fileId?: string;
  mediaType?: 'photo' | 'voice';
}

@Injectable()
export class TelegramService {
  private readonly apiBase: string;
  private readonly fileBase: string;

  constructor(private readonly config: ConfigService) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
    this.apiBase = `https://api.telegram.org/bot${token}`;
    this.fileBase = `https://api.telegram.org/file/bot${token}`;
  }

  /**
   * Normalises a Telegram Update into a flat payload.
   * Supported types: text, photo (largest size), voice, audio.
   * Returns `null` for unsupported update shapes (no message, stickers, etc.).
   */
  extractPayload(update: TelegramUpdate): TelegramPayload | null {
    const msg = update.message;
    if (!msg) return null;

    const chatId = String(msg.chat.id);

    if (msg.text) {
      return { chatId, text: msg.text };
    }

    if (msg.photo?.length) {
      // Telegram sends photos sorted smallest → largest; last item is highest resolution.
      const largest = msg.photo[msg.photo.length - 1];
      return { chatId, fileId: largest.file_id, mediaType: 'photo' };
    }

    // Voice notes arrive as `voice`; audio files as `audio` — treat both as voice
    if (msg.voice) {
      return { chatId, fileId: msg.voice.file_id, mediaType: 'voice' };
    }
    if (msg.audio) {
      return { chatId, fileId: msg.audio.file_id, mediaType: 'voice' };
    }

    return null; // unsupported type — caller should acknowledge and drop
  }

  /**
   * Downloads a Telegram file by its file_id and returns the binary Buffer.
   * Step 1: `getFile` → resolves `file_path`
   * Step 2: GET the CDN URL for the actual bytes
   */
  async downloadFile(fileId: string): Promise<Buffer> {
    const infoRes = await fetch(
      `${this.apiBase}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );
    const info = (await infoRes.json()) as {
      ok: boolean;
      result?: { file_path: string };
    };
    if (!info.ok || !info.result) {
      throw new Error(`Telegram getFile failed for file_id: ${fileId}`);
    }
    const fileRes = await fetch(`${this.fileBase}/${info.result.file_path}`);
    return Buffer.from(await fileRes.arrayBuffer());
  }

  /** Sends a plain-text message to a Telegram chat. */
  async sendMessage(chatId: string, text: string): Promise<void> {
    await fetch(`${this.apiBase}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }
}
