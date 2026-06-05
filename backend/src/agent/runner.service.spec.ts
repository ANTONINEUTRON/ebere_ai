import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmAgent } from '@google/adk';
import { RunnerService } from './runner.service';
import { MongoSessionService } from './sessions/mongo-session.service';
import { MemoryService } from '../memory/memory.service';
import { SafetyGuardService } from '../safety/safety-guard.service';
import { SchedulesService } from '../schedules/schedules.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { IdentityService } from '../identity/identity.service';
import { SkillsService } from '../skills/skills.service';
import { createEbereAgent } from './ebere.agent';

// ── Mock @google/adk completely ────────────────────────────────────────────
jest.mock('@google/adk', () => {
  class BaseSessionService {
    getSession() {}
    createSession() {}
    listSessions() {}
    deleteSession() {}
    appendEvent() {}
  }

  return {
    BaseSessionService,
    createSession: jest.fn(),
    LlmAgent: jest
      .fn()
      .mockImplementation((args: Record<string, unknown>) => ({ ...args })),
    Runner: jest.fn().mockImplementation(() => ({
      runAsync: jest.fn().mockImplementation(async function* () {
        /* empty */
      }),
    })),
    isFinalResponse: jest.fn().mockReturnValue(false),
    GOOGLE_SEARCH: { name: 'google_search' },
    FunctionTool: jest
      .fn()
      .mockImplementation((def: Record<string, unknown>) => ({
        name: String(def.name),
      })),
  };
});

function makeConfigMock(geminiModel = 'gemini-3.5-flash'): ConfigService {
  return {
    get: jest.fn((key: string, def?: string) => {
      if (key === 'GEMINI_MODEL') return geminiModel;
      return def;
    }),
    getOrThrow: jest.fn(),
  } as unknown as ConfigService;
}

// ── createEbereAgent / system prompt building ──────────────────────────────
describe('createEbereAgent', () => {
  const llmMock = jest.mocked(LlmAgent);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes the custom agentName in the instruction', () => {
    createEbereAgent(makeConfigMock(), [], { agentName: 'Jade' });

    const instruction = llmMock.mock.calls[0][0].instruction as string;
    expect(instruction).toContain('You are Jade,');
  });

  it('defaults to "Ebere" when agentName is not provided', () => {
    createEbereAgent(makeConfigMock());

    const instruction = llmMock.mock.calls[0][0].instruction as string;
    expect(instruction).toContain('You are Ebere,');
  });

  it('includes the custom agentTone in the instruction', () => {
    createEbereAgent(makeConfigMock(), [], { agentTone: 'formal' });

    const instruction = llmMock.mock.calls[0][0].instruction as string;
    expect(instruction).toContain('Communicate in a formal tone.');
  });

  it('defaults to "warm" tone when agentTone is not provided', () => {
    createEbereAgent(makeConfigMock());

    const instruction = llmMock.mock.calls[0][0].instruction as string;
    expect(instruction).toContain('Communicate in a warm tone.');
  });

  it('includes a ## Your Skills section with skill entries when skillIndex is non-empty', () => {
    const skills = [
      { skillName: 'morning-brief', shortDescription: 'Daily news summary.' },
      { skillName: 'budget-report', shortDescription: 'Monthly budget.' },
    ];
    createEbereAgent(makeConfigMock(), [], { skillIndex: skills });

    const instruction = llmMock.mock.calls[0][0].instruction as string;
    expect(instruction).toContain('## Your Skills');
    expect(instruction).toContain('morning-brief');
    expect(instruction).toContain('Daily news summary.');
    expect(instruction).toContain('budget-report');
  });

  it('omits the ## Your Skills section when skillIndex is empty', () => {
    createEbereAgent(makeConfigMock(), [], { skillIndex: [] });

    const instruction = llmMock.mock.calls[0][0].instruction as string;
    expect(instruction).not.toContain('## Your Skills');
  });

  it('produces different instructions for different skillIndex values', () => {
    createEbereAgent(makeConfigMock(), [], {
      skillIndex: [
        { skillName: 'recipe-finder', shortDescription: 'Find recipes.' },
      ],
    });
    const first = llmMock.mock.calls[0][0].instruction as string;

    createEbereAgent(makeConfigMock(), [], {
      skillIndex: [
        { skillName: 'stock-tracker', shortDescription: 'Track stocks.' },
      ],
    });
    const second = llmMock.mock.calls[1][0].instruction as string;

    expect(first).not.toBe(second);
    expect(first).toContain('recipe-finder');
    expect(second).toContain('stock-tracker');
  });

  it('passes GOOGLE_SEARCH as the first tool', () => {
    createEbereAgent(makeConfigMock());

    const callArgs = llmMock.mock.calls[0][0];
    const tools = callArgs.tools as Array<{ name: string }>;
    expect(tools[0]).toEqual({ name: 'google_search' });
  });
});

// ── RunnerService wiring ───────────────────────────────────────────────────
describe('RunnerService', () => {
  let service: RunnerService;
  const llmMock = jest.mocked(LlmAgent);

  let mockSkillsService: { getSkillIndex: jest.Mock };
  let mockUsersService: { getAgentConfig: jest.Mock };
  let mockSessionService: { getSession: jest.Mock; createSession: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSkillsService = {
      getSkillIndex: jest.fn().mockResolvedValue([]),
    };
    mockUsersService = {
      getAgentConfig: jest
        .fn()
        .mockResolvedValue({ agentName: 'Ebere', agentTone: 'warm' }),
    };
    mockSessionService = {
      getSession: jest.fn().mockResolvedValue(null),
      createSession: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunnerService,
        { provide: MongoSessionService, useValue: mockSessionService },
        { provide: ConfigService, useValue: makeConfigMock() },
        { provide: MemoryService, useValue: {} },
        { provide: SafetyGuardService, useValue: {} },
        { provide: SchedulesService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: UsersService, useValue: mockUsersService },
        { provide: IdentityService, useValue: {} },
        { provide: SkillsService, useValue: mockSkillsService },
      ],
    }).compile();

    service = module.get<RunnerService>(RunnerService);
  });

  it('resolves without throwing for a basic text payload', async () => {
    await expect(
      service.run('user1', 'telegram', { text: 'Hello' }),
    ).resolves.not.toThrow();
  });

  it('fetches skillIndex and agentConfig before building the agent', async () => {
    await service.run('user1', 'telegram', { text: 'Test' });

    expect(mockSkillsService.getSkillIndex).toHaveBeenCalledWith('user1');
    expect(mockUsersService.getAgentConfig).toHaveBeenCalledWith('user1');
  });

  it('uses the agentName returned by getAgentConfig in the LlmAgent instruction', async () => {
    mockUsersService.getAgentConfig.mockResolvedValue({
      agentName: 'Aria',
      agentTone: 'professional',
    });

    await service.run('user1', 'telegram', { text: 'Test' });

    const instruction = llmMock.mock.calls[0][0].instruction as string;
    expect(instruction).toContain('You are Aria,');
  });

  it('includes skill names in the instruction when the user has skills', async () => {
    mockSkillsService.getSkillIndex.mockResolvedValue([
      { skillName: 'morning-brief', shortDescription: 'Daily news.' },
    ]);

    await service.run('user1', 'telegram', { text: 'Test' });

    const instruction = llmMock.mock.calls[0][0].instruction as string;
    expect(instruction).toContain('morning-brief');
    expect(instruction).toContain('## Your Skills');
  });

  it('creates a new session when none exists for the user', async () => {
    mockSessionService.getSession.mockResolvedValue(null);

    await service.run('user1', 'telegram', { text: 'Hello' });

    expect(mockSessionService.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user1', appName: 'ebere' }),
    );
  });

  it('does not create a session when one already exists', async () => {
    mockSessionService.getSession.mockResolvedValue({ id: 'existing-session' });

    await service.run('user1', 'telegram', { text: 'Hello' });

    expect(mockSessionService.createSession).not.toHaveBeenCalled();
  });

  it('falls back to the default response when no final response event is emitted', async () => {
    const result = await service.run('user1', 'telegram', { text: 'Hello' });
    expect(result).toBe('Sorry, I could not process your request right now.');
  });
});
