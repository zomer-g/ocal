import { z } from 'zod';
import { DiarySourceModel } from '../../models/DiarySource.js';
import { runTool, type ToolContext } from '../toolContext.js';
import { PROVENANCE, buildSourceLinks } from '../sources.js';

export const listSourcesSchema = {};
type Args = Record<string, never>;

interface SourceRow {
  id: string;
  dataset_url: string | null;
  resource_url: string | null;
  [k: string]: unknown;
}

export function buildListSourcesTool(ctx: ToolContext) {
  return async (args: Args) =>
    runTool(ctx, 'list_sources', args, async () => {
      const sources = (await DiarySourceModel.findAll(true)) as SourceRow[];
      const enriched = sources.map((s) => ({
        ...s,
        links: buildSourceLinks(s),
      }));
      return {
        data: {
          _provenance: PROVENANCE,
          sources: enriched,
        },
        count: enriched.length,
      };
    });
}

export const listSourcesToolConfig = {
  title: 'List diary sources',
  description:
    'List all enabled diary sources (Israeli government officials and bodies whose calendars Ocal ingests). Each source includes a "links" object with URLs to the source page on Ocal and the upstream CKAN dataset/resource — always cite these.',
  inputSchema: listSourcesSchema,
};
