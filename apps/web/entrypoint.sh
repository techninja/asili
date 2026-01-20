#!/bin/sh

# Generate settings based on environment
if [ "$ENABLE_CALC_SERVER" = "true" ]; then
    echo "🧬 Enabling calculation server..."
    CALCULATION_SERVER="" ASILI_MODE="hybrid" node ../../settings-generator.js generate
else
    echo "📱 Local-only mode"
    ASILI_MODE="local" node ../../settings-generator.js generate
fi

# Start unified server with NODE_PATH for monorepo
echo "🌐 Starting unified server..."
export NODE_PATH="/app/node_modules:/app/apps/web/node_modules"
exec node simple-server.js