#!/usr/bin/env node
/**
 * Memex 2.0 x Octothorpes — Markdown pipeline demo runner (OP epic #240, #246).
 *
 * Drives the OP-core Markdown pipeline end to end against the local relay:
 *
 *   .md source (frontmatter declares its OWN `uri`)
 *     -> buildTargetMap (ONE pass over the vault, done once, by the caller):
 *        name -> declared uri, including path-qualified keys so basename
 *        collisions can be disambiguated; a colliding bare key is marked
 *        AMBIGUOUS instead of picking a winner
 *     -> harmonizeSource (markdown handler, { uriField:'uri', wikilinkTargets }):
 *        frontmatter -> canonical fields + documentRecord passthrough; the
 *        handler sets the document's OWN @id from its declared `uri` (no more
 *        caller-stamped @id); body [[wikilinks]] are resolved INSIDE the
 *        handler against wikilinkTargets into { type:'link', uri } edges
 *        directly on blob.octothorpes (deduped, no self-edges); no-match /
 *        ambiguous links produce no edge, only a blob.warnings entry; the raw
 *        extraction records (heading/alias detail) stay on blob.wikilinks
 *     -> indexer.ingestBlobject (with the profile's documentRecord schema):
 *        writes the Page, the Link/Item relationships, and the typed
 *        documentRecord leaves
 *   -> read back through the public /get HTTP surface (typed).
 *
 * Nothing in octothorp.es is imported by copy: core is loaded straight from the
 * OP checkout (default /Users/nim/dev/octothorp.es, override with OP_REPO), and
 * SPARQL credentials are read from that checkout's .env at runtime — never
 * copied into this repo.
 *
 * Usage:
 *   node demo/run-demo.js          # cleanup -> ingest -> read-back report
 *   node demo/run-demo.js --clean  # remove all demo triples and exit
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import yaml from 'js-yaml'

const HERE = dirname(fileURLToPath(import.meta.url))
const OP_REPO = process.env.OP_REPO || '/Users/nim/dev/octothorp.es'
const VAULT = join(HERE, 'vault')

const {
  harmonizeSource,
  createIndexer,
  createSparqlClient,
  createDefaultHandlerRegistry,
  createHarmonizerRegistry,
} = await import(`${OP_REPO}/packages/core/index.js`)

// buildTargetMap / AMBIGUOUS live on the markdown handler module, not the core
// barrel (#246) — import by that specific path.
const { buildTargetMap, AMBIGUOUS } = await import(
  `${OP_REPO}/packages/core/handlers/markdown/handler.js`
)

// ---- config: creds from the OP checkout's .env, schema from the live relay ---

const parseEnv = (text) => {
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m || line.trim().startsWith('#')) continue
    out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return out
}

let env = {}
try {
  env = parseEnv(readFileSync(join(OP_REPO, '.env'), 'utf8'))
} catch {
  console.warn(`[demo] no .env at ${OP_REPO} — falling back to process.env`)
}

const endpoint = process.env.sparql_endpoint || env.sparql_endpoint || 'http://0.0.0.0:7878'
const user = process.env.sparql_user || env.sparql_user
const password = process.env.sparql_password || env.sparql_password
const instance = (process.env.instance || env.instance || 'http://localhost:5173/').replace(/\/?$/, '/')
const base = instance.replace(/\/$/, '')

// A content-addressed hub (ni: URI, RFC 6920) — the structural Item edge the
// Memex client stamps onto a Record before ingest (spec §3). Namespaced so it
// is caught by cleanup.
const niHash = 'ni:///sha-256;memexdemo0000111122223333444455556666777788889999aaaa'

// Declared identities from the vault's own frontmatter (#246: identity is
// authored, not minted from the path). Kept as named constants for the
// read-back steps below; must match demo/vault/notes/{Redwoods,Ferns}.md.
const redwoods = 'ni:///sha-256;memexdemoRedwoodsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const ferns = 'ni:///sha-256;memexdemoFernsBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

const { query, queryBoolean, queryArray, insert } = createSparqlClient({ endpoint, user, password })

// ---- vault discovery ---------------------------------------------------------

const walk = (dir) => {
  const files = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else if (name.endsWith('.md')) files.push(full)
  }
  return files
}

const vaultDocs = walk(VAULT)
  .map((full) => relative(VAULT, full).split('\\').join('/'))
  .sort()

const rawByPath = Object.fromEntries(
  vaultDocs.map((path) => [path, readFileSync(join(VAULT, path), 'utf8')])
)

// The caller's one pass over the vault: name -> declared uri lookup, built
// once from the raw sources' frontmatter (#246).
const targetMap = buildTargetMap(
  vaultDocs.map((path) => ({ source: rawByPath[path], path })),
  { uriField: 'uri' }
)

// Declared record URIs (deduped, AMBIGUOUS sentinel dropped) — these, not
// path-derived URLs, are what cleanup deletes.
const recordUris = [...new Set(targetMap.values())].filter((v) => v !== AMBIGUOUS)

// ---- cleanup -----------------------------------------------------------------

// Hashtag Term nodes minted from the demo's frontmatter `tags` (namespaced so
// they cannot collide with real shared vocabulary). Cleanup removes them too.
const tagTerms = ['memexdemo-trees', 'memexdemo-conifers'].map((t) => `${base}/~/${t}`)

const cleanup = async () => {
  for (const uri of [...recordUris, niHash, ...tagTerms]) {
    await query(`DELETE WHERE { <${uri}> ?p ?o }`)
    await query(`DELETE WHERE { ?s <${uri}> ?o }`)
    await query(`DELETE WHERE { ?s octo:hasPart <${uri}> }`)
    await query(`DELETE WHERE { ?bn octo:url <${uri}> . ?bn ?p ?o }`)
  }
}

// ---- pipeline ----------------------------------------------------------------

const harmonizeAll = async () => {
  const blobs = {}
  for (const path of vaultDocs) {
    blobs[path] = await harmonizeSource(rawByPath[path], null, {
      mode: 'markdown',
      instance,
      uriField: 'uri',
      wikilinkTargets: targetMap,
    })
  }
  return blobs
}

const settle = async (ms = 1500) => new Promise((r) => setTimeout(r, ms))

const run = async () => {
  console.log(`[demo] relay      ${instance}`)
  console.log(`[demo] sparql     ${endpoint} (auth: ${user && password ? 'basic' : 'none'})`)
  console.log(`[demo] vault      ${vaultDocs.length} docs:`, vaultDocs.join(', '))

  // 1. documentRecord schema comes from the LIVE relay profile (profile-driven).
  const profileRes = await fetch(`${base}/profile.json`)
  if (!profileRes.ok) throw new Error(`relay /profile.json returned ${profileRes.status}`)
  const profile = await profileRes.json()
  const documentRecordSchema = profile.vocabulary?.documentRecord || []
  console.log(
    `\n[1] profile.json documentRecord predicates:`,
    documentRecordSchema.map((d) => `${d.predicate}(${d.range})`).join(', ')
  )

  const indexer = createIndexer({
    insert,
    query,
    queryBoolean,
    queryArray,
    instance,
    handlerRegistry: createDefaultHandlerRegistry(),
    getHarmonizer: createHarmonizerRegistry(instance).getHarmonizer,
    documentRecordSchema,
  })

  console.log('\n[2] cleanup (idempotent) ...')
  await cleanup()

  console.log('\n[3] harmonize (declared-URI @id + per-handler wikilink resolution) ...')
  const blobs = await harmonizeAll()

  for (const path of vaultDocs) {
    const blob = blobs[path]
    const resolved = (blob.octothorpes || [])
      .filter((o) => o && typeof o === 'object' && o.type === 'link')
      .map((o) => o.uri)
    const warnings = (blob.warnings || []).map((w) => `${w.target} [${w.reason}]`)
    if (resolved.length || warnings.length) {
      console.log(`    ${path}  (@id = ${blob['@id']})`)
      resolved.forEach((uri) => console.log(`      resolved:   -> ${uri}`))
      warnings.forEach((s) => console.log(`      WARNING:    ${s}`))
    }
  }

  console.log('\n[4] ingest each blobject (Page + relationships + typed documentRecord) ...')
  for (const path of vaultDocs) {
    const blob = blobs[path]
    // Stamp the generated Item edge onto the Redwoods Record before ingest.
    if (path === 'notes/Redwoods.md') {
      blob.octothorpes.push({ type: 'Item', uri: niHash })
    }
    await indexer.ingestBlobject(blob, { instance })
    console.log(`    ingested ${path}`)
  }

  await settle()

  // ---- read back through the public HTTP surface ----------------------------

  console.log('\n[5] read-back: one doc by URI via /get/everything/thorped (blobject read ~10-12s) ...')
  const drRes = await fetch(
    `${base}/get/everything/thorped/debug?s=${encodeURIComponent(redwoods)}&match=exact`
  )
  const drOut = await drRes.json()
  const rec = (drOut.actualResults || [])[0]
  const dr = rec?.documentRecord
  console.log('    Redwoods.documentRecord =', JSON.stringify(dr, null, 2))
  console.log(`    contentSize typeof       = ${typeof dr?.contentSize} (declared range: number -> JS number)`)
  console.log(`    dateCreated              = ${dr?.dateCreated} (declared range: timestamp -> ISO)`)
  console.log(`    declared 'uri'           = ${dr?.uri} (identity -> @id, never a documentRecord leaf)`)
  console.log(`    undeclared 'layout'      = ${dr?.layout} (dropped: not in the profile schema)`)
  console.log(`    undeclared 'permalink'   = ${dr?.permalink} (dropped: not in the profile schema)`)
  // Frontmatter `tags` are NOT documentRecord: they are lifted to hashtag
  // thorpes (octo:Term), stored as bare strings on octothorpes.
  const hashtags = (rec?.octothorpes || []).filter((o) => typeof o === 'string')
  console.log(`    frontmatter tags         = ${JSON.stringify(hashtags)} (lifted to hashtags/octo:Term, NOT documentRecord)`)

  console.log('\n[6] read-back: Item subtype path /get/items/posted ...')
  const itRes = await fetch(`${base}/get/items/posted/debug`)
  const itOut = await itRes.json()
  const itUris = (itOut.actualResults || []).map((r) => r['@id'] ?? r.uri ?? r.s)
  console.log(`    filters.subtype          = ${itOut.multiPass?.filters?.subtype}`)
  console.log(`    Redwoods present         = ${itUris.includes(redwoods)}`)

  console.log('\n[7] read-back: resolved wikilink persisted as a Link edge (SPARQL ASK) ...')
  const linkPersisted = await queryBoolean(`
    ASK {
      <${redwoods}> octo:octothorpes ?bn .
      ?bn octo:url <${ferns}> .
      ?bn rdf:type <octo:Link> .
    }
  `)
  console.log(`    Redwoods -> Ferns Link   = ${linkPersisted}`)

  const ghostStored = await queryBoolean(`
    ASK { <${redwoods}> octo:octothorpes ?bn . ?bn octo:url ?u . FILTER(CONTAINS(STR(?u), "Wildfire")) }
  `)
  console.log(`    unresolved Wildfire edge = ${ghostStored} (expected false — never stored; only a warning)`)

  console.log('\n[demo] done. Re-run with --clean to remove all demo triples.')
}

// ---- entry -------------------------------------------------------------------

const arg = process.argv[2]
if (arg === '--clean') {
  console.log(`[demo] cleaning ${recordUris.length} record URIs + hub + tag terms ...`)
  await cleanup()
  console.log('[demo] clean complete.')
} else {
  await run()
}
