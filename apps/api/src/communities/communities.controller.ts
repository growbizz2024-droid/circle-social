import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { CommunitySummary, Page } from '@circle/shared-types';
import { paginationSchema } from '@circle/validation';
import { DatabaseService } from '../database/database.service.js';
import { validate } from '../core/http.js';
@Controller('communities')
export class CommunitiesController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  @Get() async list(@Query() query: unknown): Promise<Page<CommunitySummary>> {
    const { limit, cursor } = validate(paginationSchema, query);
    const rows = await this.db.community.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, slug: true, name: true, description: true },
    });
    const more = rows.length > limit;
    const items = rows.slice(0, limit);
    return { items, nextCursor: more ? (items.at(-1)?.id ?? null) : null };
  }
}
