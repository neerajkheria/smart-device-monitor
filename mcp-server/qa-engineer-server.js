#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const TESTS_ROOT = path.join(WORKSPACE_ROOT, 'tests');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Tool Definitions for QA & Test Engineer
const TOOLS = [
  {
    name: 'read_test_or_source',
    description: 'Reads test files or application source files to analyze existing coverage, fixtures, or contracts.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Relative path from workspace root (e.g., "tests/unit/deviceService.test.js" or "src/services/deviceService.js")'
        }
      },
      required: ['filePath']
    }
  },
  {
    name: 'write_test_file',
    description: 'Writes or updates a test file. Restricted STRICTLY to the tests/ directory to safeguard application code.',
    inputSchema: {
      type: 'object',
      properties: {
        testFilePath: {
          type: 'string',
          description: 'Target path within tests/ (e.g., "tests/unit/alertService.boundary.test.js")'
        },
        content: {
          type: 'string',
          description: 'Complete JavaScript test file content using Jest syntax'
        }
      },
      required: ['testFilePath', 'content']
    }
  },
  {
    name: 'run_jest_tests',
    description: 'Executes Jest test suites via terminal, returning test pass/fail metrics, assertions count, and stack traces.',
    inputSchema: {
      type: 'object',
      properties: {
        testPathPattern: {
          type: 'string',
          description: 'Optional path or pattern to run specific tests (e.g., "tests/unit/alertService.test.js"). Runs all tests if omitted.'
        },
        coverage: {
          type: 'boolean',
          description: 'If true, collects and appends code coverage analysis metrics.'
        }
      }
    }
  },
  {
    name: 'audit_test_coverage',
    description: 'Reads test files and extracts covered test names, describe blocks, and identifies potential boundary/negative gaps.',
    inputSchema: {
      type: 'object',
      properties: {
        testFilePath: {
          type: 'string',
          description: 'Relative path of the test suite to inspect (e.g., "tests/unit/deviceService.test.js")'
        }
      },
      required: ['testFilePath']
    }
  }
];

// Security helper: verify file is inside workspace
function resolveSafePath(relPath) {
  const full = path.resolve(WORKSPACE_ROOT, relPath);
  if (!full.startsWith(WORKSPACE_ROOT)) {
    throw new Error('Access denied: Path is outside workspace.');
  }
  return full;
}

// Security helper: enforce that writes ONLY occur in tests/
function resolveSafeTestWritePath(relPath) {
  const full = path.resolve(WORKSPACE_ROOT, relPath);
  if (!full.startsWith(TESTS_ROOT)) {
    throw new Error(`Write permission rejected: QA Agent can only modify files inside 'tests/'. Attempted path: ${relPath}`);
  }
  return full;
}

// Tool Handlers
function handleToolCall(name, args) {
  switch (name) {
    case 'read_test_or_source': {
      const fullPath = resolveSafePath(args.filePath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${args.filePath}`);
      }
      return {
        filePath: args.filePath,
        content: fs.readFileSync(fullPath, 'utf8')
      };
    }

    case 'write_test_file': {
      const fullPath = resolveSafeTestWritePath(args.testFilePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, args.content, 'utf8');
      return {
        success: true,
        testFilePath: args.testFilePath,
        bytesWritten: Buffer.byteLength(args.content, 'utf8')
      };
    }

    case 'run_jest_tests': {
      const { testPathPattern, coverage } = args;
      let cmd = 'npx jest --runInBand --colors=false';
      if (testPathPattern) {
        cmd += ` "${testPathPattern}"`;
      }
      if (coverage) {
        cmd += ' --coverage';
      }

      try {
        const stdout = execSync(cmd, {
          cwd: WORKSPACE_ROOT,
          encoding: 'utf8',
          timeout: 45000,
          env: { ...process.env, NODE_ENV: 'test', CI: 'true' }
        });
        return {
          status: 'PASSED',
          rawOutput: stdout.trim()
        };
      } catch (err) {
        return {
          status: 'FAILED',
          exitCode: err.status,
          rawOutput: (err.stdout || '') + '\n' + (err.stderr || err.message)
        };
      }
    }

    case 'audit_test_coverage': {
      const fullPath = resolveSafePath(args.testFilePath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Test file not found: ${args.testFilePath}`);
      }
      const content = fs.readFileSync(fullPath, 'utf8');
      const testRegex = /(?:test|it)\s*\(\s*['"`](.*?)['"`]/g;
      const describeRegex = /describe\s*\(\s*['"`](.*?)['"`]/g;

      const suites = [];
      const testCases = [];
      let match;

      while ((match = describeRegex.exec(content)) !== null) {
        suites.push(match[1]);
      }
      while ((match = testRegex.exec(content)) !== null) {
        testCases.push(match[1]);
      }

      return {
        testFilePath: args.testFilePath,
        describeBlocks: suites,
        testCasesFound: testCases,
        totalTests: testCases.length
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// JSON-RPC stdio Handler
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
          serverInfo: { name: 'qa-engineer-tools', version: '1.0.0' }
        }
      }) + '\n');
    } else if (method === 'tools/list') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      }) + '\n');
    } else if (method === 'tools/call') {
      const result = handleToolCall(params?.name, params?.arguments);
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        }
      }) + '\n');
    }
  } catch (e) {
    // Non-JSON or broken frames are ignored
  }
});