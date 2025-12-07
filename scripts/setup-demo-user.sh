#!/bin/bash

set -e

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Must run as root"
    exit 1
fi

# Create demo-user if doesn't exist
if id "demo-user" &>/dev/null; then
    echo "demo-user already exists"
    exit 0
fi

# Create user
useradd -m -s /bin/bash demo-user
echo "Created demo-user account"

# Set a default password (should be changed)
echo "demo-user:demopass123" | chpasswd
echo "Set default password for demo-user"

# Add sudoers rule to allow root to spawn demo-user shell without password
echo "root ALL=(demo-user) NOPASSWD: /bin/bash" > /etc/sudoers.d/demo-user-shell
chmod 440 /etc/sudoers.d/demo-user-shell
echo "Configured sudoers for demo-user shell access"

# Ensure demo-user has NO sudo access
# (don't add demo-user to sudo group)

# Set restrictive permissions on home
chmod 750 /home/demo-user
echo "Set permissions on /home/demo-user"

echo "✓ Demo user setup complete"
echo "  Username: demo-user"
echo "  Shell access: sudo -u demo-user bash"
echo "  No sudo privileges"

