import { Storage } from '@google-cloud/storage';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GcsStorageProvider } from './gcs.storage-provider';

jest.mock('@google-cloud/storage');

describe('GcsStorageProvider', () => {
  let provider: GcsStorageProvider;
  let mockSave: jest.Mock;
  let mockDownload: jest.Mock;
  let mockDelete: jest.Mock;
  let mockFile: jest.Mock;
  let mockBucket: jest.Mock;

  function makeConfig(): ConfigService {
    return {
      get: jest.fn((key: string) => {
        if (key === 'GCS_PROJECT_ID') return 'test-project';
        if (key === 'GOOGLE_APPLICATION_CREDENTIALS') return undefined;
        return undefined;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'GCS_BUCKET') return 'test-bucket';
        throw new Error(`Missing required env: ${key}`);
      }),
    } as unknown as ConfigService;
  }

  beforeEach(() => {
    mockSave = jest.fn().mockResolvedValue(undefined);
    mockDownload = jest.fn().mockResolvedValue([Buffer.from('stored content')]);
    mockDelete = jest.fn().mockResolvedValue(undefined);

    const fileObject = {
      save: mockSave,
      download: mockDownload,
      delete: mockDelete,
    };
    mockFile = jest.fn().mockReturnValue(fileObject);
    mockBucket = jest.fn().mockReturnValue({ file: mockFile });

    jest
      .mocked(Storage)
      .mockImplementation(() => ({ bucket: mockBucket }) as unknown as Storage);

    provider = new GcsStorageProvider(makeConfig());
  });

  // ── store() ────────────────────────────────────────────────────────────────

  describe('store()', () => {
    it('saves the buffer to a key under media/<userId>/ and returns that key as storagePath', async () => {
      const buffer = Buffer.from('jpeg image data');

      const result = await provider.store(buffer, 'image/jpeg', 'user123');

      expect(mockBucket).toHaveBeenCalledWith('test-bucket');
      const usedKey = (mockFile.mock.calls[0] as [string])[0];
      expect(usedKey).toMatch(/^media\/user123\//);
      expect(usedKey).toMatch(/\.jpg$/);
      expect(mockSave).toHaveBeenCalledWith(
        buffer,
        expect.objectContaining({
          contentType: 'image/jpeg',
          resumable: false,
        }),
      );
      expect(result.storagePath).toBe(usedKey);
    });

    it('uses .ogg extension for audio/ogg content', async () => {
      await provider.store(Buffer.from('ogg'), 'audio/ogg', 'u1');
      expect((mockFile.mock.calls[0] as [string])[0]).toMatch(/\.ogg$/);
    });

    it('uses .png extension for image/png content', async () => {
      await provider.store(Buffer.from('png'), 'image/png', 'u1');
      expect((mockFile.mock.calls[0] as [string])[0]).toMatch(/\.png$/);
    });
  });

  // ── storeText() ────────────────────────────────────────────────────────────

  describe('storeText()', () => {
    it('saves UTF-8 encoded text to the specified key', async () => {
      await provider.storeText(
        'skills/user123/morning-brief.md',
        'skill content here',
      );

      expect(mockBucket).toHaveBeenCalledWith('test-bucket');
      expect(mockFile).toHaveBeenCalledWith('skills/user123/morning-brief.md');
      expect(mockSave).toHaveBeenCalledWith(
        Buffer.from('skill content here', 'utf-8'),
        expect.objectContaining({
          contentType: 'text/plain; charset=utf-8',
          resumable: false,
        }),
      );
    });
  });

  // ── fetchText() ────────────────────────────────────────────────────────────

  describe('fetchText()', () => {
    it('returns the file content as a UTF-8 string', async () => {
      mockDownload.mockResolvedValue([Buffer.from('hello skill')]);

      const result = await provider.fetchText('skills/user123/skill.md');

      expect(mockFile).toHaveBeenCalledWith('skills/user123/skill.md');
      expect(result).toBe('hello skill');
    });

    it('throws NotFoundException when GCS responds with code 404', async () => {
      const err = Object.assign(new Error('No such object'), { code: 404 });
      mockDownload.mockRejectedValue(err);

      await expect(provider.fetchText('missing/key.md')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('re-throws non-404 GCS errors', async () => {
      const err = Object.assign(new Error('Access denied'), { code: 403 });
      mockDownload.mockRejectedValue(err);

      await expect(provider.fetchText('some/key.md')).rejects.toThrow(
        'Access denied',
      );
    });
  });

  // ── deleteObject() ─────────────────────────────────────────────────────────

  describe('deleteObject()', () => {
    it('calls GCS delete with the specified key', async () => {
      await provider.deleteObject('media/user123/photo.jpg');

      expect(mockFile).toHaveBeenCalledWith('media/user123/photo.jpg');
      expect(mockDelete).toHaveBeenCalled();
    });

    it('is idempotent — does not throw when GCS returns code 404', async () => {
      const err = Object.assign(new Error('Not found'), { code: 404 });
      mockDelete.mockRejectedValue(err);

      await expect(
        provider.deleteObject('already-deleted'),
      ).resolves.not.toThrow();
    });

    it('re-throws non-404 GCS errors', async () => {
      const err = Object.assign(new Error('Permission denied'), { code: 403 });
      mockDelete.mockRejectedValue(err);

      await expect(provider.deleteObject('some/key')).rejects.toThrow(
        'Permission denied',
      );
    });
  });
});
