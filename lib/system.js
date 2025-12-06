const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
const fs = require("fs").promises;

/**
 * System Resource Monitoring Module
 * 
 * SECURITY CONSIDERATIONS:
 * - Read-only operations
 * - No user input in commands
 * - Graceful error handling
 */

class SystemMonitor {
  /**
   * Get CPU usage
   */
  static async getCPUUsage() {
    try {
      const { stdout } = await execPromise("top -bn1 | grep \"Cpu(s)\" | awk '{print $2}' | cut -d'%' -f1");
      
      return {
        usage: parseFloat(stdout.trim()) || 0,
        unit: "%"
      };
    } catch (error) {
      return {
        usage: 0,
        error: error.message
      };
    }
  }

  /**
   * Get memory usage
   */
  static async getMemoryUsage() {
    try {
      const { stdout } = await execPromise("free -m");
      const lines = stdout.split("\n");
      const memLine = lines[1].split(/\s+/);
      
      const total = parseInt(memLine[1]);
      const used = parseInt(memLine[2]);
      const free = parseInt(memLine[3]);
      const percentage = ((used / total) * 100).toFixed(1);
      
      return {
        total: total,
        used: used,
        free: free,
        percentage: parseFloat(percentage),
        unit: "MB"
      };
    } catch (error) {
      return {
        error: error.message
      };
    }
  }

  /**
   * Get disk usage
   */
  static async getDiskUsage() {
    try {
      const { stdout } = await execPromise("df -h / | tail -1");
      const parts = stdout.split(/\s+/);
      
      return {
        filesystem: parts[0],
        size: parts[1],
        used: parts[2],
        available: parts[3],
        percentage: parseInt(parts[4]),
        mountpoint: parts[5]
      };
    } catch (error) {
      return {
        error: error.message
      };
    }
  }


  /**
   * Get Xandeum pages usage (MB)
   */
  static async getXandeumPages() {
    try {
      const { stdout } = await execPromise("du -sm /xandeum-pages 2>/dev/null || echo 0");
      const first = stdout.split("\n")[0];
      const sizeMB = parseInt(first.split(/\s+/)[0]) || 0;
      return {
        sizeMB,
        sizeGB: parseFloat((sizeMB / 1024).toFixed(2))
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Get system uptime
   */
  static async getUptime() {
    try {
      const { stdout } = await execPromise("uptime -p");
      
      return {
        uptime: stdout.trim()
      };
    } catch (error) {
      return {
        error: error.message
      };
    }
  }

  /**
   * Get load average
   */
  static async getLoadAverage() {
    try {
      const { stdout } = await execPromise("uptime");
      const match = stdout.match(/load average: ([\d.]+), ([\d.]+), ([\d.]+)/);
      
      if (match) {
        return {
          "1min": parseFloat(match[1]),
          "5min": parseFloat(match[2]),
          "15min": parseFloat(match[3])
        };
      }
      
      return {};
    } catch (error) {
      return {
        error: error.message
      };
    }
  }

  /**
   * Get all system stats
   */
  static async getAllStats() {
    const [cpu, memory, disk, uptime, load, xandeumPages] = await Promise.all([
      this.getCPUUsage(),
      this.getMemoryUsage(),
      this.getDiskUsage(),
      this.getUptime(),
      this.getLoadAverage(),
      this.getXandeumPages()
    ]);
    
    return {
      timestamp: new Date().toISOString(),
      cpu,
      memory,
      disk,
      uptime,
      load,
      xandeumPages
    };
  }

  /**
   * Get health status based on system resources
   */
  static async getHealthStatus() {
    const stats = await this.getAllStats();
    
    const issues = [];
    let score = 100;
    
    // Check CPU
    if (stats.cpu.usage > 90) {
      issues.push("High CPU usage");
      score -= 20;
    } else if (stats.cpu.usage > 70) {
      issues.push("Moderate CPU usage");
      score -= 10;
    }
    
    // Check memory
    if (stats.memory.percentage > 90) {
      issues.push("High memory usage");
      score -= 20;
    } else if (stats.memory.percentage > 75) {
      issues.push("Moderate memory usage");
      score -= 10;
    }
    
    // Check disk
    if (stats.disk.percentage > 90) {
      issues.push("Low disk space");
      score -= 30;
    } else if (stats.disk.percentage > 80) {
      issues.push("Disk space running low");
      score -= 15;
    }
    
    return {
      score: Math.max(0, score),
      status: score >= 80 ? "healthy" : score >= 50 ? "warning" : "critical",
      issues,
      stats
    };
  }

  /**
   * Check if system needs attention
   */
  static async needsAttention() {
    const health = await this.getHealthStatus();
    return health.status !== "healthy";
  }
}

module.exports = SystemMonitor;
