#!/usr/bin/env node

/**
 * Asili Local Risk Calculation Server
 * Unified server for DNA processing, risk calculation, and cache management
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createServerProcessor } from '../../packages/core/src/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PATHS } from '../../packages/core/src/constants/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class AsiliCalcServer {
  constructor(config = {}) {
    this.port = config.port !== undefined ? config.port : (process.env.CALC_PORT || 5252);
    this.dataDir = config.dataDir || process.env.DATA_DIR || path.join(__dirname, '../../data_out');
    this.cacheDir = config.cacheDir || process.env.CACHE_DIR || path.join(__dirname, '../../data_out/cache');
    this.storageDir = config.storageDir || process.env.STORAGE_DIR || path.join(__dirname, '../../server-data');

    this.processor = null;
    this.wsServer = null;
    this.activeJobs = new Map();
    this.completedJobs = new Map();
    this.individuals = new Map();
    this.dnaCache = new Map(); // Cache loaded DNA per individual
    this.isProcessing = false;
  }

  async start() {
    console.log('🧬 Starting Asili Calculation Server...');

    // Ensure directories exist
    await fs.mkdir(this.storageDir, { recursive: true });
    await fs.mkdir(this.cacheDir, { recursive: true });

    // Initialize unified processor
    this.processor = await createServerProcessor({
      dataDir: this.storageDir,
      cacheDir: this.cacheDir,
      traitDataDir: this.dataDir
    });

    // Create empty cache file if it doesn't exist
    await this.initializeEmptyCache();

    console.log(`   Data directory: ${this.dataDir}`);
    console.log(`   Cache directory: ${this.cacheDir}`);
    console.log(`   Storage directory: ${this.storageDir}`);

    // Load all individuals' DNA into memory
    await this.loadAllDNA();

    // Log startup statistics
    await this.logStartupStats();

    // Only create HTTP server if port is specified
    if (this.port > 0) {
      // Create HTTP server
      const server = createServer((req, res) => this.handleRequest(req, res));

      // Create WebSocket server for real-time updates
      this.wsServer = new WebSocketServer({ server });
      this.wsServer.on('connection', (ws, req) => this.handleWebSocket(ws, req));

      server.listen(this.port, () => {
        console.log(`✅ Calculation server running on http://localhost:${this.port}`);
        console.log(`   WebSocket endpoint: ws://localhost:${this.port}/ws`);
      });

      return server;
    } else {
      console.log('✅ Calculation server initialized (no HTTP server)');
      return null;
    }
  }

  async handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);

    // CORS headers for frontend access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      const route = url.pathname;

      if (route === '/health') {
        this.sendJSON(res, { status: 'healthy', timestamp: new Date().toISOString() });
      } else if (route === '/status') {
        this.sendJSON(res, await this.getServerStatus());
      } else if (route.startsWith('/api/risk-score/')) {
        await this.handleRiskScoreAPI(req, res, route);
      } else if (route.startsWith('/individuals')) {
        await this.handleIndividuals(req, res, route);
      } else if (route.startsWith('/dna/')) {
        await this.handleDNA(req, res, route);
      } else if (route.startsWith('/calculate/')) {
        await this.handleCalculation(req, res, route);
      } else if (route.startsWith('/results/')) {
        await this.handleResults(req, res, route);
      } else if (route.startsWith('/cache/')) {
        await this.handleCache(req, res, route);
      } else if (route.startsWith('/queue/')) {
        await this.handleQueue(req, res, route);
      } else {
        this.send404(res);
      }
    } catch (error) {
      console.error('Server error:', error);
      this.send500(res, error.message);
    }
  }

  async handleRiskScoreAPI(req, res, route) {
    if (req.method !== 'GET') {
      this.send405(res);
      return;
    }

    const pathParts = route.split('/').filter(p => p);
    if (pathParts.length !== 4) {
      this.send404(res, 'Invalid API path');
      return;
    }

    const [, , individualId, traitId] = pathParts;

    try {
      const result = await this.processor.storage.getCachedRiskScore(individualId, traitId);

      if (result) {
        // Get trait metadata from database (includes overrides)
        const { getConnection } = await import('../../packages/pipeline/lib/shared-db.js');

        let traitType = 'disease_risk';
        let unit = null;
        let traitName = traitId;
        let emoji = null;

        try {
          const conn = await getConnection();
          const rows = await new Promise((resolve, reject) => {
            conn.all('SELECT name, trait_type, unit, emoji, editorial_name FROM traits WHERE trait_id = ?', [traitId], (err, rows) => {
              err ? reject(err) : resolve(rows);
            });
          });

          const trait = rows?.[0];
          if (trait) {
            traitName = trait.editorial_name || trait.name;
            traitType = trait.trait_type || 'disease_risk';
            unit = trait.unit;
            emoji = trait.emoji;
          }
        } catch (dbError) {
          console.error('Failed to get trait metadata:', dbError.message);
        }

        result.traitType = traitType;
        result.traitName = traitName;
        if (unit) result.unit = unit;
        if (emoji) result.emoji = emoji;

        // Add phenotype reference data for quantitative traits
        if (traitType === 'quantitative') {
          try {
            const { getConnection } = await import('../../packages/pipeline/lib/shared-db.js');
            const phenoConn = await getConnection();
            const traitRows = await new Promise((resolve, reject) => {
              phenoConn.all('SELECT phenotype_mean, phenotype_sd, reference_population FROM traits WHERE trait_id = ?', [traitId], (err, rows) => {
                err ? reject(err) : resolve(rows);
              });
            });

            if (traitRows?.[0]) {
              result.phenotype_mean = traitRows[0].phenotype_mean;
              result.phenotype_sd = traitRows[0].phenotype_sd;
              result.reference_population = traitRows[0].reference_population;
            }
          } catch (err) {
            console.error('Failed to get phenotype data:', err.message);
          }
        }

        // Enrich pgsDetails with metadata from database
        if (result.pgsDetails) {
          const { getTraitPGS } = await import('../../packages/pipeline/lib/trait-db.js');
          const { getPGS } = await import('../../packages/pipeline/lib/pgs-db.js');

          try {
            const pgsScores = await getTraitPGS(traitId);
            let totalVariants = 0;

            for (const { pgs_id } of pgsScores) {
              if (result.pgsDetails[pgs_id]) {
                const pgs = await getPGS(pgs_id);
                if (pgs) {
                  // Enrich metadata
                  if (!result.pgsDetails[pgs_id].metadata) {
                    result.pgsDetails[pgs_id].metadata = {};
                  }
                  result.pgsDetails[pgs_id].metadata.name = pgs.method_name || pgs_id;
                  result.pgsDetails[pgs_id].metadata.variants_number = pgs.variants_count ? Number(pgs.variants_count) : null;

                  // Add normalization parameters from database
                  if (pgs.norm_mean !== undefined && pgs.norm_mean !== null) {
                    result.pgsDetails[pgs_id].normMean = pgs.norm_mean;
                  }
                  if (pgs.norm_sd !== undefined && pgs.norm_sd !== null) {
                    result.pgsDetails[pgs_id].normSd = pgs.norm_sd;
                  }

                  if (pgs.variants_count) totalVariants += Number(pgs.variants_count);
                }
              }
            }

            result.totalVariants = totalVariants;
          } catch (dbError) {
            console.error('Failed to enrich with DB data:', dbError.message);
          }
        }

        // Get z-scores for other individuals on the same trait
        const allIndividuals = await this.processor.storage.getIndividuals();
        const otherScores = [];

        for (const ind of allIndividuals) {
          if (ind.id !== individualId) {
            const otherResult = await this.processor.storage.getCachedRiskScore(ind.id, traitId);
            if (otherResult?.zScore !== null && otherResult?.zScore !== undefined) {
              const otherEntry = {
                individualId: ind.id,
                emoji: ind.emoji,
                name: ind.name,
                zScore: otherResult.zScore,
                riskScore: otherResult.riskScore
              };

              // Add value for quantitative traits
              if (traitType === 'quantitative' && unit && otherResult.value !== undefined) {
                otherEntry.value = otherResult.value;
              }

              otherScores.push(otherEntry);
            }
          }
        }

        // Enrich top variants with other individuals' genotypes from DNA cache
        if (result.pgsBreakdown) {
          for (const pgsId in result.pgsBreakdown) {
            const breakdown = result.pgsBreakdown[pgsId];
            if (breakdown.topVariants && breakdown.topVariants.length > 0) {
              // Use cached DNA for other individuals
              for (const ind of allIndividuals) {
                if (ind.id !== individualId) {
                  const dnaMap = this.dnaCache.get(ind.id);
                  if (dnaMap) {
                    // Match variants and add genotype
                    for (const v of breakdown.topVariants) {
                      let match = dnaMap.get(v.rsid);
                      if (!match && v.rsid.includes(':')) {
                        const parts = v.rsid.split(':');
                        if (parts.length >= 2) {
                          match = dnaMap.get(`${parts[0]}:${parts[1]}`);
                        }
                      }
                      if (match) {
                        if (!v.otherGenotypes) v.otherGenotypes = {};
                        v.otherGenotypes[ind.id] = {
                          emoji: ind.emoji,
                          name: ind.name,
                          genotype: `${match.allele1}${match.allele2}`
                        };
                      }
                    }
                  }
                }
              }
            }
          }
        }

        this.sendJSON(res, { ...result, otherIndividuals: otherScores });
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Result not found' }));
      }
    } catch (error) {
      console.error(`API error for ${traitId}:`, error);
      this.send500(res, error.message);
    }
  }

  async handleIndividuals(req, res, route) {
    if (req.method === 'GET' && route === '/individuals') {
      const individuals = await this.processor.storage.getIndividuals();
      this.sendJSON(res, individuals);

    } else if (req.method === 'GET' && route.startsWith('/individuals/')) {
      const individualId = route.split('/')[2];
      const individual = await this.processor.storage.getIndividual(individualId);

      if (individual) {
        this.sendJSON(res, individual);
      } else {
        this.send404(res, 'Individual not found');
      }

    } else if (req.method === 'POST' && route === '/individuals') {
      const body = await this.readBody(req);
      const data = JSON.parse(body);

      const individual = await this.processor.storage.addIndividual(
        data.id,
        data.name,
        data.relationship || 'self',
        data.emoji || '👤'
      );

      this.sendJSON(res, individual);

    } else if (req.method === 'PUT' && route.startsWith('/individuals/')) {
      const individualId = route.split('/')[2];
      let updates;
      if (req.body && Object.keys(req.body).length > 0) {
        updates = req.body;
      } else {
        const body = await this.readBody(req);
        updates = JSON.parse(body);
      }

      const updated = await this.processor.storage.updateIndividual(individualId, updates);
      this.sendJSON(res, updated);

    } else if (req.method === 'DELETE' && route.startsWith('/individuals/')) {
      const individualId = route.split('/')[2];
      await this.processor.storage.deleteIndividual(individualId);
      this.sendJSON(res, { success: true });

    } else {
      this.send404(res);
    }
  }

  async handleDNA(req, res, route) {
    if (req.method === 'POST' && route === '/dna/upload') {
      console.log('🧬 DNA upload request received');

      // Use Express parsed body if available, otherwise read manually
      let data;
      if (req.body && Object.keys(req.body).length > 0) {
        console.log('📦 Using Express parsed body');
        data = req.body;
      } else {
        console.log('📖 Reading body manually');
        const body = await this.readBody(req);
        data = JSON.parse(body);
      }

      console.log('📊 Parsed data for individual:', data?.individualId);

      try {
        console.log('🔄 Creating temp file object...');
        // Create a temporary file-like object for the unified processor
        const tempFile = {
          name: `${data.individualName}_dna.txt`,
          text: () => Promise.resolve(data.dnaContent)
        };

        console.log('🧬 Starting DNA import...');
        const result = await this.processor.processor.importDNA(
          tempFile,
          data.individualId,
          data.individualName,
          data.emoji || '👤',
          (message, progress) => {
            console.log(`📈 Progress: ${progress}% - ${message}`);
            // Broadcast progress via WebSocket (if available)
            if (this.wsServer?.clients) {
              this.wsServer.clients.forEach(client => {
                if (client.individualId === data.individualId && client.readyState === 1) {
                  client.send(JSON.stringify({
                    type: 'upload-progress',
                    individualId: data.individualId,
                    message,
                    progress
                  }));
                }
              });
            }
          }
        );

        console.log('✅ DNA import completed, updating individual status...');
        // Mark individual as ready after successful import
        await this.processor.storage.updateIndividual(data.individualId, { status: 'ready' });

        console.log(`✅ DNA import complete for ${data.individualName}: ${result.variantCount} variants stored`);

        this.sendJSON(res, {
          success: true,
          individualId: data.individualId,
          variantCount: result.variantCount,
          metadata: result.metadata
        });

      } catch (error) {
        console.error('❌ DNA upload failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }

    } else if (req.method === 'GET' && route.startsWith('/dna/')) {
      const individualId = route.split('/')[2];
      const hasData = await this.processor.storage.getVariants(individualId);
      this.sendJSON(res, {
        hasData: hasData.length > 0,
        variantCount: hasData.length
      });

    } else {
      this.send404(res);
    }
  }

  async handleCalculation(req, res, route) {
    if (req.method !== 'POST') {
      this.send405(res);
      return;
    }

    // Use Express parsed body if available, otherwise read manually
    let data;
    if (req.body && Object.keys(req.body).length > 0) {
      console.log('📦 Using Express parsed body');
      data = req.body;
    } else {
      console.log('📖 Reading body manually');
      const body = await this.readBody(req);
      data = JSON.parse(body);
    }

    console.log('📊 Request data:', data);
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (route === '/calculate/risk') {
      // Single trait calculation
      this.activeJobs.set(jobId, {
        type: 'single',
        individualId: data.individualId,
        traitId: data.traitId,
        startTime: Date.now()
      });

      // Start calculation in background
      this.calculateRiskAsync(jobId, data.individualId, data.traitId);

      this.sendJSON(res, { jobId, status: 'started' });

    } else if (route === '/calculate/batch') {
      // Batch calculation
      this.activeJobs.set(jobId, {
        type: 'batch',
        individualId: data.individualId,
        startTime: Date.now()
      });

      // Start batch calculation in background
      this.calculateBatchAsync(jobId, data.individualId);

      this.sendJSON(res, { jobId, status: 'started' });

    } else {
      this.send404(res);
    }
  }

  async handleResults(req, res, route) {
    const pathParts = route.split('/').filter(p => p);

    if (pathParts.length === 2 && pathParts[1] === 'cache') {
      // /results/cache - get all cached results
      const allResults = await this.processor.storage.getAllCachedResults();
      this.sendJSON(res, allResults);

    } else if (pathParts.length === 2) {
      // /results/{individualId} - get all results
      const individualId = pathParts[1];
      const results = await this.processor.getCachedResults(individualId);
      this.sendJSON(res, results);

    } else if (pathParts.length === 3) {
      // /results/{individualId}/{traitId} - get specific result
      const [, individualId, traitId] = pathParts;
      const result = await this.processor.getCachedResult(individualId, traitId);

      if (result) {
        this.sendJSON(res, result);
      } else {
        this.send404(res, 'Result not found');
      }
    } else {
      this.send404(res);
    }
  }

  async handleCache(req, res, route) {
    if (route === '/cache/stats') {
      const stats = await this.processor.getCacheStats();
      this.sendJSON(res, stats || { message: 'No cache available' });

    } else if (route === '/cache/export') {
      const format = new URL(req.url, `http://localhost:${this.port}`).searchParams.get('format') || 'parquet';
      const exportPath = await this.processor.exportCache(format);

      // Send file for download
      const data = await fs.readFile(exportPath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="cache_export.${format}"`
      });
      res.end(data);

    } else if (route.startsWith('/cache/clear')) {
      const individualId = route.split('/')[3] || null;
      await this.processor.clearCache(individualId);
      this.sendJSON(res, { success: true });

    } else if (route.startsWith('/cache/')) {
      // Serve cache files directly
      const filename = path.basename(route);
      const filePath = path.join(this.cacheDir, filename);

      try {
        const data = await fs.readFile(filePath);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Accept-Ranges': 'bytes'
        });
        res.end(data);
      } catch (error) {
        this.send404(res, `Cache file not found: ${filename}`);
      }
    }
  }

  async handleQueue(req, res, route) {
    if (route === '/queue/status') {
      const queueStatus = this.processor.queueManager?.getQueueState() || { message: 'No queue available' };
      const overallProgress = await this.getOverallProgress();
      this.sendJSON(res, { ...queueStatus, ...overallProgress });

    } else if (route === '/queue/jobs') {
      // Return active jobs
      const jobs = Array.from(this.activeJobs.entries()).map(([jobId, job]) => ({
        jobId,
        ...job,
        duration: Date.now() - job.startTime
      }));
      this.sendJSON(res, jobs);

    } else if (route.startsWith('/queue/job/')) {
      const jobId = route.split('/')[3];

      // Check active jobs first
      const activeJob = this.activeJobs.get(jobId);
      if (activeJob) {
        this.sendJSON(res, {
          jobId,
          ...activeJob,
          duration: Date.now() - activeJob.startTime,
          status: 'active'
        });
        return;
      }

      // Check completed jobs
      const completedJob = this.completedJobs.get(jobId);
      if (completedJob) {
        this.sendJSON(res, {
          ...completedJob,
          status: 'completed'
        });
        return;
      }

      this.send404(res, 'Job not found');

    } else {
      this.send404(res);
    }
  }

  async calculateRiskAsync(jobId, individualId, traitId) {
    try {
      const individual = await this.processor.storage.getIndividual(individualId);
      const individualName = individual ? `${individual.emoji} ${individual.name}` : individualId;

      console.log(`🔬 Starting risk calculation: ${traitId} for ${individualName}`);
      this.broadcastProgress(jobId, 'Starting risk calculation...', 0);

      const result = await this.processor.processor.calculateTraitRisk(
        traitId,
        individualId,
        (message, progress) => {
          this.broadcastProgress(jobId, message, progress);
        },
        this.dnaCache.get(individualId) // Pass cached DNA
      );

      // Format completion message based on trait type
      let completionMsg;
      if (result.value !== undefined && result.value !== null) {
        // Quantitative trait - show actual value
        const trait = this.processor.processor.traitManifest?.traits?.[traitId];
        const unit = trait?.unit || '';
        completionMsg = `✅ Calculation complete for ${individualName} - Value: ${result.value.toFixed(2)}${unit ? ' ' + unit : ''}, Matches: ${result.matchedVariants}`;
      } else {
        // Disease risk - show z-score
        completionMsg = `✅ Calculation complete for ${individualName} - Z-score: ${result.zScore?.toFixed(2) || 'N/A'}, Matches: ${result.matchedVariants}`;
      }
      console.log(completionMsg);
      this.broadcastProgress(jobId, 'Storing results...', 95);

      this.broadcastProgress(jobId, 'Calculation complete', 100);
      this.broadcastResult(jobId, { success: true, data: result });

    } catch (error) {
      console.error(`❌ Job ${jobId} failed:`, error.message);
      this.broadcastResult(jobId, { success: false, error: error.message });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  async calculateBatchAsync(jobId, individualId) {
    try {
      this.broadcastProgress(jobId, 'Starting batch calculation...', 0);

      // Mock batch processing
      const traitCount = 50;
      for (let i = 0; i < traitCount; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const progress = Math.round((i / traitCount) * 100);
        this.broadcastProgress(jobId, `Processing trait ${i + 1}/${traitCount}`, progress);
      }

      // Mock results
      const results = Array.from({ length: traitCount }, (_, i) => ({
        traitId: `trait_${i + 1}`,
        success: Math.random() > 0.1, // 90% success rate
        data: {
          riskScore: (Math.random() - 0.5) * 2,
          matchedVariants: Math.floor(Math.random() * 1000) + 100
        }
      }));

      this.broadcastProgress(jobId, 'Batch calculation complete', 100);
      this.broadcastResult(jobId, { success: true, data: results });

    } catch (error) {
      console.error(`Batch job ${jobId} failed:`, error);
      this.broadcastResult(jobId, { success: false, error: error.message });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  handleWebSocket(ws, req) {
    const url = new URL(req.url, `ws://localhost:${this.port}`);

    // All connections go to general events channel
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleWebSocketMessage(ws, message);
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Send initial queue state
    this.sendToClient(ws, {
      type: 'queue-state',
      queue: Array.from(this.activeJobs.entries()).map(([jobId, job]) => ({
        jobId,
        ...job,
        status: 'processing'
      }))
    });
  }

  broadcastProgress(jobId, message, percent) {
    const job = this.activeJobs.get(jobId);

    // Always send 100% completion, throttle everything else
    const now = Date.now();
    if (percent < 100 && job.lastProgressBroadcast && now - job.lastProgressBroadcast < 1000) {
      return;
    }
    job.lastProgressBroadcast = now;

    const data = {
      type: 'progress',
      jobId,
      traitId: job?.traitId,
      individualId: job?.individualId,
      message,
      percent,
      timestamp: now
    };

    this.broadcastToAll(data);
  }

  broadcastResult(jobId, result) {
    const job = this.activeJobs.get(jobId);
    const data = {
      type: 'result',
      jobId,
      traitId: job?.traitId,
      individualId: job?.individualId,
      ...result,
      timestamp: Date.now()
    };

    this.completedJobs.set(jobId, {
      ...result,
      completedAt: Date.now(),
      jobId,
      traitId: job?.traitId,
      individualId: job?.individualId
    });

    this.broadcastToAll(data);
    this.isProcessing = false;
    setTimeout(() => this.processQueue(), 100);
  }

  handleWebSocketMessage(ws, message) {
    switch (message.type) {
      case 'queue-add':
        this.addToQueue(message.traitId, message.individualId);
        break;
    }
  }

  async addToQueue(traitId, individualId) {
    // Check if result already exists
    try {
      console.log(`🔍 Checking for existing result: ${traitId} for ${individualId}`);
      const existingResult = await this.processor.storage.getCachedRiskScore(individualId, traitId);
      console.log(`🔍 Existing result check complete:`, existingResult ? 'Found' : 'Not found');
      if (existingResult) {
        console.log(`⚡ Result already exists for ${traitId} and ${individualId}`);
        return null; // Don't queue if result exists
      }
    } catch (error) {
      console.log(`⚠️ Could not check existing result: ${error.message}`);
      console.log(`⚠️ Error stack:`, error.stack);
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.activeJobs.set(jobId, {
      type: 'single',
      traitId,
      individualId,
      status: 'queued',
      startTime: Date.now()
    });

    this.broadcastToAll({
      type: 'queue-updated',
      jobId,
      traitId,
      individualId,
      status: 'queued'
    });

    this.processQueue();
    return jobId;
  }

  async processQueue() {
    if (this.isProcessing) return;

    const queuedJob = Array.from(this.activeJobs.entries())
      .find(([_, job]) => job.status === 'queued');

    if (!queuedJob) return;

    const [jobId, job] = queuedJob;
    this.isProcessing = true;
    job.status = 'processing';

    this.broadcastToAll({
      type: 'job-started',
      jobId,
      traitId: job.traitId,
      individualId: job.individualId
    });

    this.calculateRiskAsync(jobId, job.individualId, job.traitId);
  }

  broadcastToAll(data) {
    if (!this.wsServer) return; // No WebSocket server in embedded mode
    this.wsServer.clients.forEach(client => {
      if (client.readyState === 1) {
        this.sendToClient(client, data);
      }
    });
  }

  sendToClient(ws, data) {
    try {
      ws.send(JSON.stringify(data));
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
    }
  }

  async loadAllDNA() {
    try {
      const individuals = await this.processor.storage.getIndividuals();
      console.log(`🧬 Loading DNA for ${individuals.length} individuals into memory...`);

      for (const ind of individuals) {
        const dna = await this.processor.storage.getVariants(ind.id);
        if (dna && dna.length > 0) {
          // Create lookup maps for fast access
          const dnaMap = new Map();
          dna.forEach(v => {
            if (v.rsid) dnaMap.set(v.rsid, v);
            if (v.chromosome && v.position) {
              dnaMap.set(`${v.chromosome}:${v.position}`, v);
            }
          });
          this.dnaCache.set(ind.id, dnaMap);
          console.log(`   ✅ ${ind.emoji} ${ind.name}: ${dna.length.toLocaleString()} variants loaded`);
        }
      }

      console.log(`💾 DNA cache ready with ${this.dnaCache.size} individuals`);
    } catch (error) {
      console.error('⚠️  Failed to load DNA cache:', error.message);
    }
  }

  async logStartupStats() {
    try {
      // Count individuals in database
      const individuals = await this.processor.storage.getIndividuals();
      console.log(`   📊 Individuals in database: ${individuals.length}`);

      if (individuals.length > 0) {
        // Get cache stats per individual
        const cacheStats = await this.getCacheStatsPerIndividual(individuals);
        const cacheFileSize = await this.getCacheFileSize();

        individuals.forEach(ind => {
          const stats = cacheStats.get(ind.id);
          const cachedCount = stats ? stats.count : 0;
          console.log(`      ${ind.emoji} ${ind.name} (${ind.status}) - ${cachedCount} cached results`);
        });

        if (cacheFileSize > 0) {
          console.log(`   💾 Cache database: ${this.formatBytes(cacheFileSize)}`);
        }
      }

      // Count available traits from parquet files
      const traitStats = await this.getTraitStats();
      console.log(`   🧬 Available traits: ${traitStats.traitCount}`);
      console.log(`   📁 Total parquet size: ${this.formatBytes(traitStats.totalSize)}`);

    } catch (error) {
      console.log(`   ⚠️  Could not load startup stats: ${error.message}`);
    }
  }

  async getCacheStatsPerIndividual(individuals) {
    const stats = new Map();

    try {
      // Ensure storage is initialized and wait for it
      if (!this.processor?.storage) {
        return stats;
      }

      // Block until all cached results are loaded
      const allResults = await this.processor.storage.getAllCachedResults();

      // Count results per individual
      allResults.forEach(result => {
        const currentCount = stats.get(result.individual_id) || { count: 0 };
        currentCount.count++;
        stats.set(result.individual_id, currentCount);
      });

      console.log(`   📊 Loaded ${allResults.length} cached results from database`);
    } catch (error) {
      console.log(`   ⚠️  Could not load cache stats: ${error.message}`);
    }

    return stats;
  }

  async getCacheFileSize() {
    try {
      const cacheFile = PATHS.RISK_SCORES_DB;
      const stats = await fs.stat(cacheFile);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  async getTraitStats() {
    const traitFiles = [];
    let totalSize = 0;

    try {
      // Look in the packs subdirectory for trait parquet files
      const files = await fs.readdir(PATHS.TRAIT_PACKS_DIR);

      for (const file of files) {
        if (file.endsWith('_hg38.parquet')) {
          const filePath = path.join(PATHS.TRAIT_PACKS_DIR, file);
          const stats = await fs.stat(filePath);
          traitFiles.push(file);
          totalSize += stats.size;
        }
      }

      return {
        traitCount: traitFiles.length,
        totalSize,
        files: traitFiles
      };
    } catch (error) {
      console.log(`⚠️ Error reading packs directory ${PATHS.TRAIT_PACKS_DIR}:`, error.message);
      return { traitCount: 0, totalSize: 0, files: [] };
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async initializeEmptyCache() {
    const cacheFile = PATHS.RISK_SCORES_DB;

    console.log('📁 Checking cache file at:', cacheFile);
    if (!cacheFile) {
      console.error('📁 Cache file path is undefined!');
      return;
    }

    try {
      await fs.access(cacheFile);
      console.log('📁 Cache file exists');
    } catch {
      console.log('📁 Cache file does not exist, creating it...');
      await this.processor.storage.initializeEmptyParquet();
      console.log('✅ Cache file created');
    }
  }

  async getOverallProgress() {
    try {
      const traitStats = await this.getTraitStats();
      const totalTraits = traitStats.traitCount;
      const allResults = await this.processor.storage.getAllCachedResults();

      // Group by individual
      const byIndividual = {};
      allResults.forEach(result => {
        if (!byIndividual[result.individual_id]) {
          byIndividual[result.individual_id] = 0;
        }
        byIndividual[result.individual_id]++;
      });

      return {
        totalTraits,
        cachedByIndividual: byIndividual,
        overallProgress: Object.values(byIndividual).reduce((sum, count) => sum + count, 0)
      };
    } catch (error) {
      return { totalTraits: 0, cachedByIndividual: {}, overallProgress: 0 };
    }
  }

  async getServerStatus() {
    const traitStats = await this.getTraitStats();
    const individuals = await this.processor.storage.getIndividuals();
    const overallProgress = await this.getOverallProgress();

    return {
      status: 'running',
      port: this.port,
      activeJobs: this.activeJobs.size,
      wsConnections: this.wsServer?.clients?.size || 0,
      directories: {
        data: this.dataDir,
        cache: this.cacheDir,
        storage: this.storageDir
      },
      statistics: {
        individuals: individuals.length,
        traits: traitStats.traitCount,
        totalParquetSize: traitStats.totalSize
      },
      progress: overallProgress,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  }

  async cleanup() {
    console.log('Cleaning up server resources...');

    // Close WebSocket connections forcefully
    if (this.wsServer) {
      this.wsServer.clients.forEach(client => {
        client.terminate();
      });
      this.wsServer.close();
    }

    // Cleanup processor and storage
    if (this.processor) {
      if (typeof this.processor.cleanup === 'function') {
        await this.processor.cleanup();
      }
      if (this.processor.storage && typeof this.processor.storage.cleanup === 'function') {
        await this.processor.storage.cleanup();
      }
      if (this.processor.genomicProcessor && typeof this.processor.genomicProcessor.cleanup === 'function') {
        await this.processor.genomicProcessor.cleanup();
      }
    }

    // Clear caches
    this.activeJobs.clear();
    this.completedJobs.clear();
    this.individuals.clear();
    this.dnaCache.clear();
  }

  async readBody(req) {
    console.log('📖 Starting to read request body...');
    return new Promise((resolve, reject) => {
      let body = '';
      let chunks = 0;

      req.on('data', chunk => {
        chunks++;
        body += chunk;
        if (chunks % 100 === 0) {
          console.log(`📖 Read ${chunks} chunks, ${body.length} bytes so far...`);
        }
      });

      req.on('end', () => {
        console.log(`✅ Body read complete: ${chunks} chunks, ${body.length} total bytes`);
        resolve(body);
      });

      req.on('error', (error) => {
        console.error('❌ Error reading body:', error);
        reject(error);
      });

      // Add timeout
      setTimeout(() => {
        console.error('⏰ Body read timeout after 30 seconds');
        reject(new Error('Body read timeout'));
      }, 30000);
    });
  }

  sendJSON(res, data) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, (key, value) => {
      if (typeof value === 'bigint') {
        return Number(value);
      }
      return value;
    }, null, 2));
  }

  send404(res, message = 'Not Found') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(message);
  }

  send405(res) {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
  }

  send500(res, message = 'Internal Server Error') {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(message);
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new AsiliCalcServer();
  let httpServer = null;

  const shutdown = async () => {
    console.log('\n🛑 Shutting down calculation server...');
    try {
      if (server) {
        await server.cleanup();
      }
      if (httpServer) {
        httpServer.close();
      }
      console.log('✅ Server shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.start().then(srv => {
    httpServer = srv;
  }).catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}

export { AsiliCalcServer };