import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

// ─── Identity subdocument ─────────────────────────────────────────────────────

@Schema({ _id: false })
export class Identity {
  @Prop({ required: true, enum: ['whatsapp', 'telegram', 'email'] })
  provider!: 'whatsapp' | 'telegram' | 'email';

  @Prop({ required: true })
  externalId!: string;

  @Prop({ default: false })
  verified!: boolean;

  @Prop()
  verifiedAt?: Date;
}

export const IdentitySchema = SchemaFactory.createForClass(Identity);

// ─── Plan subdocument (Phase 14.1) ────────────────────────────────────────────

@Schema({ _id: false })
export class Plan {
  @Prop({ default: 'free', enum: ['free', 'pro'] })
  tier!: 'free' | 'pro';

  @Prop({ default: 0 })
  messageCount!: number;

  @Prop({ default: () => new Date() })
  periodStart!: Date;

  @Prop({ default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
  periodResetAt!: Date;

  @Prop({ default: false })
  isBlocked!: boolean;

  @Prop({ default: false })
  pendingUpgrade!: boolean;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);

// ─── User document ────────────────────────────────────────────────────────────

@Schema({ timestamps: true })
export class User {
  /** Verified contact identities across all channels. */
  @Prop({ type: [IdentitySchema], default: [] })
  identities!: Identity[];

  /** Billing plan — managed by Phase 14. */
  @Prop({ type: PlanSchema, default: () => ({}) })
  plan!: Plan;

  /**
   * Free-form profile blob managed by the LLM.
   * Top-level keys: name, neighborhood, email, phoneNumber,
   * housingPreferences, businessName, occupation, preferredLanguage, regularMarket …
   * No schema change needed to store new attributes.
   */
  @Prop({ type: MongooseSchema.Types.Mixed, default: () => ({}) })
  profile!: Record<string, unknown>;

  /**
   * Set by `IdentityService.mergeAccounts()` — the ObjectId of the primary user
   * this account was merged into. A non-null value means this is a ghost account.
   */
  @Prop({ type: Types.ObjectId })
  mergedInto?: Types.ObjectId;

  /** Display name the agent uses when talking to this user. */
  @Prop({ default: 'Ebere' })
  agentName!: string;

  /** Communication tone injected into the system prompt. */
  @Prop({ default: 'warm' })
  agentTone!: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

// ─── Indexes (declared here, created on first connect) ────────────────────────

/** Prevent the same (provider, externalId) pair appearing on two users. */
UserSchema.index(
  { 'identities.provider': 1, 'identities.externalId': 1 },
  { unique: true, sparse: true },
);

/** Supports neighbourhood-based post/search fallback. */
UserSchema.index({ 'profile.neighborhood': 1 }, { sparse: true });

/** Enables efficient daily billing reset cron (Phase 14). */
UserSchema.index({ 'plan.periodResetAt': 1 });
