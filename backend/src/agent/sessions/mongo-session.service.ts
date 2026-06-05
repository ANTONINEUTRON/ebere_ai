import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseSessionService, createSession } from '@google/adk';
import type {
  Session,
  Event,
  CreateSessionRequest,
  GetSessionRequest,
  ListSessionsRequest,
  DeleteSessionRequest,
  AppendEventRequest,
  ListSessionsResponse,
} from '@google/adk';
import { randomUUID } from 'crypto';
import { AiSession, AiSessionDocument } from './session.schema';

@Injectable()
export class MongoSessionService extends BaseSessionService {
  constructor(
    @InjectModel(AiSession.name)
    private readonly sessionModel: Model<AiSessionDocument>,
  ) {
    super();
  }

  override async createSession(params: CreateSessionRequest): Promise<Session> {
    const id = params.sessionId ?? randomUUID();
    const initState = params.state ?? {};
    await this.sessionModel.create({
      adkSessionId: id,
      appName: params.appName,
      userId: params.userId,
      state: initState,
      events: [],
      lastUpdateTime: Date.now(),
    });
    return createSession({
      id,
      appName: params.appName,
      userId: params.userId,
      state: initState,
      events: [],
      lastUpdateTime: Date.now(),
    });
  }

  override async getSession(
    params: GetSessionRequest,
  ): Promise<Session | undefined> {
    const doc = await this.sessionModel
      .findOne({
        adkSessionId: params.sessionId,
        appName: params.appName,
        userId: params.userId,
      })
      .lean();
    if (!doc) return undefined;
    return createSession({
      id: doc.adkSessionId,
      appName: doc.appName,
      userId: doc.userId,
      state: doc.state,
      events: doc.events as Event[],
      lastUpdateTime: doc.lastUpdateTime,
    });
  }

  override listSessions(
    params: ListSessionsRequest,
  ): Promise<ListSessionsResponse> {
    return this.sessionModel
      .find({ appName: params.appName, userId: params.userId }, { events: 0 })
      .lean()
      .then((docs) => ({
        sessions: docs.map((doc) =>
          createSession({
            id: doc.adkSessionId,
            appName: doc.appName,
            userId: doc.userId,
            state: doc.state,
            events: [],
            lastUpdateTime: doc.lastUpdateTime,
          }),
        ),
      }));
  }

  override async deleteSession(params: DeleteSessionRequest): Promise<void> {
    await this.sessionModel.deleteOne({
      adkSessionId: params.sessionId,
      appName: params.appName,
      userId: params.userId,
    });
  }

  override async appendEvent(params: AppendEventRequest): Promise<Event> {
    const processed = await super.appendEvent(params);
    await this.sessionModel.updateOne(
      { adkSessionId: params.session.id },
      {
        $set: {
          events: params.session.events,
          state: params.session.state,
          lastUpdateTime: Date.now(),
        },
      },
    );
    return processed;
  }
}
