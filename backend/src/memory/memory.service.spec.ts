import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Types } from 'mongoose';
import { MemoryService } from './memory.service';
import { Memory } from './memory.schema';
import { UsersService } from '../users/users.service';

const MEMORY_MODEL = getModelToken(Memory.name);
const QUEUE_TOKEN = getQueueToken('notifications');

function makeId() {
  return new Types.ObjectId().toString();
}

function mockModel(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const docs: Record<string, unknown>[] = [];

  const create = jest
    .fn()
    .mockImplementation(async (data: Record<string, unknown>) => {
      const id = new Types.ObjectId();
      const doc = { ...data, _id: id, metadata: data.metadata ?? {} };
      docs.push(doc);
      return doc;
    });

  const find = jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  });

  const findById = jest.fn().mockResolvedValue(null);
  const findByIdAndUpdate = jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
  const deleteOne = jest.fn().mockResolvedValue({});
  const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
  const aggregate = jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
  const updateOne = jest.fn().mockResolvedValue({});

  return {
    create,
    find,
    findById,
    findByIdAndUpdate,
    deleteOne,
    updateMany,
    aggregate,
    updateOne,
    _docs: docs,
    ...overrides,
  };
}

function mockQueue() {
  return { add: jest.fn().mockResolvedValue({}) };
}

function mockUsersService() {
  return {
    getUserById: jest.fn().mockResolvedValue(null),
  };
}

describe('MemoryService', () => {
  let service: MemoryService;
  let model: ReturnType<typeof mockModel>;
  let queue: ReturnType<typeof mockQueue>;
  let usersService: ReturnType<typeof mockUsersService>;

  beforeEach(async () => {
    model = mockModel();
    queue = mockQueue();
    usersService = mockUsersService();

    const module = await Test.createTestingModule({
      providers: [
        MemoryService,
        { provide: MEMORY_MODEL, useValue: model },
        { provide: QUEUE_TOKEN, useValue: queue },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get(MemoryService);
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('saveRecord', () => {
    it('creates a ledger record and returns its id', async () => {
      const userId = makeId();
      const id = await service.saveRecord(userId, 'ledger', {
        amount: 5000,
        currency: '₦',
        metadata: { transactionType: 'income' },
      });
      expect(typeof id).toBe('string');
      expect(model.create).toHaveBeenCalledTimes(1);
      const created = model.create.mock.calls[0][0] as Record<string, unknown>;
      expect(created.type).toBe('ledger');
      expect(created.amount).toBe(5000);
    });

    it('saves a post and calls matchAndNotify when intent is set', async () => {
      const userId = makeId();
      // matchAndNotify calls find internally — return empty to avoid cascading issues
      model.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.saveRecord(userId, 'post', {
        intent: 'offer',
        category: 'healthcare',
        neighborhood: 'Ikeja',
        metadata: { title: 'Free consultation' },
      });

      expect(model.create).toHaveBeenCalled();
      // find is called inside matchAndNotify
      expect(model.find).toHaveBeenCalled();
    });

    it('ledger and post both use the same collection (same model)', async () => {
      const userId = makeId();
      model.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.saveRecord(userId, 'ledger', { amount: 100, metadata: {} });
      await service.saveRecord(userId, 'post', {
        intent: 'need',
        category: 'housing',
        metadata: {},
      });

      expect(model.create).toHaveBeenCalledTimes(2);
      expect(model.create.mock.calls[0][0].type).toBe('ledger');
      expect(model.create.mock.calls[1][0].type).toBe('post');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('searchRecords', () => {
    it('always applies type filter', async () => {
      const userId = makeId();
      await service.searchRecords(userId, 'post', {});
      const callArg = model.find.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.type).toBe('post');
    });

    it('scopes ledger search to requesting userId', async () => {
      const userId = makeId();
      await service.searchRecords(userId, 'ledger', {});
      const callArg = model.find.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.type).toBe('ledger');
      expect(callArg.userId).toBeDefined();
    });

    it('does NOT scope post search to a single userId', async () => {
      const userId = makeId();
      await service.searchRecords(userId, 'post', {});
      const callArg = model.find.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.userId).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('aggregateFinancials', () => {
    it('computes correct totals and net from aggregation results', async () => {
      const userId = makeId();
      model.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: 'income', total: 30000, count: 3 },
          { _id: 'expense', total: 12000, count: 2 },
        ]),
      });

      const report = await service.aggregateFinancials(
        userId,
        new Date('2024-01-01'),
        new Date('2024-01-31'),
      );

      expect(report.totalIncome).toBe(30000);
      expect(report.totalExpenses).toBe(12000);
      expect(report.net).toBe(18000);
      expect(report.entryCount).toBe(5);
      expect(report.dataNote).toBeTruthy();
    });

    it('returns zeroes when there are no entries', async () => {
      const userId = makeId();
      model.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      const report = await service.aggregateFinancials(
        userId,
        new Date(),
        new Date(),
      );
      expect(report.totalIncome).toBe(0);
      expect(report.totalExpenses).toBe(0);
      expect(report.net).toBe(0);
      expect(report.entryCount).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('getInventorySnapshot', () => {
    it('returns only active items and computes total value correctly', async () => {
      const userId = makeId();
      const mockDocs = [
        {
          _id: new Types.ObjectId(),
          quantity: 10,
          metadata: {
            name: 'Rice bag',
            unitPrice: 18000,
            lowStockThreshold: 5,
          },
          status: 'active',
        },
        {
          _id: new Types.ObjectId(),
          quantity: 3,
          metadata: {
            name: 'Beans bag',
            unitPrice: 12000,
            lowStockThreshold: 5,
          },
          status: 'active',
        },
      ];
      model.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDocs),
      });

      const report = await service.getInventorySnapshot(userId);

      expect(report.totalItems).toBe(2);
      expect(report.totalValue).toBe(10 * 18000 + 3 * 12000);
      expect(report.items[0].lowStock).toBe(false); // 10 > 5
      expect(report.items[1].lowStock).toBe(true); // 3 <= 5
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('expressInterest', () => {
    it('throws BadRequestException when the user is the post owner', async () => {
      const userId = makeId();
      const memoryId = new Types.ObjectId().toString();
      model.findById.mockResolvedValue({
        _id: new Types.ObjectId(memoryId),
        userId: new Types.ObjectId(userId),
        metadata: {},
        equals: (other: Types.ObjectId) =>
          other.equals(new Types.ObjectId(userId)),
      });

      await expect(service.expressInterest(userId, memoryId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when user already expressed interest', async () => {
      const ownerId = makeId();
      const fromUserId = makeId();
      const memoryId = new Types.ObjectId().toString();

      const ownerObjId = new Types.ObjectId(ownerId);
      model.findById.mockResolvedValue({
        _id: new Types.ObjectId(memoryId),
        userId: ownerObjId,
        metadata: { interestedParties: [fromUserId] },
        category: 'task',
      });

      await expect(
        service.expressInterest(fromUserId, memoryId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('matchAndNotify', () => {
    it('enqueues exactly 1 batch-notify job when matches exist', async () => {
      const userId = makeId();
      const category = 'healthcare';

      const mockMatches = [
        {
          _id: new Types.ObjectId(),
          userId: new Types.ObjectId(makeId()),
          category,
        },
        {
          _id: new Types.ObjectId(),
          userId: new Types.ObjectId(makeId()),
          category,
        },
      ];

      model.find.mockReturnValue({
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockMatches),
      });

      const fakeMemory = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(userId),
        type: 'post',
        intent: 'offer',
        category,
        neighborhood: 'Ikeja',
        status: 'active',
        metadata: {},
      } as unknown as import('./memory.schema').MemoryDocument;

      await service.matchAndNotify(fakeMemory);

      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add.mock.calls[0][0]).toBe('batch-notify');
    });

    it('does not enqueue a job when there are no matches', async () => {
      model.find.mockReturnValue({
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      const fakeMemory = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(makeId()),
        type: 'post',
        intent: 'need',
        category: 'housing',
        status: 'active',
        metadata: {},
      } as unknown as import('./memory.schema').MemoryDocument;

      await service.matchAndNotify(fakeMemory);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('adjustStock', () => {
    it('throws BadRequestException when stock would go negative', async () => {
      const userId = makeId();
      const memoryId = new Types.ObjectId().toString();
      const ownerObjId = new Types.ObjectId(userId);

      model.findById.mockResolvedValue({
        _id: new Types.ObjectId(memoryId),
        userId: ownerObjId,
        quantity: 2,
        metadata: { name: 'Rice', unitPrice: 18000, unitCost: 14000 },
        currency: '₦',
      });

      await expect(
        service.adjustStock(userId, memoryId, -3, 'sale'),
      ).rejects.toThrow(BadRequestException);
    });

    it('decrements stock and creates a ledger entry for a sale', async () => {
      const userId = makeId();
      const memoryId = new Types.ObjectId().toString();
      const ownerObjId = new Types.ObjectId(userId);

      const inventoryDoc = {
        _id: new Types.ObjectId(memoryId),
        userId: ownerObjId,
        quantity: 10,
        metadata: { name: 'Rice', unitPrice: 18000, unitCost: 14000 },
        currency: '₦',
      };

      model.findById.mockResolvedValue(inventoryDoc);
      model.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...inventoryDoc, quantity: 7 }),
      });
      // Second findById for the ledger saveRecord → we don't need it to succeed
      model.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.adjustStock(userId, memoryId, -3, 'sale');

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        memoryId,
        { $inc: { quantity: -3 } },
        { new: true },
      );

      // A ledger record is created for the sale (amount = 3 × 18000 = 54000)
      expect(model.create).toHaveBeenCalledTimes(1);
      const ledgerData = model.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(ledgerData.type).toBe('ledger');
      expect(ledgerData.amount).toBe(54000);
    });
  });
});
