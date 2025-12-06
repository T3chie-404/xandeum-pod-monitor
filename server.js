const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");
const axios = require("axios");

// Import our library modules
const ServiceManager = require("./lib/services");
const PRPCClient = require("./lib/api");
const LogManager = require("./lib/logs");
const NetworkManager = require("./lib/network");
const SystemMonitor = require("./lib/system");
const terminalManager = require("./lib/terminal");

// Load configuration
const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize Terminal Manager

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static("public"));

// Rate limiting (simple in-memory implementation)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = config.security.rateLimit.maxRequestsPerMinute || 60;

function checkRateLimit(req, res, next) {
  if (!config.security.rateLimit.enabled) {
    return next();
  }
  
  const ip = req.ip;
  const now = Date.now();
  
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const record = requestCounts.get(ip);
  
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  
  if (record.count >= MAX_REQUESTS) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }
  
  record.count++;
  next();
}

app.use(checkRateLimit);

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * Dashboard overview
 */
app.get("/api/dashboard", async (req, res) => {
  try {
    const [services, system, network, prpcHealth] = await Promise.all([
      ServiceManager.getStatusSummary(),
      SystemMonitor.getAllStats(),
      NetworkManager.getSummary(),
      PRPCClient.healthCheck()
    ]);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      services,
      system,
      network,
      prpc: prpcHealth
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get all service statuses
 */
app.get("/api/services", async (req, res) => {
  try {
    const statuses = await ServiceManager.getAllStatus();
    res.json({ success: true, services: statuses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get single service status
 */
app.get("/api/services/:name", async (req, res) => {
  try {
    const status = await ServiceManager.getStatus(req.params.name);
    res.json({ success: true, service: status });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Control a service (start/stop/restart)
 */
app.post("/api/services/:name/:action", async (req, res) => {
  if (!config.security.enableServiceControl) {
    return res.status(403).json({ success: false, error: "Service control is disabled" });
  }
  
  try {
    const result = await ServiceManager.controlService(
      req.params.name,
      req.params.action
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Restart all services
 */
app.post("/api/services/restart-all", async (req, res) => {
  if (!config.security.enableServiceControl) {
    return res.status(403).json({ success: false, error: "Service control is disabled" });
  }
  
  try {
    const results = await ServiceManager.restartAll();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get logs for a service
 */
app.get("/api/logs/:service", async (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 50;
    const filter = req.query.filter || null;
    
    // Set longer timeout for large log requests
    req.setTimeout(30000); // 30 seconds
    
    const logs = await LogManager.getLogs(req.params.service, lines, filter);
    res.json(logs);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Find pubkey (restart pod and extract from logs)
 */
app.post("/api/find-pubkey", async (req, res) => {
  try {
    const result = await LogManager.findPubkey();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * pRPC API calls
 */
app.post("/api/prpc/:method", async (req, res) => {
  try {
    const method = req.params.method;
    const params = req.body.params || {};
    
    let result;
    
    // Handle known methods
    switch (method) {
      case "get-version":
        result = await PRPCClient.getVersion();
        break;
      case "get-stats":
        result = await PRPCClient.getStats();
        break;
      case "get-pods":
        result = await PRPCClient.getPods();
        break;
      default:
        // Custom method
        result = await PRPCClient.customCall(method, params);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Network diagnostics
 */
app.get("/api/network", async (req, res) => {
  try {
    const diagnostics = await NetworkManager.runDiagnostics();
    res.json({ success: true, diagnostics });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * System stats
 */
app.get("/api/system", async (req, res) => {
  try {
    const stats = await SystemMonitor.getAllStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Health check
 */
app.get("/api/health", async (req, res) => {
  try {
    const [systemHealth, serviceStatus] = await Promise.all([
      SystemMonitor.getHealthStatus(),
      ServiceManager.getStatusSummary()
    ]);
    
    const overallScore = Math.floor(
      (systemHealth.score * 0.4) + 
      ((serviceStatus.summary.running / serviceStatus.summary.total) * 100 * 0.6)
    );
    
    res.json({
      success: true,
      score: overallScore,
      status: overallScore >= 80 ? "healthy" : overallScore >= 50 ? "warning" : "critical",
      system: systemHealth,
      services: serviceStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get terminal activity log
 */
app.get("/api/terminal/activity", (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const log = terminalManager.getActivityLog(limit);
  res.json({ success: true, log });
});

// ============================================================================
// WEBSOCKET TERMINAL HANDLER
// ============================================================================

/**
 * Passive pubkey lookup (no restart)
 */
app.get("/api/pod-pubkey", async (req, res) => {
  try {
    const result = await LogManager.getPubkeyPassive();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Credits: fetch global list and local credits (if pubkey known)
 */
app.get("/api/pod-credits", async (req, res) => {
  try {
    const [creditsResp, pubkeyResult] = await Promise.all([
      axios.get("https://pods-credit.vercel.app/api/pods-credits", { timeout: 5000 }),
      LogManager.getPubkeyPassive()
    ]);

    const list = Array.isArray(creditsResp.data?.pods_credits) ? creditsResp.data.pods_credits : [];
    const pubkey = pubkeyResult.pubkey || null;
    const local = pubkey ? list.find(p => p.pod_id === pubkey) : null;

    res.json({
      success: true,
      pubkey,
      credits: local ? local.credits : null,
      list
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DevNet eligibility (95th percentile * 0.8 threshold)
 */
app.get("/api/devnet-eligibility", async (req, res) => {
  try {
    const [creditsResp, pubkeyResult] = await Promise.all([
      axios.get("https://pods-credit.vercel.app/api/pods-credits", { timeout: 5000 }),
      LogManager.getPubkeyPassive()
    ]);

    const list = Array.isArray(creditsResp.data?.pods_credits) ? creditsResp.data.pods_credits : [];
    const creditsOnly = list.map(p => p.credits).filter(c => typeof c === "number").sort((a, b) => a - b);
    const count = creditsOnly.length;
    const p95 = count > 0 ? creditsOnly[Math.floor(0.95 * (count - 1))] : null;
    const threshold = p95 !== null ? Math.round(p95 * 0.8) : null;
    const maxCredits = count > 0 ? creditsOnly[count - 1] : null;

    const pubkey = pubkeyResult.pubkey || null;
    const localEntry = pubkey ? list.find(p => p.pod_id === pubkey) : null;
    const localCredits = localEntry ? localEntry.credits : null;
    const eligible = threshold !== null && localCredits !== null ? localCredits >= threshold : null;

    res.json({
      success: true,
      pubkey,
      localCredits,
      percentile95: p95,
      threshold,
      maxCredits,
      eligible,
      totalPods: count
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

wss.on("connection", (ws) => {
  if (!config.security.enableTerminal) {
    ws.close(1008, "Terminal access is disabled");
    return;
  }
  
  const sessionId = generateSessionId();
  let ptyProcess = null;
  
  console.log(`[Terminal] New connection: ${sessionId}`);
  
  try {
    ptyProcess = terminalManager.createSession(sessionId);
    
    // Send data from PTY to WebSocket
    ptyProcess.on("data", (data) => {
      try {
        ws.send(data);
      } catch (error) {
        console.error(`[Terminal] Error sending data: ${error.message}`);
      }
    });
    
    // Handle PTY exit
    ptyProcess.on("exit", () => {
      console.log(`[Terminal] PTY exited: ${sessionId}`);
      terminalManager.closeSession(sessionId);
      ws.close();
    });
    
  } catch (error) {
    console.error(`[Terminal] Error creating session: ${error.message}`);
    ws.send(`Error: ${error.message}\r\n`);
    ws.close();
    return;
  }
  
  // Handle incoming data from WebSocket
  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data);
      
      if (message.type === "input") {
        terminalManager.writeToSession(sessionId, message.data);
      } else if (message.type === "resize") {
        terminalManager.resizeSession(sessionId, message.cols, message.rows);
      }
    } catch (error) {
      console.error(`[Terminal] Error processing message: ${error.message}`);
    }
  });
  
  // Handle WebSocket close
  ws.on("close", () => {
    console.log(`[Terminal] Connection closed: ${sessionId}`);
    terminalManager.closeSession(sessionId);
  });
  
  // Handle WebSocket error
  ws.on("error", (error) => {
    console.error(`[Terminal] WebSocket error: ${error.message}`);
    terminalManager.closeSession(sessionId);
  });
});

// ============================================================================
// CLEANUP & STARTUP
// ============================================================================

// Clean up inactive terminal sessions periodically
setInterval(() => {
  terminalManager.cleanupInactiveSessions();
}, 300000); // Every 5 minutes

// Generate random session ID
function generateSessionId() {
  return `term_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Start server
const HOST = config.server.host;
const PORT = config.server.port;

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Xandeum Pod Manager (Pod-Man)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log(`  Server:    http://${HOST}:${PORT}`);
  console.log(`  Host:      ${HOST === "127.0.0.1" ? "Localhost only" : "Public"}`);
  console.log(`  Security:  Rate limiting ${config.security.rateLimit.enabled ? "enabled" : "disabled"}`);
  console.log(`  Terminal:  ${config.security.enableTerminal ? "Enabled" : "Disabled"}`);
  console.log(`  Services:  ${config.security.enableServiceControl ? "Control enabled" : "Read-only"}`);
  console.log("");
  if (HOST === "127.0.0.1") {
    console.log("  Access remotely via SSH tunnel:");
    console.log(`  ssh -L ${PORT}:localhost:${PORT} user@your-server`);
  }
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\nShutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\n\nReceived SIGTERM, shutting down...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
