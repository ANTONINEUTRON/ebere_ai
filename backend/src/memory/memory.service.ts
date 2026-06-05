import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Queue } from 'bullmq';
import { Memory, MemoryDocument } from './memory.schema';
import { UsersService } from '../users/users.service';

export interface SearchFilters {
  intent?: string;
  category?: string;
  neighborhood?: string;
  status?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface FinancialReport {
  totalIncome: number;
  totalExpenses: number;
  net: number;
  entryCount: number;
  dataNote: string;
}

export interface InventoryReport {
  items: {
    memoryId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalValue: number;
    lowStock: boolean;
  }[];
  totalItems: number;
  totalValue: number;
  dataNote: string;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectModel(Memory.name)
    private readonly memoryModel: Model<MemoryDocument>,
    @InjectQueue('notifications') private readonly queue: Queue,
    private readonly usersService: UsersService,
  ) {}

  async saveRecord(
    userId: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const {
      amount,
      quantity,
      date,
      status,
      intent,
      category,
      neighborhood,
      currency,
      mediaFileIds,
      metadata,
    } = data;

    const doc = await this.memoryModel.create({
      userId: new Types.ObjectId(userId),
      type,
      ...(amount !== undefined ? { amount: Number(amount) } : {}),
      ...(quantity !== undefined ? { quantity: Number(quantity) } : {}),
      ...(date ? { date: new Date(date as string) } : {}),
      ...(status ? { status: String(status) } : {}),
      ...(intent ? { intent: String(intent) } : {}),
      ...(category ? { category: String(category) } : {}),
      ...(neighborhood ? { neighborhood: String(neighborhood) } : {}),
      ...(currency ? { currency: String(currency) } : {}),
      ...(Array.isArray(mediaFileIds) ? { mediaFileIds } : {}),
      metadata: (metadata as Record<string, unknown>) ?? {},
    });

    if (type === 'post' && intent) {
      await this.matchAndNotify(doc).catch((err) =>
        this.logger.warn('matchAndNotify failed', err),
      );
    }

    return doc._id.toString();
  }

  async searchRecords(
    userId: string,
    type: string,
    filters: SearchFilters,
  ): Promise<MemoryDocument[]> {
    const query: Record<string, unknown> = { type };

    // Posts are a community board — search across all users
    // Ledger / inventory are private — scope to caller
    if (type !== 'post') {
      query.userId = new Types.ObjectId(userId);
    }

    if (filters.intent) query.intent = filters.intent;
    if (filters.category) query.category = filters.category;
    if (filters.neighborhood) query.neighborhood = filters.neighborhood;

    if (filters.status !== undefined) {
      query.status = filters.status;
    } else if (type === 'post') {
      query.status = 'active';
    }

    if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
      const amountFilter: Record<string, number> = {};
      if (filters.minAmount !== undefined)
        amountFilter.$gte = filters.minAmount;
      if (filters.maxAmount !== undefined)
        amountFilter.$lte = filters.maxAmount;
      query.amount = amountFilter;
    }

    return this.memoryModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .exec();
  }

  async updateRecord(
    userId: string,
    memoryId: string,
    changes: Record<string, unknown>,
  ): Promise<MemoryDocument | null> {
    const doc = await this.memoryModel.findById(memoryId);
    if (!doc) return null;
    if (!doc.userId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('You do not own this record');
    }

    const { metadata, ...coreChanges } = changes;
    const update: Record<string, unknown> = { ...coreChanges };
    if (metadata) {
      update.metadata = {
        ...doc.metadata,
        ...(metadata as Record<string, unknown>),
      };
    }
    return this.memoryModel
      .findByIdAndUpdate(memoryId, { $set: update }, { new: true })
      .exec();
  }

  async deleteRecord(userId: string, memoryId: string): Promise<void> {
    const doc = await this.memoryModel.findById(memoryId);
    if (!doc) return;
    if (!doc.userId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('You do not own this record');
    }
    await this.memoryModel.deleteOne({ _id: memoryId });
  }

  async getUserRecords(
    userId: string,
    type?: string,
    status?: string,
  ): Promise<MemoryDocument[]> {
    const query: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };
    if (type) query.type = type;
    if (status) query.status = status;
    return this.memoryModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async aggregateFinancials(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<FinancialReport> {
    const results = await this.memoryModel
      .aggregate([
        {
          $match: {
            userId: new Types.ObjectId(userId),
            type: 'ledger',
            date: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: '$metadata.transactionType',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    let totalIncome = 0;
    let totalExpenses = 0;
    let entryCount = 0;

    for (const r of results) {
      if (r._id === 'income') {
        totalIncome = r.total;
        entryCount += r.count;
      }
      if (r._id === 'expense') {
        totalExpenses = r.total;
        entryCount += r.count;
      }
    }

    return {
      totalIncome,
      totalExpenses,
      net: totalIncome - totalExpenses,
      entryCount,
      dataNote:
        "This report covers only what you've logged with me — if you have income or expenses you haven't shared, your actual totals may differ.",
    };
  }

  async getInventorySnapshot(userId: string): Promise<InventoryReport> {
    const docs = await this.memoryModel
      .find({
        userId: new Types.ObjectId(userId),
        type: 'inventory',
        status: 'active',
      })
      .exec();

    let totalValue = 0;
    const items = docs.map((doc) => {
      const meta = doc.metadata;
      const qty = doc.quantity ?? 0;
      const unitPrice = Number(meta.unitPrice ?? 0);
      const itemValue = qty * unitPrice;
      const lowStockThreshold = Number(meta.lowStockThreshold ?? 5);
      totalValue += itemValue;
      return {
        memoryId: doc._id.toString(),
        name: String(meta.name ?? 'Unknown item'),
        quantity: qty,
        unitPrice,
        totalValue: itemValue,
        lowStock: qty <= lowStockThreshold,
      };
    });

    return {
      items,
      totalItems: items.length,
      totalValue,
      dataNote: `Showing ${items.length} tracked item${items.length !== 1 ? 's' : ''}.`,
    };
  }

  async expressInterest(
    fromUserId: string,
    memoryId: string,
  ): Promise<Record<string, unknown>> {
    const doc = await this.memoryModel.findById(memoryId);
    if (!doc) throw new BadRequestException('Record not found');
    if (doc.userId.equals(new Types.ObjectId(fromUserId))) {
      throw new BadRequestException(
        'You cannot express interest in your own post',
      );
    }

    const interestedParties =
      (doc.metadata.interestedParties as string[]) ?? [];
    if (interestedParties.includes(fromUserId)) {
      throw new BadRequestException(
        'You have already expressed interest in this post',
      );
    }

    await this.memoryModel.updateOne(
      { _id: memoryId },
      { $push: { 'metadata.interestedParties': fromUserId } },
    );

    await this.queue.add('send-message', {
      jobType: 'send-message',
      userId: doc.userId.toString(),
      message: `Someone is interested in your ${doc.category ?? 'post'}. Reply to connect.`,
    });

    return { status: 'interest_expressed', category: doc.category };
  }

  async matchAndNotify(memory: MemoryDocument): Promise<void> {
    if (!memory.category) return;

    const oppositeIntent = memory.intent === 'offer' ? 'need' : 'offer';
    const matchQuery: Record<string, unknown> = {
      type: 'post',
      intent: oppositeIntent,
      category: memory.category,
      status: 'active',
    };
    if (memory.neighborhood) matchQuery.neighborhood = memory.neighborhood;

    const matches = await this.memoryModel.find(matchQuery).limit(10).exec();
    if (!matches.length) return;

    await this.queue.add('batch-notify', {
      jobType: 'batch-notify',
      message: '',
      newPosterId: memory.userId.toString(),
      seekerUserIds: matches.map((m) => m.userId.toString()),
      category: memory.category,
      neighborhood: memory.neighborhood ?? null,
      newPosterIntent: memory.intent,
    });

    this.logger.log(
      `matchAndNotify: ${matches.length} match(es) for category=${memory.category}`,
    );
  }

  @Cron('0 * * * *')
  async expireOldPosts(): Promise<void> {
    const result = await this.memoryModel.updateMany(
      {
        type: 'post',
        status: 'active',
        'metadata.expiresAt': { $lte: new Date() },
      },
      { $set: { status: 'expired' } },
    );
    if (result.modifiedCount > 0) {
      this.logger.log(`Expired ${result.modifiedCount} old post(s)`);
    }
  }

  async adjustStock(
    userId: string,
    memoryId: string,
    delta: number,
    reason: 'sale' | 'purchase' | 'adjustment',
  ): Promise<MemoryDocument> {
    const doc = await this.memoryModel.findById(memoryId);
    if (!doc) throw new BadRequestException('Inventory record not found');
    if (!doc.userId.equals(new Types.ObjectId(userId))) {
      throw new ForbiddenException('You do not own this inventory record');
    }

    const newQty = (doc.quantity ?? 0) + delta;
    if (newQty < 0) {
      throw new BadRequestException('Stock cannot go below zero');
    }

    const updated = await this.memoryModel
      .findByIdAndUpdate(memoryId, { $inc: { quantity: delta } }, { new: true })
      .exec();

    if (reason === 'sale' || reason === 'purchase') {
      const meta = doc.metadata;
      const unitPrice =
        Number(reason === 'sale' ? meta.unitPrice : meta.unitCost) || 0;
      const amount = Math.abs(delta) * unitPrice;
      await this.saveRecord(userId, 'ledger', {
        amount,
        currency: doc.currency,
        date: new Date().toISOString(),
        metadata: {
          transactionType: reason === 'sale' ? 'income' : 'expense',
          vendor: reason === 'sale' ? 'sale' : 'supplier',
          description: `${reason === 'sale' ? 'Sold' : 'Purchased'} ${Math.abs(delta)} unit(s) of ${meta.name ?? 'item'}`,
        },
      });
    }

    return updated!;
  }

  async listInterestedUsers(
    postOwnerId: string,
    memoryId: string,
    offset = 0,
  ): Promise<{
    users: { userId: string; name: string; neighborhood: string }[];
    total: number;
    hasMore: boolean;
  }> {
    const doc = await this.memoryModel.findById(memoryId);
    if (!doc) throw new BadRequestException('Record not found');
    if (!doc.userId.equals(new Types.ObjectId(postOwnerId))) {
      throw new ForbiddenException('You do not own this record');
    }

    const all = (doc.metadata.interestedParties as string[]) ?? [];
    const approved = new Set(
      (doc.metadata.approvedConnections as string[]) ?? [],
    );
    const declined = new Set(
      (doc.metadata.declinedConnections as string[]) ?? [],
    );
    const pending = all.filter((id) => !approved.has(id) && !declined.has(id));

    const page = pending.slice(offset, offset + 2);
    const users = await Promise.all(
      page.map(async (userId) => {
        const user = await this.usersService.getUserById(userId);
        const profile = user?.profile ?? {};
        return {
          userId,
          name: String(profile.name ?? 'Unknown'),
          neighborhood: String(profile.neighborhood ?? 'Unknown area'),
        };
      }),
    );

    return {
      users,
      total: pending.length,
      hasMore: offset + 2 < pending.length,
    };
  }

  async approveContact(
    postOwnerId: string,
    memoryId: string,
    interestedUserId: string,
  ): Promise<{ status: string; platform: string }> {
    const doc = await this.memoryModel.findById(memoryId);
    if (!doc) throw new BadRequestException('Record not found');
    if (!doc.userId.equals(new Types.ObjectId(postOwnerId))) {
      throw new ForbiddenException('You do not own this record');
    }

    const owner = await this.usersService.getUserById(postOwnerId);
    const profile = owner?.profile ?? {};
    const primaryIdentity = owner?.identities?.[0];
    const platform = primaryIdentity
      ? primaryIdentity.provider.charAt(0).toUpperCase() +
        primaryIdentity.provider.slice(1)
      : 'Ebere';

    const contactLines: string[] = [];
    if (profile.name) contactLines.push(`Name: ${profile.name}`);
    if (profile.neighborhood)
      contactLines.push(`Area: ${profile.neighborhood}`);
    if (profile.phoneNumber) contactLines.push(`Phone: ${profile.phoneNumber}`);
    if (profile.email) contactLines.push(`Email: ${profile.email}`);
    const contactCard = contactLines.join('\n');

    await this.memoryModel.updateOne(
      { _id: memoryId },
      { $addToSet: { 'metadata.approvedConnections': interestedUserId } },
    );

    const interestedUser =
      await this.usersService.getUserById(interestedUserId);
    const interestedName = String(
      (interestedUser?.profile ?? {}).name ?? 'Someone',
    );

    await this.queue.add('send-message', {
      jobType: 'send-message',
      message: `Great news! The person you were interested in has agreed to connect.\n\n${contactCard}\n\nReach out to them on ${platform} and mention you connected through Ebere.`,
      userId: interestedUserId,
    });

    await this.queue.add('send-message', {
      jobType: 'send-message',
      message: `Your contact details have been shared with ${interestedName}. They will reach out to you on ${platform}.`,
      userId: postOwnerId,
    });

    return { status: 'connected', platform };
  }

  async declineContact(
    postOwnerId: string,
    memoryId: string,
    interestedUserId: string,
  ): Promise<{ status: string }> {
    const doc = await this.memoryModel.findById(memoryId);
    if (!doc) throw new BadRequestException('Record not found');
    if (!doc.userId.equals(new Types.ObjectId(postOwnerId))) {
      throw new ForbiddenException('You do not own this record');
    }

    await this.memoryModel.updateOne(
      { _id: memoryId },
      { $addToSet: { 'metadata.declinedConnections': interestedUserId } },
    );

    return { status: 'declined' };
  }
}
