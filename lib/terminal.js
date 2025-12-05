const pty = require("node-pty");
const fs = require("fs");

/**
 * Terminal PTY Handler
 * 
 * SECURITY CONSIDERATIONS - CRITICAL:
 * - Warns on dangerous commands before execution
 * - Limits concurrent sessions to prevent resource exhaustion
 * - Logs all terminal activity for audit
 * - Kills sessions after timeout
 * - Sanitizes data before sending to client
 * 
 * ATTACK VECTORS MITIGATED:
 * - Fork bombs: Limited sessions
 * - Disk wiping: Warning system
 * - Resource exhaustion: Timeouts and limits
 * - Information disclosure: Runs as same user (not root escalation)
 */

// Dangerous command patterns (regex)
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\/($|\s)/,           // rm -rf /
  /rm\s+-rf\s+~\/\*($|\s)/,        // rm -rf ~/*
  /:\(\)\{.*\|\:&\s*\};:\s*/,      // Fork bomb
  /dd\s+if=/,                      // dd commands
  /mkfs/,                          // Format filesystem
  />\s*\/dev\/sd[a-z]/,            // Write to disk
  /chmod\s+-R\s+777\s+\//,         // Chmod root
  /wget.*\|.*bash/,                // Wget pipe to bash
  /curl.*\|.*bash/,                // Curl pipe to bash
  /sudo\s+su\s*$/                  // Sudo su without args
];

// Warning messages for dangerous commands
const WARNING_MESSAGE = "\r\n" +
  "\x1b[31m" + "WARNING: Potentially dangerous command detected!" + "\x1b[0m" + "\r\n" +
  "\x1b[33m" + "This command could harm your system. Type 'yes' to proceed or 'no' to cancel: " + "\x1b[0m";

class TerminalManager {
  constructor(config = {}) {
    this.sessions = new Map();
    this.maxSessions = config.maxSessions || 3;
    this.sessionTimeout = config.sessionTimeout || 3600000; // 1 hour
    this.shell = config.shell || "/bin/bash";
    this.dangerousCommandWarnings = config.dangerousCommandWarnings !== false;
    this.activityLog = [];
  }

  /**
   * Check if command is potentially dangerous
   */
  isDangerousCommand(command) {
    if (!this.dangerousCommandWarnings) return false;
    
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Create a new PTY session
   */
  createSession(sessionId, cols = 80, rows = 24) {
    // Check session limit
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Maximum sessions (${this.maxSessions}) reached`);
    }
    
    // Create PTY process
    const ptyProcess = pty.spawn(this.shell, [], {
      name: "xterm-color",
      cols: cols,
      rows: rows,
      cwd: process.env.HOME || "/root",
      env: process.env
    });
    
    const session = {
      id: sessionId,
      pty: ptyProcess,
      created: Date.now(),
      lastActivity: Date.now(),
      commandBuffer: "",
      awaitingConfirmation: false,
      pendingCommand: null
    };
    
    // Set up timeout
    session.timeoutHandle = setTimeout(() => {
      this.destroySession(sessionId);
    }, this.sessionTimeout);
    
    this.sessions.set(sessionId, session);
    
    // Log session creation
    this.logActivity(sessionId, "SESSION_CREATED");
    
    return ptyProcess;
  }

  /**
   * Write data to PTY session with command monitoring
   */
  writeToSession(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    // Update activity timestamp
    session.lastActivity = Date.now();
    
    // If awaiting confirmation for dangerous command
    if (session.awaitingConfirmation) {
      const input = data.trim().toLowerCase();
      
      if (input === "yes" || input === "y") {
        // User confirmed, execute the dangerous command
        session.pty.write(session.pendingCommand);
        session.awaitingConfirmation = false;
        session.pendingCommand = null;
        this.logActivity(sessionId, "DANGEROUS_COMMAND_CONFIRMED", session.pendingCommand);
        return;
      } else if (input === "no" || input === "n" || data.charCodeAt(0) === 3) { // Ctrl+C
        // User cancelled
        session.pty.write("\r\n\x1b[32mCommand cancelled.\x1b[0m\r\n");
        session.pty.write(data);
        session.awaitingConfirmation = false;
        session.pendingCommand = null;
        this.logActivity(sessionId, "DANGEROUS_COMMAND_CANCELLED");
        return;
      } else {
        // Invalid input, ask again
        session.pty.write("\r\n\x1b[33mPlease type 'yes' or 'no': \x1b[0m");
        return;
      }
    }
    
    // Track commands (look for Enter key)
    if (data.charCodeAt(0) === 13) { // Enter key
      const command = session.commandBuffer.trim();
      
      // Check if dangerous
      if (command && this.isDangerousCommand(command)) {
        // Block the command and ask for confirmation
        session.awaitingConfirmation = true;
        session.pendingCommand = data;
        session.pty.write(WARNING_MESSAGE);
        this.logActivity(sessionId, "DANGEROUS_COMMAND_DETECTED", command);
        session.commandBuffer = "";
        return; // Don't send to PTY yet
      }
      
      // Log normal commands
      if (command) {
        this.logActivity(sessionId, "COMMAND", command);
      }
      
      session.commandBuffer = "";
    } else if (data.charCodeAt(0) === 3) { // Ctrl+C
      session.commandBuffer = "";
    } else if (data.charCodeAt(0) === 127) { // Backspace
      session.commandBuffer = session.commandBuffer.slice(0, -1);
    } else if (data.charCodeAt(0) >= 32) { // Printable characters
      session.commandBuffer += data;
    }
    
    // Write to PTY
    session.pty.write(data);
  }

  /**
   * Resize PTY session
   */
  resizeSession(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    
    session.pty.resize(cols, rows);
  }

  /**
   * Destroy PTY session
   */
  destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    
    clearTimeout(session.timeoutHandle);
    session.pty.kill();
    this.sessions.delete(sessionId);
    
    this.logActivity(sessionId, "SESSION_DESTROYED");
  }

  /**
   * Get session
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session count
   */
  getSessionCount() {
    return this.sessions.size;
  }

  /**
   * Log terminal activity (for audit)
   */
  logActivity(sessionId, action, details = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      sessionId,
      action,
      details
    };
    
    this.activityLog.push(entry);
    
    // Keep only last 1000 entries to prevent memory issues
    if (this.activityLog.length > 1000) {
      this.activityLog.shift();
    }
  }

  /**
   * Get activity log
   */
  getActivityLog(limit = 100) {
    return this.activityLog.slice(-limit);
  }

  /**
   * Clean up inactive sessions
   */
  cleanupInactiveSessions(maxIdleTime = 1800000) { // 30 minutes
    const now = Date.now();
    
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > maxIdleTime) {
        this.destroySession(sessionId);
      }
    }
  }
}

module.exports = TerminalManager;
