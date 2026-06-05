import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { MediaService } from './media.service';
import { MediaFile } from './media-file.schema';
import { STORAGE_PROVIDER } from './storage-provider.interface';

const mockObjectId = new Types.ObjectId();
const mockUserId = new Types.ObjectId().toString();

const mockModel = {
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findById: jest.fn(),
};

const mockProvider = {
  store: jest.fn(),
};

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: getModelToken(MediaFile.name), useValue: mockModel },
        { provide: STORAGE_PROVIDER, useValue: mockProvider },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  describe('store', () => {
    it('calls provider, creates doc, returns mediaFileId', async () => {
      mockProvider.store.mockResolvedValueOnce({
        storagePath: `uploads/${mockUserId}/file.jpg`,
      });
      mockModel.create.mockResolvedValueOnce({ _id: mockObjectId });

      const id = await service.store(
        Buffer.from('test'),
        'image/jpeg',
        mockUserId,
        'telegram',
      );

      expect(mockProvider.store).toHaveBeenCalledWith(
        Buffer.from('test'),
        'image/jpeg',
        mockUserId,
      );
      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: 'image/jpeg',
          storagePath: `uploads/${mockUserId}/file.jpg`,
          channel: 'telegram',
        }),
      );
      expect(id).toBe(mockObjectId.toString());
    });
  });

  describe('linkToRecord', () => {
    it('updates linkedCollection and linkedId', async () => {
      mockModel.findByIdAndUpdate.mockResolvedValueOnce({});
      const recordId = new Types.ObjectId().toString();

      await service.linkToRecord('mediaId', 'posts', recordId);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'mediaId',
        expect.objectContaining({ linkedCollection: 'posts' }),
      );
    });
  });

  describe('getStoredFile', () => {
    it('returns the media document', async () => {
      const fakeDoc = { _id: mockObjectId, storagePath: 'uploads/u1/file.jpg' };
      mockModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValueOnce(fakeDoc),
      });

      const result = await service.getStoredFile(mockObjectId.toString());

      expect(result).toEqual(fakeDoc);
    });
  });
});
