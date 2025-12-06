# Xandeum Pod Monitor

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

Interactive web-based monitoring and management dashboard for Xandeum pNodes. Monitor services, view logs, test pRPC API, diagnose network issues, and access an embedded terminal - all from a single, secure web interface.

## Features

### 🎯 Dashboard Overview
- Real-time system stats (CPU, RAM, disk usage, uptime)
- Service status cards with health indicators
- Network connectivity status
- Overall health score (0-100%)
- Auto-refresh every 10 seconds

### 🔧 Service Management
- View status for all services (xandminer, xandminerd, pod)
- Start/Stop/Restart individual services
- Restart all services with one click
- View service logs and outputs
- Confirmation dialogs for all destructive actions

### 📜 Log Viewer
- View logs for any service (last 100 lines)
- Filter logs with search terms
- Special "Find Pubkey" feature (restarts pod and extracts pubkey)
- Export logs functionality

### 🔌 pRPC API Testing
- Built-in API call buttons (get-version, get-stats, get-pods)
- Custom RPC method input for testing
- Formatted JSON response display
- Error handling and timeout management

### 🌐 Network Diagnostics
- Localhost service checks (ports 3000, 4000, 6000)
- Public access tests (UDP 5000, 9001, TCP 6000)
- External IP detection
- Firewall status check
- Visual port status indicators

### 💻 Embedded Terminal
- Full interactive terminal using xterm.js
- Quick command buttons for common tasks
- Dangerous command detection with confirmation prompts
- Session management with timeouts
- Terminal activity logging for audit

### 🛡️ Security Features
- **Localhost-only by default** (127.0.0.1:7000)
- **Command whitelist** - Only predefined services can be controlled
- **Dangerous command warnings** - Detects and blocks risky commands
- **Rate limiting** - Prevents API abuse (60 requests/minute)
- **Input validation** - All user inputs are sanitized
- **Session limits** - Max 3 terminal sessions
- **Activity logging** - All terminal commands are logged
- **Confirmation dialogs** - For all destructive actions

## 🚀 Quick Start: Turn-Key HTTPS Setup

**NEW!** The easiest way to enable secure HTTPS access for non-technical users:

```bash
cd /root/xandeum-pod-monitor
sudo bash setup-https.sh
```

This interactive wizard will:
- ✅ Install and configure nginx automatically
- ✅ Generate SSL certificates (self-signed or Let's Encrypt)
- ✅ Set up password authentication
- ✅ Configure secure reverse proxy
- ✅ Test and verify the setup

**No manual configuration needed!** Just answer a few simple questions:
1. Do you want HTTPS? (y/n)
2. Choose username (default: admin)
3. Create password
4. Self-signed or Let's Encrypt certificate?

Then access your monitor at: `https://YOUR-IP:8443`

### Options

```bash
# Enable HTTPS (interactive)
sudo bash setup-https.sh

# Remove HTTPS setup
sudo bash setup-https.sh --remove

# Non-interactive mode (for automation)
SKIP_HTTPS_PROMPT=1 HTTPS_USERNAME=admin HTTPS_PASSWORD=yourpass sudo bash setup-https.sh
```

## Installation

### Quick Install

```bash
wget https://raw.githubusercontent.com/T3chie-404/xandeum-pod-monitor/master/install.sh
sudo bash install.sh
```

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/T3chie-404/xandeum-pod-monitor.git
cd xandeum-pod-monitor

# Install dependencies
npm install

# Start the server
sudo node server.js
```

### Install as System Service

```bash
# Copy service file
sudo cp xandeum-pod-monitor.service /etc/systemd/system/

# Enable and start
sudo systemctl enable xandeum-pod-monitor
sudo systemctl start xandeum-pod-monitor

# Check status
sudo systemctl status xandeum-pod-monitor
```

## Usage

### Local Access (Default)

The monitor runs on `http://127.0.0.1:7000` by default (localhost only).

**Access from your local machine:**
```bash
# Open browser on server
http://127.0.0.1:7000
```

**Access remotely via SSH tunnel:**
```bash
# From your local machine
ssh -L 7000:localhost:7000 user@your-server

# Then open in browser
http://localhost:7000
```

### Public Access (Optional)

For public access with HTTPS and authentication, see [nginx-config-example/](nginx-config-example/).

## Configuration

Edit `config.json` to customize:

```json
{
  "server": {
    "host": "127.0.0.1",  // Change to "0.0.0.0" for public access
    "port": 7000
  },
  "security": {
    "enableServiceControl": true,  // Disable to make read-only
    "enableTerminal": true,        // Disable to hide terminal
    "dangerousCommandWarnings": true,
    "confirmDestructiveActions": true,
    "rateLimit": {
      "enabled": true,
      "maxRequestsPerMinute": 60
    }
  }
}
```

## Security Considerations

### 🔒 Default Security Posture

- **Localhost-only**: Binds to 127.0.0.1 by default
- **No public exposure**: Requires SSH tunnel for remote access
- **No authentication needed**: Safe because it's localhost-only
- **Minimal attack surface**: Only runs what's necessary

### ⚠️ If Exposing Publicly

If you change `host` to `0.0.0.0` for public access:

1. **Use nginx reverse proxy** with basic auth (see nginx-config-example/)
2. **Use HTTPS** with valid certificate (Let's Encrypt recommended)
3. **Enable firewall** and only allow specific IPs if possible
4. **Consider disabling terminal** (`enableTerminal: false`)
5. **Monitor access logs** regularly

### 🛡️ Built-in Protections

- **Command whitelist**: Only xandminer, xandminerd, pod services
- **Action whitelist**: Only start, stop, restart, status
- **Input sanitization**: All user inputs are validated
- **Dangerous command detection**: Warns before executing risky commands
- **Rate limiting**: Prevents brute force and DoS
- **Session limits**: Prevents resource exhaustion
- **Activity logging**: Audit trail for all terminal commands

## Attack Vectors Mitigated

| Attack Vector | Mitigation |
|--------------|------------|
| Command injection | Parameterized commands, input validation |
| Fork bomb | Terminal session limits, command detection |
| Disk wiping | Dangerous command warnings, confirmation |
| Resource exhaustion | Rate limiting, session timeouts, line limits |
| Unauthorized access | Localhost-only, optional nginx auth |
| Service manipulation | Whitelist-based validation |
| Log flooding | Max line limits (1000 lines) |
| Memory leaks | Periodic cleanup, activity log rotation |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dashboard` | GET | Full dashboard data |
| `/api/services` | GET | All service statuses |
| `/api/services/:name` | GET | Single service status |
| `/api/services/:name/:action` | POST | Control service |
| `/api/services/restart-all` | POST | Restart all services |
| `/api/logs/:service` | GET | Get service logs |
| `/api/find-pubkey` | POST | Restart pod and find pubkey |
| `/api/prpc/:method` | POST | Call pRPC method |
| `/api/network` | GET | Network diagnostics |
| `/api/system` | GET | System stats |
| `/api/health` | GET | Health check |
| `/terminal` | WebSocket | Terminal connection |

## System Requirements

- **OS**: Linux (Ubuntu 20.04+ recommended)
- **Node.js**: v16.0.0 or higher
- **RAM**: 50MB (minimal footprint)
- **Disk**: 50MB
- **Network**: Localhost (no external dependencies)

## Troubleshooting

### Server won't start

```bash
# Check if port 7000 is in use
sudo netstat -tulpn | grep 7000

# Check logs
sudo journalctl -u xandeum-pod-monitor -n 50
```

### Terminal not connecting

- Check WebSocket connection in browser console
- Ensure `enableTerminal: true` in config.json
- Check if node-pty is installed: `npm list node-pty`

### Services not responding

- Verify services are running: `systemctl status pod xandminer xandminerd`
- Check permissions: Monitor must run as root for systemctl access

### Can't access pRPC API

- Ensure pod service is running
- Check pRPC is listening: `netstat -tulpn | grep 6000`
- Verify port configuration in config.json

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Test API endpoints
curl http://127.0.0.1:7000/api/health
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details

## Author

**T3chie-404**
- GitHub: [@T3chie-404](https://github.com/T3chie-404)

## Acknowledgments

- [Xandeum Network](https://xandeum.network) - For the pNode software
- [xterm.js](https://xtermjs.org/) - For the excellent terminal emulator
- [node-pty](https://github.com/microsoft/node-pty) - For PTY support

## Support

For issues, questions, or contributions:
- Open an issue on [GitHub](https://github.com/T3chie-404/xandeum-pod-monitor/issues)
- Read the [Xandeum Documentation](https://docs.xandeum.network)
