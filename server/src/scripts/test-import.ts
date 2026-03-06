/**
 * End-to-end test: download, parse, and map the target CKAN XLSX calendar.
 *
 * Usage: npx tsx src/scripts/test-import.ts
 *
 * Does NOT require a database — just tests the data pipeline.
 */

import * as ckan from '../services/ckan.js';
import { tryHeuristicMapping } from '../services/fieldMapper.js';
import { parseDateTime } from '../services/dateParser.js';

const RESOURCE_ID = '104ef345-5135-4f18-829b-26c42374391b';

async function main() {
  console.log('=== Ocal CKAN Import Test ===\n');

  // Step 1: Get resource metadata
  console.log('1. Fetching resource metadata...');
  const resource = await ckan.getResource(RESOURCE_ID);
  console.log(`   Name: ${resource.name}`);
  console.log(`   Format: ${resource.format}`);
  console.log(`   Datastore active: ${resource.datastore_active}`);
  console.log(`   Package ID: ${resource.package_id}`);
  console.log();

  // Step 2: Get package metadata
  console.log('2. Fetching package metadata...');
  const pkg = await ckan.getPackage(resource.package_id);
  console.log(`   Dataset title: ${pkg.title}`);
  console.log(`   Resources: ${pkg.resources.length}`);
  console.log();

  // Step 3: Download and parse the XLSX file
  console.log('3. Downloading and parsing XLSX file...');
  const { records, fields } = await ckan.downloadAndParseFile(resource.url, resource.format);
  console.log(`   Fields: ${JSON.stringify(fields)}`);
  console.log(`   Total records: ${records.length}`);
  console.log(`   Sample record: ${JSON.stringify(records[0])}`);
  console.log();

  // Step 4: Field mapping
  console.log('4. Running heuristic field mapping...');
  const mappingResult = tryHeuristicMapping(fields);
  console.log(`   Method: ${mappingResult.method}`);
  console.log(`   Confidence: ${mappingResult.confidence}`);
  console.log(`   Mapping: ${JSON.stringify(mappingResult.mapping, null, 2)}`);
  console.log(`   Unmapped fields: ${JSON.stringify(mappingResult.unmappedFields)}`);
  console.log();

  // Step 5: Transform sample records
  console.log('5. Transforming records...');
  const mapping = mappingResult.mapping;
  let successCount = 0;
  let failCount = 0;
  const sampleTransformed = [];

  for (const record of records) {
    const title = record[mapping.title];
    if (!title) { failCount++; continue; }

    const startTime = parseDateTime(
      record[mapping.start_date],
      mapping.start_time ? record[mapping.start_time] : undefined
    );

    if (!startTime) { failCount++; continue; }

    const endTime = mapping.end_date
      ? parseDateTime(
          record[mapping.end_date],
          mapping.end_time ? record[mapping.end_time] : undefined
        )
      : null;

    const location = mapping.location ? record[mapping.location] : null;
    const participants = mapping.participants ? record[mapping.participants] : null;

    const transformed = {
      title: String(title).trim(),
      start_time: startTime.toISOString(),
      end_time: endTime?.toISOString() || null,
      location: location ? String(location).trim() : null,
      participants: participants ? String(participants).trim() : null,
    };

    successCount++;
    if (sampleTransformed.length < 5) {
      sampleTransformed.push(transformed);
    }
  }

  console.log(`   Successfully transformed: ${successCount}/${records.length}`);
  console.log(`   Failed: ${failCount}`);
  console.log();
  console.log('   Sample transformed events:');
  for (const event of sampleTransformed) {
    console.log(`   - ${event.start_time} | ${event.title} | ${event.location || 'no location'}`);
  }

  // Step 6: Verify date range
  const dates = records
    .map(r => parseDateTime(r[mapping.start_date], mapping.start_time ? r[mapping.start_time] : undefined))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  console.log();
  console.log(`6. Date range: ${dates[0]?.toISOString().split('T')[0]} → ${dates[dates.length - 1]?.toISOString().split('T')[0]}`);

  console.log();
  console.log('=== Test Complete ===');
  console.log(`Result: ${successCount > 0 ? 'SUCCESS' : 'FAILURE'}`);
  console.log(`${successCount} events ready for import`);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
