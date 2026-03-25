/**
 * ============================================================
 * Auto-Import Service
 * ============================================================
 *
 * Automatically scans ODATA for new diary resources, evaluates them
 * for import readiness, and either auto-imports or queues for review.
 */

import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { jaccard } from './entityExtractor.js';
import * as ckan from './ckan.js';
import { profileSource, registerSource, processSource } from './pipeline.js';
import type { MappingResult } from './fieldMapper.js';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface OwnerMatch {
  personId: string | null;
  personName: string | null;
  personConfidence: number;
  orgId: string | null;
  orgName: string | null;
  orgConfidence: number;
  signals: Record<string, number>;
}

export interface EvaluationResult {
  resourceId: string;
  datasetId: string;
  datasetTitle: string;
  resourceName: string;
  resourceFormat: string;
  organization: string | null;
  odataDatasetUrl: string;
  odataResourceUrl: string;

  // Profiling
  fields: string[];
  sampleRecords: Record<string, unknown>[];
  totalRecords: number;

  // Mapping
  suggestedMapping: MappingResult;
  mappingIssues: string[];

  // Owner
  owner: OwnerMatch;

  // Decision
  canAutoImport: boolean;
  reasons: string[];
  suggestedName: string;
  suggestedColor: string;
}

export interface ScanResult {
  resourcesDiscovered: number;
  resourcesNew: number;
  resourcesAutoImported: number;
  resourcesQueued: number;
  resourcesSkipped: number;
  errors: string[];
  durationMs: number;
}

// ──────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────

export async function getSettings(): Promise<Record<string, unknown>> {
  const rows = await db('automation_settings').select('key', 'value');
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
  }
  return settings;
}

export async function updateSettings(updates: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    await db('automation_settings')
      .insert({ key, value: JSON.stringify(value), updated_at: new Date() })
      .onConflict('key')
      .merge();
  }
}

// ──────────────────────────────────────────────
// Owner Identification
// ──────────────────────────────────────────────

const SOURCE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

function pickColor(index: number): string {
  return SOURCE_COLORS[index % SOURCE_COLORS.length];
}

export async function identifyOwner(
  datasetTitle: string,
  resourceName: string,
  odataOrg: string | null,
): Promise<OwnerMatch> {
  const people = await db('people')
    .select('people.id', 'people.name', 'organizations.name as org_name')
    .leftJoin('organizations', 'people.organization_id', 'organizations.id');
  const orgs = await db('organizations').select('id', 'name');

  const signals: Record<string, number> = {};
  let bestPersonId: string | null = null;
  let bestPersonName: string | null = null;
  let bestPersonScore = 0;

  const combined = `${datasetTitle} ${resourceName}`.toLowerCase();

  for (const person of people) {
    const nameWords = person.name.toLowerCase();
    const titleScore = jaccard(nameWords, datasetTitle.toLowerCase());
    const resourceScore = jaccard(nameWords, resourceName.toLowerCase());
    // Also check if person name appears as substring in combined text
    const containsBonus = combined.includes(nameWords) ? 0.3 : 0;
    const score = Math.max(titleScore, resourceScore) + containsBonus;

    if (score > bestPersonScore) {
      bestPersonScore = score;
      bestPersonId = person.id;
      bestPersonName = person.name;
      signals[`person:${person.name}:title`] = titleScore;
      signals[`person:${person.name}:resource`] = resourceScore;
      signals[`person:${person.name}:contains`] = containsBonus;
    }
  }

  // Organization matching
  let bestOrgId: string | null = null;
  let bestOrgName: string | null = null;
  let bestOrgScore = 0;

  if (odataOrg) {
    for (const org of orgs) {
      const score = jaccard(org.name.toLowerCase(), odataOrg.toLowerCase());
      if (score > bestOrgScore) {
        bestOrgScore = score;
        bestOrgId = org.id;
        bestOrgName = org.name;
      }
    }
    signals['org:odataMatch'] = bestOrgScore;
  }

  // Boost person confidence if their org matches the ODATA org
  if (bestPersonId && bestOrgId) {
    const person = people.find((p) => p.id === bestPersonId);
    if (person?.org_name && odataOrg) {
      const orgMatch = jaccard(person.org_name.toLowerCase(), odataOrg.toLowerCase());
      if (orgMatch > 0.5) {
        bestPersonScore = Math.min(1, bestPersonScore + 0.05);
        signals['person:orgBoost'] = 0.05;
      }
    }
  }

  return {
    personId: bestPersonScore >= 0.5 ? bestPersonId : null,
    personName: bestPersonScore >= 0.5 ? bestPersonName : null,
    personConfidence: bestPersonScore,
    orgId: bestOrgScore >= 0.5 ? bestOrgId : null,
    orgName: bestOrgScore >= 0.5 ? bestOrgName : null,
    orgConfidence: bestOrgScore,
    signals,
  };
}

// ──────────────────────────────────────────────
// Resource Evaluation
// ──────────────────────────────────────────────

export async function evaluateResource(
  resourceId: string,
  settings: Record<string, unknown>,
): Promise<EvaluationResult> {
  const mappingThreshold = (settings.auto_import_confidence_threshold as number) ?? 0.9;
  const ownerThreshold = (settings.owner_confidence_threshold as number) ?? 0.9;

  // Profile the resource
  const profile = await profileSource(resourceId);
  const { resource, pkg, suggestedMapping, sampleRecords, fields, totalRecords, suggestedName } = profile;

  const odataBase = 'https://www.odata.org.il';
  const odataDatasetUrl = `${odataBase}/dataset/${pkg.id}`;
  const odataResourceUrl = `${odataBase}/dataset/${pkg.id}/resource/${resource.id}`;

  // Identify owner
  const owner = await identifyOwner(
    pkg.title,
    resource.name,
    pkg.organization?.title ?? null,
  );

  // Build issues list
  const mappingIssues: string[] = [];
  const reasons: string[] = [];

  // Check mapping quality
  if (!suggestedMapping.mapping.title) {
    mappingIssues.push('שדה כותרת לא זוהה');
  }
  if (!suggestedMapping.mapping.start_date) {
    mappingIssues.push('שדה תאריך התחלה לא זוהה');
  }
  if (suggestedMapping.confidence < mappingThreshold) {
    mappingIssues.push(`רמת ביטחון מיפוי נמוכה: ${(suggestedMapping.confidence * 100).toFixed(0)}% (נדרש ${(mappingThreshold * 100).toFixed(0)}%)`);
  }
  if (totalRecords < 10) {
    mappingIssues.push(`מספר רשומות נמוך: ${totalRecords}`);
  }

  // Check owner identification
  if (owner.personConfidence < ownerThreshold) {
    reasons.push(`זיהוי בעלים לא מספיק: ${(owner.personConfidence * 100).toFixed(0)}% (נדרש ${(ownerThreshold * 100).toFixed(0)}%)`);
  }
  if (!owner.personId) {
    reasons.push('לא נמצא בעלים מתאים ברשימת האנשים');
  }

  const canAutoImport =
    !!suggestedMapping.mapping.title &&
    !!suggestedMapping.mapping.start_date &&
    suggestedMapping.confidence >= mappingThreshold &&
    totalRecords >= 10 &&
    owner.personConfidence >= ownerThreshold &&
    !!owner.personId;

  if (!canAutoImport && mappingIssues.length === 0 && reasons.length === 0) {
    reasons.push('תנאים לייבוא אוטומטי לא התקיימו');
  }

  // Pick a color based on existing source count
  const sourceCount = await db('diary_sources').count('id as cnt').first();
  const colorIndex = Number(sourceCount?.cnt ?? 0);

  return {
    resourceId: resource.id,
    datasetId: pkg.id,
    datasetTitle: pkg.title,
    resourceName: resource.name,
    resourceFormat: resource.format,
    organization: pkg.organization?.title ?? null,
    odataDatasetUrl,
    odataResourceUrl,
    fields,
    sampleRecords: sampleRecords.slice(0, 3),
    totalRecords,
    suggestedMapping,
    mappingIssues,
    owner,
    canAutoImport,
    reasons: [...mappingIssues, ...reasons],
    suggestedName,
    suggestedColor: pickColor(colorIndex),
  };
}

// ──────────────────────────────────────────────
// Scanner
// ──────────────────────────────────────────────

export async function runScan(): Promise<ScanResult> {
  const startTime = Date.now();
  const result: ScanResult = {
    resourcesDiscovered: 0,
    resourcesNew: 0,
    resourcesAutoImported: 0,
    resourcesQueued: 0,
    resourcesSkipped: 0,
    errors: [],
    durationMs: 0,
  };

  // Create scan log
  const [scanLog] = await db('auto_import_logs')
    .insert({ scan_started_at: new Date() })
    .returning('*');

  try {
    const settings = await getSettings();

    // Discover all diary resources
    const discovery = await ckan.discoverDiaryResources();
    const allResources: Array<{
      resourceId: string;
      datasetId: string;
      datasetTitle: string;
      resourceName: string;
      format: string;
      organization: string | null;
    }> = [];

    for (const ds of discovery.datasets) {
      for (const r of ds.resources) {
        allResources.push({
          resourceId: r.id,
          datasetId: ds.id,
          datasetTitle: ds.title,
          resourceName: r.name,
          format: r.format,
          organization: ds.organization,
        });
      }
    }

    result.resourcesDiscovered = allResources.length;

    // Filter out already known resources
    const [existingSources, existingExceptions, existingQueue] = await Promise.all([
      db('diary_sources').select('resource_id'),
      db('diary_exceptions').select('resource_id'),
      db('auto_import_queue').select('resource_id'),
    ]);

    const knownIds = new Set([
      ...existingSources.map((r) => r.resource_id),
      ...existingExceptions.map((r) => r.resource_id),
      ...existingQueue.map((r) => r.resource_id),
    ]);

    const newResources = allResources.filter((r) => !knownIds.has(r.resourceId));
    result.resourcesNew = newResources.length;

    // Process each new resource sequentially with delay
    for (const resource of newResources) {
      try {
        const evaluation = await evaluateResource(resource.resourceId, settings);

        if (evaluation.canAutoImport) {
          // Auto-import
          try {
            const sourceId = await registerSource({
              resourceId: evaluation.resourceId,
              datasetId: evaluation.datasetId,
              name: evaluation.suggestedName,
              color: evaluation.suggestedColor,
              fieldMapping: evaluation.suggestedMapping.mapping,
              mappingMethod: evaluation.suggestedMapping.method as 'heuristic' | 'llm' | 'manual',
              mappingConfidence: evaluation.suggestedMapping.confidence,
              format: evaluation.resourceFormat.toUpperCase(),
              fetchMethod: 'file_download',
              personId: evaluation.owner.personId ?? undefined,
              organizationId: evaluation.owner.orgId ?? undefined,
              ckanMetadata: {
                datasetTitle: evaluation.datasetTitle,
                resourceName: evaluation.resourceName,
                resourceUrl: evaluation.odataResourceUrl,
                datasetUrl: evaluation.odataDatasetUrl,
                organization: evaluation.organization,
                lastModified: new Date().toISOString(),
              },
            });

            // Start processing in background
            processSource(sourceId).catch((err) => {
              logger.error({ sourceId, err }, 'Auto-import processing failed');
            });

            // Insert queue row as auto_imported
            await db('auto_import_queue').insert({
              resource_id: evaluation.resourceId,
              dataset_id: evaluation.datasetId,
              dataset_title: evaluation.datasetTitle,
              resource_name: evaluation.resourceName,
              resource_format: evaluation.resourceFormat,
              organization: evaluation.organization,
              odata_dataset_url: evaluation.odataDatasetUrl,
              odata_resource_url: evaluation.odataResourceUrl,
              fields: JSON.stringify(evaluation.fields),
              sample_records: JSON.stringify(evaluation.sampleRecords),
              total_records: evaluation.totalRecords,
              suggested_mapping: JSON.stringify(evaluation.suggestedMapping.mapping),
              mapping_method: evaluation.suggestedMapping.method,
              mapping_confidence: evaluation.suggestedMapping.confidence,
              mapping_issues: evaluation.mappingIssues,
              suggested_person_id: evaluation.owner.personId,
              suggested_person_name: evaluation.owner.personName,
              person_confidence: evaluation.owner.personConfidence,
              suggested_org_id: evaluation.owner.orgId,
              suggested_org_name: evaluation.owner.orgName,
              org_confidence: evaluation.owner.orgConfidence,
              owner_signals: JSON.stringify(evaluation.owner.signals),
              status: 'auto_imported',
              suggested_name: evaluation.suggestedName,
              suggested_color: evaluation.suggestedColor,
              imported_source_id: sourceId,
            });

            result.resourcesAutoImported++;
            logger.info({ resourceId: evaluation.resourceId, sourceId }, 'Resource auto-imported');
          } catch (importErr) {
            const msg = importErr instanceof Error ? importErr.message : String(importErr);
            // Insert as error
            await db('auto_import_queue').insert({
              resource_id: evaluation.resourceId,
              dataset_id: evaluation.datasetId,
              dataset_title: evaluation.datasetTitle,
              resource_name: evaluation.resourceName,
              resource_format: evaluation.resourceFormat,
              organization: evaluation.organization,
              odata_dataset_url: evaluation.odataDatasetUrl,
              odata_resource_url: evaluation.odataResourceUrl,
              fields: JSON.stringify(evaluation.fields),
              sample_records: JSON.stringify(evaluation.sampleRecords),
              total_records: evaluation.totalRecords,
              suggested_mapping: JSON.stringify(evaluation.suggestedMapping.mapping),
              mapping_method: evaluation.suggestedMapping.method,
              mapping_confidence: evaluation.suggestedMapping.confidence,
              mapping_issues: evaluation.mappingIssues,
              suggested_person_id: evaluation.owner.personId,
              suggested_person_name: evaluation.owner.personName,
              person_confidence: evaluation.owner.personConfidence,
              suggested_org_id: evaluation.owner.orgId,
              suggested_org_name: evaluation.owner.orgName,
              org_confidence: evaluation.owner.orgConfidence,
              owner_signals: JSON.stringify(evaluation.owner.signals),
              status: 'error',
              failure_reason: msg,
              suggested_name: evaluation.suggestedName,
              suggested_color: evaluation.suggestedColor,
            });
            result.errors.push(`Import failed for ${evaluation.resourceId}: ${msg}`);
          }
        } else {
          // Queue for review
          await db('auto_import_queue').insert({
            resource_id: evaluation.resourceId,
            dataset_id: evaluation.datasetId,
            dataset_title: evaluation.datasetTitle,
            resource_name: evaluation.resourceName,
            resource_format: evaluation.resourceFormat,
            organization: evaluation.organization,
            odata_dataset_url: evaluation.odataDatasetUrl,
            odata_resource_url: evaluation.odataResourceUrl,
            fields: JSON.stringify(evaluation.fields),
            sample_records: JSON.stringify(evaluation.sampleRecords),
            total_records: evaluation.totalRecords,
            suggested_mapping: JSON.stringify(evaluation.suggestedMapping.mapping),
            mapping_method: evaluation.suggestedMapping.method,
            mapping_confidence: evaluation.suggestedMapping.confidence,
            mapping_issues: evaluation.mappingIssues,
            suggested_person_id: evaluation.owner.personId,
            suggested_person_name: evaluation.owner.personName,
            person_confidence: evaluation.owner.personConfidence,
            suggested_org_id: evaluation.owner.orgId,
            suggested_org_name: evaluation.owner.orgName,
            org_confidence: evaluation.owner.orgConfidence,
            owner_signals: JSON.stringify(evaluation.owner.signals),
            status: 'pending',
            suggested_name: evaluation.suggestedName,
            suggested_color: evaluation.suggestedColor,
          });
          result.resourcesQueued++;
          logger.info({ resourceId: evaluation.resourceId, reasons: evaluation.reasons }, 'Resource queued for review');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Evaluation failed for ${resource.resourceId}: ${msg}`);
        result.resourcesSkipped++;
        logger.warn({ resourceId: resource.resourceId, err: msg }, 'Resource evaluation failed');

        // Track failed evaluations so they don't reappear as "new" on every scan
        try {
          await db('auto_import_queue')
            .insert({
              resource_id: resource.resourceId,
              dataset_id: resource.datasetId,
              dataset_title: resource.datasetTitle,
              resource_name: resource.resourceName,
              resource_format: resource.format,
              organization: resource.organization,
              status: 'error',
              failure_reason: msg,
            })
            .onConflict('resource_id')
            .ignore();
        } catch {
          // non-critical — just means it'll retry next scan
        }
      }

      // Delay between resources to avoid overwhelming ODATA
      if (newResources.indexOf(resource) < newResources.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Scan error: ${msg}`);
    logger.error({ err: msg }, 'Auto-import scan failed');
  } finally {
    result.durationMs = Date.now() - startTime;

    // Always attempt to update the scan log, even if DB is under pressure
    try {
      await db('auto_import_logs').where({ id: scanLog.id }).update({
        scan_completed_at: new Date(),
        resources_discovered: result.resourcesDiscovered,
        resources_new: result.resourcesNew,
        resources_auto_imported: result.resourcesAutoImported,
        resources_queued: result.resourcesQueued,
        resources_skipped: result.resourcesSkipped,
        errors: result.errors.length > 0 ? result.errors : null,
        duration_ms: result.durationMs,
      });
    } catch (dbErr) {
      logger.error({ dbErr, scanLogId: scanLog.id },
        'Failed to update scan log — result will not be persisted');
    }

    logger.info({
      discovered: result.resourcesDiscovered,
      new: result.resourcesNew,
      autoImported: result.resourcesAutoImported,
      queued: result.resourcesQueued,
      skipped: result.resourcesSkipped,
      errors: result.errors.length,
      durationMs: result.durationMs,
    }, 'Auto-import scan completed');
  }

  return result;
}
