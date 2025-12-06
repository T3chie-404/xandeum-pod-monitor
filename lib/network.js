const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

// Wrapper with timeout
function execWithTimeout(command, timeoutMs = 5000) {
  return Promise.race([
    execPromise(command),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Command timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}
const axios = require("axios");

/**
 * Network Diagnostics Module
 * 
 * SECURITY CONSIDERATIONS:
 * - Only tests predefined ports
 * - Uses safe external IP services
 * - Timeouts on all external requests
 * - No user-controlled network destinations
 */

const LOCALHOST_PORTS = [80, 3000, 4000, 5000, 6000, 7000];
const PUBLIC_UDP_PORTS = [5000, 9001];
const PUBLIC_TCP_PORTS = [80, 3000, 4000, 5000, 6000, 7000];

class NetworkManager {
  /**
   * Get external IP address
   */
  static async getExternalIP() {
    try {
      const response = await axios.get("https://ipinfo.io/ip", {
        timeout: 2000
      });
      
      return {
        success: true,
        ip: response.data.trim()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if a localhost port is listening
   */
  static async checkLocalhostPort(port) {
    try {
      const { stdout } = await execPromise(`ss -tlnp 2>/dev/null | grep -E "(:${port} )"`);
      
      return {
        port,
        listening: stdout.trim().length > 0,
        details: stdout.trim()
      };
    } catch (error) {
      return {
        port,
        listening: false
      };
    }
  }

  /**
   * Check if a public port is accessible
   */
  static async checkPublicPort(ip, port, protocol = "tcp") {
    try {
      let command;
      if (protocol === "udp") {
        command = `timeout 2 nc -zu ${ip} ${port} 2>/dev/null`;
      } else {
        command = `timeout 2 nc -zv ${ip} ${port} 2>&1 | grep -q "succeeded\\|open"`;
      }
      
      await execWithTimeout(command, 2000);
      
      return {
        port,
        protocol,
        accessible: true
      };
    } catch (error) {
      return {
        port,
        protocol,
        accessible: false
      };
    }
  }

  /**
   * Run full network diagnostics
   */
  static async runDiagnostics() {
    // Overall timeout wrapper
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Network diagnostics timeout")), 10000)
    );
    
    const diagnosticsPromise = (async () => {
    const results = {
      timestamp: new Date().toISOString(),
      localhost: {},
      public: {
        ip: null,
        udp: [],
        tcp: []
      }
    };
    
    // Check localhost ports
    for (const port of LOCALHOST_PORTS) {
      results.localhost[port] = await this.checkLocalhostPort(port);
    }
    
    // Get external IP
    const ipResult = await this.getExternalIP();
    if (ipResult.success) {
      results.public.ip = ipResult.ip;
      
      // Check public UDP ports
      for (const port of PUBLIC_UDP_PORTS) {
        const check = await this.checkPublicPort(ipResult.ip, port, "udp");
        results.public.udp.push(check);
      }
      
      // Check public TCP ports
      for (const port of PUBLIC_TCP_PORTS) {
        const check = await this.checkPublicPort(ipResult.ip, port, "tcp");
        results.public.tcp.push(check);
      }
    } else {
      results.public.error = ipResult.error;
    }
    
    return results;

      })();
      
      return await Promise.race([diagnosticsPromise, timeoutPromise]);
      }

  /**
   * Get network summary
   */
  static async getSummary() {
    const diagnostics = await this.runDiagnostics();
    
    const summary = {
      localhostHealthy: Object.values(diagnostics.localhost).every(p => p.listening),
      externalIPDetected: !!diagnostics.public.ip,
      publicAccessConfigured: diagnostics.public.udp.some(p => p.accessible) || 
                              diagnostics.public.tcp.some(p => p.accessible),
      details: diagnostics
    };
    
    return summary;
  }

  /**
   * Check if netcat is installed
   */
  static async checkNetcatInstalled() {
    try {
      await execPromise("which nc");
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get firewall status
   */
  static async getFirewallStatus() {
    try {
      const { stdout } = await execPromise("ufw status 2>/dev/null || iptables -L -n 2>/dev/null | head -20");
      
      return {
        success: true,
        output: stdout
      };
    } catch (error) {
      return {
        success: false,
        error: "Unable to check firewall status"
      };
    }
  }
}

module.exports = NetworkManager;
