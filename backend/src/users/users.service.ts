import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Atomically find an existing user by (provider, externalId) or create a new one.
   * Uses findOneAndUpdate + upsert so concurrent requests are safe.
   */
  async upsertUser(
    provider: 'whatsapp' | 'telegram' | 'email',
    externalId: string,
  ): Promise<UserDocument> {
    const result = await this.userModel
      .findOneAndUpdate(
        {
          'identities.provider': provider,
          'identities.externalId': externalId,
        },
        {
          $setOnInsert: {
            identities: [{ provider, externalId, verified: false }],
          },
        },
        { upsert: true, new: true },
      )
      .exec();
    return result;
  }

  /** Find a user by a single identity. Returns `null` if not found. */
  async getUserByIdentity(
    provider: 'whatsapp' | 'telegram' | 'email',
    externalId: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        'identities.provider': provider,
        'identities.externalId': externalId,
      })
      .exec();
  }

  /**
   * Shallow-merge `patch` into the profile blob using dot-notation $set.
   * Each top-level key in `patch` is written as `profile.<key>` so existing
   * keys not present in `patch` are preserved.
   */
  async mergeProfilePatch(
    userId: string,
    patch: Record<string, unknown>,
  ): Promise<UserDocument | null> {
    const setOp: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      setOp[`profile.${key}`] = value;
    }
    return this.userModel
      .findByIdAndUpdate(userId, { $set: setOp }, { new: true })
      .exec();
  }

  /** Return a single field from the profile blob, or `null` if absent. */
  async getProfileField(userId: string, key: string): Promise<unknown> {
    const user = await this.userModel
      .findById(userId, { [`profile.${key}`]: 1 })
      .lean()
      .exec();
    if (!user) return null;
    return user.profile?.[key] ?? null;
  }

  /** Find a user by their MongoDB _id. Returns `null` if not found. */
  async getUserById(userId: string): Promise<UserDocument | null> {
    return this.userModel.findById(userId).exec();
  }

  /** Push a new identity onto the user's identities array, marked unverified. */
  async addPendingIdentity(
    userId: string,
    provider: 'whatsapp' | 'telegram' | 'email',
    externalId: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        userId,
        { $push: { identities: { provider, externalId, verified: false } } },
        { new: true },
      )
      .exec();
  }

  /**
   * Return the names of whichever critical onboarding fields are missing.
   * Currently checks: `name`, `neighborhood`.
   */
  async getMissingCriticalFields(userId: string): Promise<string[]> {
    const user = await this.userModel
      .findById(userId, { 'profile.name': 1, 'profile.neighborhood': 1 })
      .lean()
      .exec();
    if (!user) return ['name', 'neighborhood'];
    const profile = user.profile ?? {};
    const missing: string[] = [];
    if (!profile['name']) missing.push('name');
    if (!profile['neighborhood']) missing.push('neighborhood');
    return missing;
  }

  /** Return the agent name and tone configured for this user. */
  async getAgentConfig(
    userId: string,
  ): Promise<{ agentName: string; agentTone: string }> {
    const user = await this.userModel
      .findById(userId, { agentName: 1, agentTone: 1 })
      .lean()
      .exec();
    return {
      agentName:
        ((user as Record<string, unknown> | null)?.['agentName'] as string) ??
        'Ebere',
      agentTone:
        ((user as Record<string, unknown> | null)?.['agentTone'] as string) ??
        'warm',
    };
  }

  /**
   * Update the agent name and/or tone for a user.
   * Validates that name is 3–30 alphanumeric characters; tone is 1–50 alphanumeric characters.
   */
  async updateAgentConfig(
    userId: string,
    config: { agentName?: string; agentTone?: string },
  ): Promise<{ agentName: string; agentTone: string }> {
    const { agentName, agentTone } = config;
    const $set: Record<string, string> = {};

    if (agentName !== undefined) {
      if (agentName.length < 3) {
        throw new BadRequestException(
          'Agent name must be at least 3 characters.',
        );
      }
      if (agentName.length > 30) {
        throw new BadRequestException(
          'Agent name must be 30 characters or fewer.',
        );
      }
      if (!/^[a-zA-Z0-9 ]+$/.test(agentName)) {
        throw new BadRequestException(
          'Agent name may only contain letters, numbers, and spaces.',
        );
      }
      $set['agentName'] = agentName;
    }

    if (agentTone !== undefined) {
      if (!agentTone || agentTone.length > 50) {
        throw new BadRequestException(
          'Agent tone must be between 1 and 50 characters.',
        );
      }
      if (!/^[a-zA-Z0-9 ]+$/.test(agentTone)) {
        throw new BadRequestException(
          'Agent tone may only contain letters, numbers, and spaces.',
        );
      }
      $set['agentTone'] = agentTone;
    }

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set }, { new: true })
      .lean()
      .exec();

    return {
      agentName:
        ((updated as Record<string, unknown> | null)?.[
          'agentName'
        ] as string) ?? 'Ebere',
      agentTone:
        ((updated as Record<string, unknown> | null)?.[
          'agentTone'
        ] as string) ?? 'warm',
    };
  }
}
