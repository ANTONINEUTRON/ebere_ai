import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Types } from 'mongoose';
import { SchedulesService } from './schedules.service';
import { Schedule } from './schedule.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { MemoryService } from '../memory/memory.service';

const makeId = () => new Types.ObjectId().toString();

function modelMock() {
  const docs: Record<string, unknown>[] = [];
  const mock = {
    create: jest
      .fn()
      .mockImplementation((d: Record<string, unknown>) => Promise.resolve(d)),
    find: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
      sort: jest.fn().mockReturnThis(),
    }),
    findById: jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  };
  void docs;
  return mock;
}

describe('SchedulesService', () => {
  let service: SchedulesService;
  let model: ReturnType<typeof modelMock>;
  let notificationsService: { enqueueDelivery: jest.Mock };
  let memoryService: {
    aggregateFinancials: jest.Mock;
    searchRecords: jest.Mock;
  };

  beforeEach(async () => {
    model = modelMock();
    notificationsService = {
      enqueueDelivery: jest.fn().mockResolvedValue(undefined),
    };
    memoryService = {
      aggregateFinancials: jest.fn().mockResolvedValue({
        totalIncome: 100000,
        totalExpenses: 50000,
        net: 50000,
        dataNote: '(Based on 5 entries logged with Ebere)',
      }),
      searchRecords: jest.fn().mockResolvedValue([]),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: getModelToken(Schedule.name), useValue: model },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: MemoryService, useValue: memoryService },
        {
          provide: ModuleRef,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(SchedulesService);
  });

  describe('createSchedule', () => {
    it('stores the cronExpression and computes a valid nextRunAt Date', async () => {
      const userId = makeId();
      const cronExpression = '0 9 * * 1'; // every Monday at 09:00

      await service.createSchedule(userId, {
        name: 'Flutter job search',
        cronExpression,
        task: { type: 'web_search', query: 'remote Flutter jobs' },
      });

      expect(model.create).toHaveBeenCalledTimes(1);
      const arg = (model.create.mock.calls[0] as [Record<string, unknown>])[0];
      expect(arg.cronExpression).toBe('0 9 * * 1');
      expect(arg.nextRunAt).toBeInstanceOf(Date);
      expect((arg.nextRunAt as Date).getTime()).toBeGreaterThan(
        Date.now() - 1000,
      );
      expect(arg.isActive).toBe(true);
    });

    it('stores the task correctly', async () => {
      const userId = makeId();
      await service.createSchedule(userId, {
        name: 'Monthly report',
        cronExpression: '0 8 1 * *',
        task: { type: 'financial_report', period: 'month' },
      });

      const arg = (model.create.mock.calls[0] as [Record<string, unknown>])[0];
      expect((arg.task as Record<string, unknown>).type).toBe(
        'financial_report',
      );
    });
  });

  describe('listSchedules', () => {
    it('queries by userId', async () => {
      const userId = makeId();
      model.find.mockReturnValue({
        sort: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      });
      await service.listSchedules(userId);
      expect(model.find).toHaveBeenCalledWith({
        userId: new Types.ObjectId(userId),
      });
    });
  });

  describe('pauseSchedule', () => {
    it('sets isActive to false when called by the owner', async () => {
      const userId = makeId();
      const scheduleId = new Types.ObjectId().toString();
      const ownerId = new Types.ObjectId(userId);

      model.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(scheduleId),
          userId: ownerId,
          isActive: true,
        }),
      });

      await service.pauseSchedule(userId, scheduleId);

      expect(model.updateOne).toHaveBeenCalledWith(
        { _id: scheduleId },
        { $set: { isActive: false } },
      );
    });

    it('throws NotFoundException when schedule does not exist', async () => {
      model.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.pauseSchedule(makeId(), makeId())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when userId does not match', async () => {
      const scheduleId = new Types.ObjectId().toString();
      model.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(scheduleId),
          userId: new Types.ObjectId(), // different user
          isActive: true,
        }),
      });
      await expect(service.pauseSchedule(makeId(), scheduleId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('deleteSchedule', () => {
    it('deletes the schedule when called by the owner', async () => {
      const userId = makeId();
      const scheduleId = new Types.ObjectId().toString();

      model.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(scheduleId),
          userId: new Types.ObjectId(userId),
        }),
      });

      await service.deleteSchedule(userId, scheduleId);
      expect(model.deleteOne).toHaveBeenCalledWith({ _id: scheduleId });
    });
  });

  describe('runDueSchedules', () => {
    it('skips paused schedules (find only queries isActive: true)', async () => {
      // Simulate: no active+due schedules returned (paused ones excluded by DB query)
      model.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });

      await service.runDueSchedules();

      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
      expect(notificationsService.enqueueDelivery).not.toHaveBeenCalled();
    });

    it('executes a financial_report task and enqueues delivery', async () => {
      const userId = makeId();
      const scheduleId = new Types.ObjectId();

      model.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            _id: scheduleId,
            userId: new Types.ObjectId(userId),
            name: 'Monthly report',
            cronExpression: '0 8 1 * *',
            isActive: true,
            task: { type: 'financial_report', period: 'month' },
          },
        ]),
      });

      await service.runDueSchedules();

      expect(memoryService.aggregateFinancials).toHaveBeenCalledWith(
        userId,
        expect.any(Date),
        expect.any(Date),
      );
      expect(notificationsService.enqueueDelivery).toHaveBeenCalledWith(
        userId,
        expect.stringContaining('financial report'),
      );
      expect(model.updateOne).toHaveBeenCalledWith(
        { _id: scheduleId },
        expect.objectContaining({
          $set: expect.objectContaining({
            lastRunAt: expect.any(Date),
            nextRunAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});
