#!/bin/bash

set -e

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Must run as root"
    exit 1
fi

# Check if demo-user exists
if ! id "demo-user" &>/dev/null; then
    echo "demo-user does not exist"
    exit 0
fi

# Remove user and home directory
userdel -r demo-user 2>/dev/null || userdel demo-user
echo "Removed demo-user account"

# Remove sudoers rule
rm -f /etc/sudoers.d/demo-user-shell
echo "Removed sudoers configuration"

echo "✓ Demo user removed"

