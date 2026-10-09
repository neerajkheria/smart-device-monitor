#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Bounded workspace root (prevent directory traversal outside the project)
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Tool Definitions for Repo & Dependency Analyst
const TOOLS = [
  {
    name: 'list_directory_tree',
    description: 'Recursively lists directory contents and structure up to a specified depth (read-only).',
    inputSchema: {
      type: 'object',
      properties: {
        relativePath: {
          type: 'string',
          description: 'Relative path from workspace root (e.g., "src" or "src/services"). Defaults to "."'
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum traversal depth (default: 3)'
        }
      }
    }
  },
  {
    name: 'read_source_file',
    description: 'Safely reads the complete UTF-8 content of a file within the project boundary.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path of the file relative to the project root (e.g., "src/services/deviceService.js")'
        }
      },
      required: ['filePath']
    }
  },
  {
    name: 'analyze_module_dependencies',
    description: 'Parses require/import statements in JavaScript files and maps inbound callers and outbound downstream dependencies.',
    inputSchema: {
      type: 'object',
      properties: {
        targetFile: {
          type: 'string',
          description: 'Target relative file path to analyze (e.g., "src/services/alertService.js")'
        }
      },
      required: ['targetFile']
    }
  },
  {
    name: 'search_codebase_symbols',
    description: 'Performs regex/keyword symbol search across all source files to find references, usages, and callers.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Symbol name, method name, or string pattern to search (e.g., "evaluateMetric")'
        },
        subDirectory: {
          type: 'string',
          description: 'Optional subfolder to restrict search (e.g., "src")'
        }
      },
      required: ['query']
    }
  }
];

// Helper: Path validation
function resolveSafePath(relPath = '') {
  const targetPath = path.resolve(WORKSPACE_ROOT, relPath);
  if (!targetPath.startsWith(WORKSPACE_ROOT)) {
    throw new Error('Access denied: Path is outside workspace boundary.');
  }
  return targetPath;
}

// Helper: Directory traversal
function getDirectoryTree(dirPath, currentDepth = 0, maxDepth = 3) {
  if (currentDepth > maxDepth) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const tree = [];

  for (const entry of entries) {
    if (['node_modules', '.git', 'coverage'].includes(entry.name)) continue;

    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(WORKSPACE_ROOT, fullPath);

    if (entry.isDirectory()) {
      tree.push({
        path: relPath,
        type: 'directory',
        children: getDirectoryTree(fullPath, currentDepth + 1, maxDepth)
      });
    } else {
      tree.push({
        path: relPath,
        type: 'file',
        sizeBytes: fs.statSync(fullPath).size
      });
    }
  }
  return tree;
}

// Helper: Regex scanner for CommonJS requires
function parseDependencies(fullFilePath) {
  const content = fs.readFileSync(fullFilePath, 'utf8');
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
  const dependencies = [];
  let match;

  while ((match = requireRegex.exec(content)) !== null) {
    dependencies.push(match[1]);
  }
  return dependencies;
}

// Helper: Find inbound callers across the project
function findInboundCallers(targetRelPath) {
  const baseName = path.basename(targetRelPath, path.extname(targetRelPath));
  const callers = [];

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', '.git', 'coverage'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.json'))) {
        const text = fs.readFileSync(full, 'utf8');
        if (text.includes(baseName)) {
          const lines = text.split('\n');
          lines.forEach((line, idx) => {
            if (line.includes(baseName)) {
              callers.push({
                file: path.relative(WORKSPACE_ROOT, full),
                line: idx + 1,
                snippet: line.trim()
              });
            }
          });
        }
      }
    }
  }

  scanDir(path.join(WORKSPACE_ROOT, 'src'));
  scanDir(path.join(WORKSPACE_ROOT, 'tests'));
  return callers;
}

// Tool Execution Dispatcher
function handleToolCall(name, args) {
  switch (name) {
    case 'list_directory_tree': {
      const fullDir = resolveSafePath(args?.relativePath || '.');
      const maxDepth = args?.maxDepth !== undefined ? args.maxDepth : 3;
      return getDirectoryTree(fullDir, 0, maxDepth);
    }

    case 'read_source_file': {
      const fullPath = resolveSafePath(args.filePath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${args.filePath}`);
      }
      return {
        filePath: args.filePath,
        content: fs.readFileSync(fullPath, 'utf8')
      };
    }

    case 'analyze_module_dependencies': {
      const fullPath = resolveSafePath(args.targetFile);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Target file not found: ${args.targetFile}`);
      }

      const outbound = parseDependencies(fullPath);
      const inbound = findInboundCallers(args.targetFile);

      return {
        targetFile: args.targetFile,
        outboundDependencies: outbound,
        inboundCallers: inbound
      };
    }

    case 'search_codebase_symbols': {
      const { query, subDirectory = 'src' } = args;
      const targetDir = resolveSafePath(subDirectory);
      const matches = [];

      function searchDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (['node_modules', '.git', 'coverage'].includes(entry.name)) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            searchDir(full);
          } else if (entry.isFile() && entry.name.endsWith('.js')) {
            const lines = fs.readFileSync(full, 'utf8').split('\n');
            lines.forEach((line, index) => {
              if (line.includes(query)) {
                matches.push({
                  file: path.relative(WORKSPACE_ROOT, full),
                  line: index + 1,
                  text: line.trim()
                });
              }
            });
          }
        }
      }

      searchDir(targetDir);
      return { query, totalMatches: matches.length, matches };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// JSON-RPC stdio Server Protocol Handler
rl.on('line', (line) => {
  try {
    const request = JSON.parse(line.trim());
    const { id, method, params } = request;

    if (method === 'initialize') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'repo-analyst-tools', version: '1.0.0' }
        }
      }) + '\n');
    } else if (method === 'tools/list') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      }) + '\n');
    } else if (method === 'tools/call') {
      const output = handleToolCall(params?.name, params?.arguments);
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }]
        }
      }) + '\n');
    }
  } catch (err) {
    // Non-JSON or incomplete frames are suppressed
  }
});