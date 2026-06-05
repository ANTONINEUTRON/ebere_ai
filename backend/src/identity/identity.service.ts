import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { LinkRequest, LinkRequestDocument } from './link-request.schema';

export interface ResolvedUser {
  user: UserDocument;
  /** True when another Ebere account shares the same externalId (phone / handle). */
  suggestLinking: boolean;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly usersService: UsersService,
    @InjectModel(LinkRequest.name)
    private readonly linkRequestModel: Model<LinkRequestDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Entry point for all channel controllers.
   * Upserts the canonical user, then silently checks whether the same
   * external ID exists on a different account — if so, sets `suggestLinking`.
   */
  async resolveUser(
    provider: 'whatsapp' | 'telegram' | 'email',
    externalId: string,
    _channelMeta?: Record<string, unknown>,
  ): Promise<ResolvedUser> {
    const user = await this.usersService.upsertUser(provider, externalId);
    const duplicate = await this.checkForDuplicateIdentity(
      externalId,
      user._id.toString(),
    );
    return { user, suggestLinking: duplicate !== null };
  }

  /**
   * Returns any other user whose `identities` array contains the same
   * `externalId` (phone / Telegram user ID / email) on a different account.
   * `excludeUserId` is the already-resolved user so we do not flag them
   * against themselves.
   */
  async checkForDuplicateIdentity(
    externalId: string,
    excludeUserId?: string,
  ): Promise<UserDocument | null> {
    const query: Record<string, unknown> = {
      'identities.externalId': externalId,
    };
    if (excludeUserId) {
      query['_id'] = { $ne: new Types.ObjectId(excludeUserId) };
    }
    return this.userModel.findOne(query).exec();
  }

  /**
   * Creates a 6-character alphanumeric link code valid for 10 minutes.
   * The caller (code generator) will become the **primary** user if the
   * code is later verified.
   */
  async generateLinkCode(
    userId: string,
    channel: 'whatsapp' | 'telegram' | 'email',
  ): Promise<string> {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.linkRequestModel.create({
      fromUserId: new Types.ObjectId(userId),
      code,
      channel,
      expiresAt,
    });
    return code;
  }

  /**
   * Validates the code, merges `incomingUserId` (secondary) into the code
   * generator (primary), marks the request as used, and returns the primary
   * user document.
   * Throws `BadRequestException` when the code is invalid or expired.
   */
  async verifyLinkCode(
    incomingUserId: string,
    code: string,
  ): Promise<UserDocument> {
    const request = await this.linkRequestModel
      .findOne({
        code: code.toUpperCase(),
        expiresAt: { $gt: new Date() },
        usedAt: { $exists: false },
      })
      .exec();

    if (!request) {
      throw new BadRequestException('Invalid or expired link code.');
    }

    const primaryUserId = request.fromUserId.toString();
    await this.mergeAccounts(primaryUserId, incomingUserId);

    await this.linkRequestModel
      .findByIdAndUpdate(request._id, {
        $set: {
          usedAt: new Date(),
          mergedIntoUserId: new Types.ObjectId(primaryUserId),
        },
      })
      .exec();

    return (await this.userModel.findById(primaryUserId).exec())!;
  }

  /**
   * Moves all identities from `secondaryUserId` onto `primaryUserId`
   * (skipping any that already exist there), clears the secondary's
   * `identities` array, and stamps `mergedInto` so it is recognisable as
   * a ghost account.
   */
  async mergeAccounts(
    primaryUserId: string,
    secondaryUserId: string,
  ): Promise<void> {
    const secondary = await this.userModel.findById(secondaryUserId).exec();
    if (!secondary) throw new NotFoundException('Secondary user not found.');

    const primary = await this.userModel.findById(primaryUserId).exec();
    if (!primary) throw new NotFoundException('Primary user not found.');

    // Identities on secondary that are not already on primary
    const existingKeys = new Set(
      primary.identities.map((i) => `${i.provider}:${i.externalId}`),
    );
    const newIdentities = secondary.identities
      .filter((i) => !existingKeys.has(`${i.provider}:${i.externalId}`))
      .map((i) => ({
        provider: i.provider,
        externalId: i.externalId,
        verified: i.verified,
        ...(i.verifiedAt ? { verifiedAt: i.verifiedAt } : {}),
      }));

    if (newIdentities.length > 0) {
      await this.userModel
        .findByIdAndUpdate(primaryUserId, {
          $push: { identities: { $each: newIdentities } },
        })
        .exec();
    }

    // Clear the secondary and mark it merged
    await this.userModel
      .findByIdAndUpdate(secondaryUserId, {
        $set: {
          identities: [],
          mergedInto: new Types.ObjectId(primaryUserId),
        },
      })
      .exec();
  }
}
