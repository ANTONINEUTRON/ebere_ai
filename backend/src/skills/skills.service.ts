import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Skill, SkillDocument } from './skill.schema';
import { STORAGE_PROVIDER } from '../media/storage-provider.interface';
import type { StorageProvider } from '../media/storage-provider.interface';
import { validateSkillContent } from './skill-content.validator';
import { validatePublicUrl } from './ssrf.validator';

export interface SkillIndexEntry {
  skillName: string;
  shortDescription: string;
}

@Injectable()
export class SkillsService {
  constructor(
    @InjectModel(Skill.name) private readonly skillModel: Model<SkillDocument>,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly config: ConfigService,
  ) {}

  /** Sanitise, validate, store and upsert a skill. */
  async saveSkill(
    userId: string,
    rawName: string,
    content: string,
  ): Promise<SkillDocument> {
    const skillName = this.sanitiseName(rawName);
    validateSkillContent(content);

    const storageKey = `skills/${userId}/${skillName}.md`;
    await this.storageProvider.storeText(storageKey, content);

    const shortDescription = await this.generateDescription(content);

    const doc = await this.skillModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId), skillName },
        {
          $set: { shortDescription, storageKey, charCount: content.length },
          $setOnInsert: { userId: new Types.ObjectId(userId), skillName },
        },
        { upsert: true, new: true },
      )
      .exec();

    return doc;
  }

  /** Fetch content from a public HTTPS URL and save it as a skill. */
  async importFromUrl(
    userId: string,
    skillName: string,
    url: string,
  ): Promise<SkillDocument> {
    validatePublicUrl(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    let content: string;
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new BadRequestException(
          `Failed to fetch URL: HTTP ${res.status}`,
        );
      }
      const text = await res.text();
      if (text.length > 10_000) {
        throw new BadRequestException(
          'Remote skill file exceeds the 10,000 character limit.',
        );
      }
      content = text;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        `Failed to fetch skill from URL: ${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }

    return this.saveSkill(userId, skillName, content);
  }

  /** Return a lightweight index (name + description) for a user's skills. */
  async getSkillIndex(userId: string): Promise<SkillIndexEntry[]> {
    const docs = await this.skillModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .select({ skillName: 1, shortDescription: 1 })
      .lean()
      .exec();

    return docs.map((d) => ({
      skillName: d.skillName,
      shortDescription: d.shortDescription,
    }));
  }

  /** Load the full skill content wrapped in USER_SKILL delimiters. */
  async fetchSkillContent(userId: string, skillName: string): Promise<string> {
    const safe = this.sanitiseName(skillName);
    const doc = await this.skillModel
      .findOne({ userId: new Types.ObjectId(userId), skillName: safe })
      .lean()
      .exec();

    if (!doc) throw new NotFoundException(`Skill "${skillName}" not found.`);

    const raw = await this.storageProvider.fetchText(doc.storageKey);
    return `[USER_SKILL: ${doc.skillName}]\n${raw}\n[/USER_SKILL]`;
  }

  /** Delete a skill's metadata and storage object. */
  async deleteSkill(userId: string, skillName: string): Promise<void> {
    const safe = this.sanitiseName(skillName);
    const doc = await this.skillModel
      .findOneAndDelete({ userId: new Types.ObjectId(userId), skillName: safe })
      .lean()
      .exec();

    if (!doc) throw new NotFoundException(`Skill "${skillName}" not found.`);
    await this.storageProvider.deleteObject(doc.storageKey);
  }

  // ---------------------------------------------------------------------------

  private sanitiseName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  /**
   * Ask Gemini for a 2-sentence description of the skill content.
   * Falls back to the first 250 chars of content if the call fails.
   */
  private async generateDescription(content: string): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    const model = this.config.get<string>('GEMINI_MODEL', 'gemini-3.5-flash');

    if (!apiKey) {
      return content.slice(0, 250).trimEnd();
    }

    try {
      const prompt =
        `Summarise this skill description in 2 sentences (max 300 chars total). ` +
        `Return only the summary, no preamble:\n\n${content}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!res.ok) throw new Error(`Gemini ${res.status}`);

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return text.slice(0, 300).trim() || content.slice(0, 250).trimEnd();
    } catch {
      return content.slice(0, 250).trimEnd();
    }
  }
}
