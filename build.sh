#!/bin/bash
# AGI-miniGame Build Script
# Pure TypeScript game project

set -e

echo "========================================="
echo "  AGI-miniGame Build System"
echo "========================================="
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""

# Build TypeScript
echo "📦 Building TypeScript..."
npm run build

echo ""
echo "========================================="
echo "  ✅ Build Complete!"
echo "========================================="
echo ""
echo "Output: dist/"
echo ""
