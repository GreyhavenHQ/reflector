#!/bin/sh
#
# Initialize Garage bucket and keys for integration tests.
# Run inside the Garage container after it's healthy.
#
# Outputs KEY_ID and KEY_SECRET to stdout (last two lines).
#
# Note: uses /bin/sh (not bash) since the Garage container is minimal.
#
set -eu

echo "Waiting for Garage to be ready..."
i=0
while [ "$i" -lt 30 ]; do
    if /garage stats >/dev/null 2>&1; then
        break
    fi
    sleep 1
    i=$((i + 1))
done

# Layout setup
NODE_ID=$(/garage node id -q | tr -d '[:space:]')
LAYOUT_STATUS=$(/garage layout show 2>&1 || true)
if echo "$LAYOUT_STATUS" | grep -q "No nodes"; then
    /garage layout assign "$NODE_ID" -c 1G -z dc1
    /garage layout apply --version 1
    echo "Layout applied."
else
    echo "Layout already configured."
fi

# Bucket
if ! /garage bucket info reflector-media >/dev/null 2>&1; then
    /garage bucket create reflector-media
    echo "Bucket 'reflector-media' created."
else
    echo "Bucket 'reflector-media' already exists."
fi

# Key
if /garage key info reflector-test >/dev/null 2>&1; then
    echo "Key 'reflector-test' already exists."
    KEY_OUTPUT=$(/garage key info reflector-test 2>&1)
else
    KEY_OUTPUT=$(/garage key create reflector-test 2>&1)
    echo "Key 'reflector-test' created."
fi

# Permissions
/garage bucket allow reflector-media --read --write --key reflector-test

# Extract key ID and secret from output using POSIX-compatible parsing
# garage key output format:
#   Key name: reflector-test
#   Key ID: GK...
#   Secret key: ...
KEY_ID=$(echo "$KEY_OUTPUT" | grep "Key ID" | sed 's/.*Key ID: *//')
KEY_SECRET=$(echo "$KEY_OUTPUT" | grep "Secret key" | sed 's/.*Secret key: *//')

echo "GARAGE_KEY_ID=${KEY_ID}"
echo "GARAGE_KEY_SECRET=${KEY_SECRET}"
