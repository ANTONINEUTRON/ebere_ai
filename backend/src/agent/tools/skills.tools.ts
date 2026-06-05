import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import type { SkillsService } from '../../skills/skills.service';

/**
 * Five tools that let the agent manage a user's personal skills via chat.
 * `userId` is bound in the closure — it is never part of any Zod schema.
 */
export function createSkillTools(
  skillsService: SkillsService,
  userId: string,
): FunctionTool[] {
  return [
    new FunctionTool({
      name: 'listSkills',
      description:
        'List all skills saved for this user, with their names and short descriptions.',
      parameters: z.object({}),
      execute: async () => {
        const skills = await skillsService.getSkillIndex(userId);
        if (!skills.length) {
          return {
            message: 'You have no saved skills yet. Use saveSkill to add one.',
          };
        }
        return {
          count: skills.length,
          skills: skills.map((s) => ({
            name: s.skillName,
            description: s.shortDescription,
          })),
        };
      },
    }),

    new FunctionTool({
      name: 'fetchSkill',
      description:
        'Load the full content of a saved skill. Call this when the user request matches a skill description — load the skill first, then apply its instructions.',
      parameters: z.object({
        skillName: z
          .string()
          .describe('The exact skill name as returned by listSkills'),
      }),
      execute: async (args: Record<string, unknown>) => {
        const { skillName } = args as { skillName: string };
        try {
          const content = await skillsService.fetchSkillContent(
            userId,
            skillName,
          );
          return { content };
        } catch {
          return { error: `Skill "${skillName}" not found.` };
        }
      },
    }),

    new FunctionTool({
      name: 'saveSkill',
      description:
        'Save a new skill or update an existing one. Skills are natural-language instructions that extend your capabilities for this user.',
      parameters: z.object({
        skillName: z
          .string()
          .describe(
            'Short name for the skill (e.g. "morning-brief", "budget-report")',
          ),
        content: z
          .string()
          .describe('The full skill instructions in plain English'),
      }),
      execute: async (args: Record<string, unknown>) => {
        const { skillName, content } = args as {
          skillName: string;
          content: string;
        };
        try {
          const doc = await skillsService.saveSkill(userId, skillName, content);
          return {
            saved: true,
            skillName: doc.skillName,
            shortDescription: doc.shortDescription,
            charCount: doc.charCount,
            message: `Skill "${doc.skillName}" saved. Description: ${doc.shortDescription}`,
          };
        } catch (err: unknown) {
          return { error: (err as Error).message };
        }
      },
    }),

    new FunctionTool({
      name: 'importSkillFromUrl',
      description:
        'Import a skill from a public HTTPS URL. The URL must point to a plain text file containing the skill instructions.',
      parameters: z.object({
        skillName: z.string().describe('Name to give the imported skill'),
        url: z.string().describe('Public HTTPS URL of the skill text file'),
      }),
      execute: async (args: Record<string, unknown>) => {
        const { skillName, url } = args as { skillName: string; url: string };
        try {
          const doc = await skillsService.importFromUrl(userId, skillName, url);
          return {
            imported: true,
            skillName: doc.skillName,
            shortDescription: doc.shortDescription,
            message: `Skill "${doc.skillName}" imported. Description: ${doc.shortDescription}`,
          };
        } catch (err: unknown) {
          return { error: (err as Error).message };
        }
      },
    }),

    new FunctionTool({
      name: 'deleteSkill',
      description: 'Permanently delete a saved skill by name.',
      parameters: z.object({
        skillName: z.string().describe('The name of the skill to delete'),
      }),
      execute: async (args: Record<string, unknown>) => {
        const { skillName } = args as { skillName: string };
        try {
          await skillsService.deleteSkill(userId, skillName);
          return {
            deleted: true,
            message: `Skill "${skillName}" has been deleted.`,
          };
        } catch (err: unknown) {
          return { error: (err as Error).message };
        }
      },
    }),
  ];
}
