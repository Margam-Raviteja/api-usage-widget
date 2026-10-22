#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Building APIMenuBar with user-provided brand icons..."
mkdir -p "$DIR/APIMenuBar.app/Contents/MacOS"
mkdir -p "$DIR/APIMenuBar.app/Contents/Resources/icons"

# Copy icons into app bundle
cp "$DIR/../assets/icons/"*.png "$DIR/APIMenuBar.app/Contents/Resources/icons/"

swiftc -O "$DIR/main.swift" -o "$DIR/APIMenuBar.app/Contents/MacOS/APIMenuBar"
chmod +x "$DIR/APIMenuBar.app/Contents/MacOS/APIMenuBar"
echo "✅ Build complete: $DIR/APIMenuBar.app"
