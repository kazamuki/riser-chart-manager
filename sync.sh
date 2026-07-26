#!/usr/bin/env sh
# The served app is a byte-for-byte copy of the canonical file. Never edit app/index.html.
set -e
cp Riser_Chart_Manager.html app/index.html
cmp Riser_Chart_Manager.html app/index.html && echo "synced: app/index.html is identical to Riser_Chart_Manager.html"
grep -o 'const APP_VERSION="[^"]*"' Riser_Chart_Manager.html
