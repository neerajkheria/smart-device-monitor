#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const specPath = path.join(__dirname, 'spec-server.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  try {
    const request = JSON.parse(line.trim());
    const { id, method, params } = request;

    if (method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'hardware-spec-server', version: '1.0.0' }
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else if (method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'get_device_specs',
              description: 'Fetches regulatory hardware ISO specs and threshold limits for IoT sensors',
              inputSchema: {
                type: 'object',
                properties: {
                  standard: {
                    type: 'string',
                    description: 'Standard key name e.g. ISO-IEC-IoT-Thermal or all'
                  }
                }
              }
            }
          ]
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else if (method === 'tools/call') {
      const data = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      const standardKey = params?.arguments?.standard;
      const resultPayload = standardKey && data.standards[standardKey]
        ? data.standards[standardKey]
        : data.standards;

      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(resultPayload, null, 2) }]
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch (e) {
    // Ignore non-json or incomplete frames
  }
});