import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoSessionService } from './mongo-session.service';
import { AiSession } from './session.schema';

const mockModel = {
  create: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn(),
  deleteOne: jest.fn(),
};

describe('MongoSessionService', () => {
  let service: MongoSessionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MongoSessionService,
        { provide: getModelToken(AiSession.name), useValue: mockModel },
      ],
    }).compile();
    service = module.get(MongoSessionService);
  });

  it('createSession → getSession roundtrip returns correct state', async () => {
    const state = { greeting: 'hello' };
    const now = Date.now();

    // createSession
    mockModel.create.mockResolvedValueOnce({});
    const session = await service.createSession({
      appName: 'ebere',
      userId: 'user1',
      state,
      sessionId: 'sess1',
    });
    expect(session.id).toBe('sess1');
    expect(session.state).toEqual(state);
    expect(session.appName).toBe('ebere');
    expect(session.userId).toBe('user1');

    // getSession
    mockModel.findOne.mockReturnValueOnce({
      lean: () =>
        Promise.resolve({
          adkSessionId: 'sess1',
          appName: 'ebere',
          userId: 'user1',
          state: { greeting: 'hello' },
          events: [],
          lastUpdateTime: now,
        }),
    });
    const found = await service.getSession({
      appName: 'ebere',
      userId: 'user1',
      sessionId: 'sess1',
    });
    expect(found?.id).toBe('sess1');
    expect(found?.state).toEqual({ greeting: 'hello' });
  });

  it('getSession returns undefined when not found', async () => {
    mockModel.findOne.mockReturnValueOnce({
      lean: () => Promise.resolve(null),
    });
    const result = await service.getSession({
      appName: 'ebere',
      userId: 'u',
      sessionId: 'none',
    });
    expect(result).toBeUndefined();
  });
});
