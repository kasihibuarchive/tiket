#!/bin/bash
cd /home/z/my-project
# Skip install and build - they already exist
# Just start the production server
NODE_ENV=production node .next/standalone/server.js -H 0.0.0.0 -p 3000
