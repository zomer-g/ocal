// Phase C — COI import routes. Real handlers added below.
// Imports COI arrangements from ODATA discovery and GOV.IL ZIP bundles.

import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { validate } from '../../middleware/validate.js';
import {
  discoverCoiResources,
  importCoiFromOdata,
  importCoiFromZip,
} from '../../services/coiImporter.js';

export const adminCoiImportsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB — GOV.IL ZIPs can be large
});

// ── GET /discover — list ODATA packages matching "ניגוד עניינים" ───
adminCoiImportsRouter.get('/discover', async (_req, res, next) => {
  try {
    const data = await discoverCoiResources();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── POST /odata — import a single PDF resource from ODATA ──────────
const odataImportSchema = z.object({
  resource_id: z.string().min(1),
  package_id: z.string().min(1),
});

adminCoiImportsRouter.post('/odata', validate(odataImportSchema, 'body'), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof odataImportSchema>;
    const result = await importCoiFromOdata({
      resourceId: body.resource_id,
      packageId: body.package_id,
      uploadedBy: req.adminUser?.id ?? null,
    });
    res.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already imported')) {
      res.status(409).json({ error: msg });
      return;
    }
    logger.error({ err }, 'COI ODATA import failed');
    next(err);
  }
});

// ── POST /zip — bulk import a GOV.IL ZIP of PDFs ───────────────────
adminCoiImportsRouter.post('/zip', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'יש לצרף קובץ ZIP (שדה "file")' });
      return;
    }
    if (!/\.zip$/i.test(file.originalname) && file.mimetype !== 'application/zip') {
      res.status(400).json({ error: 'הקובץ חייב להיות בפורמט ZIP' });
      return;
    }
    const result = await importCoiFromZip({
      zipBuffer: file.buffer,
      uploadedBy: req.adminUser?.id ?? null,
    });
    res.status(201).json(result);
  } catch (err) {
    logger.error({ err }, 'COI ZIP import failed');
    next(err);
  }
});
