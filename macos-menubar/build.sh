#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Building APIMenuBar..."
mkdir -p "$DIR/APIMenuBar.app/Contents/MacOS"
swiftc -O "$DIR/main.swift" -o "$DIR/APIMenuBar.app/Contents/MacOS/APIMenuBar"
chmod +x "$DIR/APIMenuBar.app/Contents/MacOS/APIMenuBar"
echo "✅ Build complete: $DIR/APIMenuBar.app"
