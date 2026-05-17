import { z } from 'zod';
import { DiarySourceModel } from '../../models/DiarySource.js';
import { runTool, type ToolContext } from '../toolContext.js';

export const listSourcesSchema = {};
type Args = Record<string, never>;

export function buildListSourcesTool(ctx: ToolContext) {
  return async (args: Args) =>
    runTool(ctx, 'list_sources', args, async () => {
      const sources = await DiarySourceModel.findAll(true);
      return { data: { sources }, count: sources.length };
    });
}

export const listSourcesToolConfig = {
  title: 'List diary sources',
  description:
    'List all enabled diary sources (the government officials and bodies whose calendars Ocal ingests). Returns id, name, category, and metadata for each.',
  inputSchema: listSourcesSchema,
};
