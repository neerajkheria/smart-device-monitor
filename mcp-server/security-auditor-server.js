#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Tool Definitions for Security & Architecture Auditor
const TOOLS = [
  {
    name: 'inspect_git_diff',
    description: 'Inspects staged, unstaged, or branch-level git diffs to detect uncommitted changes and evaluate code modifications.',
    inputSchema: {
      type: 'object',
      properties: {
        stagedOnly: {
          type: 'boolean',
          description: 'If true, inspects only staged changes (git diff --cached). Defaults to false (inspects all working changes).'
        },
        baseBranch: {
          type: 'string',
          description: 'Optional base branch comparison (e.g., "main" for git diff main...HEAD).'
        }
      }
    }
  },
  {
    name: 'scan_secrets_and_credentials',
    description: 'Scans specified files or all uncommitted diffs for hardcoded API keys, JWT tokens, AWS/GCP secrets, passwords, or telemetry tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        targetPath: {
          type: 'string',
          description: 'Relative file path or directory to scan. If omitted, scans all staged/modified source files.'
        }
      }
    }
  },
  {
    name: 'audit_architecture_compliance',
    description: 'Scans source files against .cursor/rules/architecture.mdc: verifies custom AppError usage, catches generic new Error(), checks layer separation, and detects unhandled setInterval/memory leaks.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Relative path of the source file to audit (e.g., "src/services/alertService.js")'
        }
      },
      required: ['filePath']
    }
  },
  {
    name: 'read_architecture_rule',
    description: 'Reads the active architecture constraints from .cursor/rules/architecture.mdc to calibrate compliance checks.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

function resolveSafePath(relPath = '') {
  const full = path.resolve(WORKSPACE_ROOT, relPath);
  if (!full.startsWith(WORKSPACE_ROOT)) {
    throw new Error('Access denied: Path is outside workspace.');
  }
  return full;
}

// Secret detection signatures
const SECRET_PATTERNS = [
  { name: 'Generic API Key / Secret', regex: /(?:api_key|apiKey|secret|token|password|passwd)\s*[:=]\s*['"][a-zA-Z0-9_\-]{8,}['"]/i },
  { name: 'Bearer / Auth Header Token', regex: /Bearer\s+[a-zA-Z0-9_\-\.]{15,}/i },
  { name: 'Private Key Block', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: 'AWS Access Key / Secret', regex: /(?:AKIA[0-9A-Z]{16}|aws_secret_access_key)/ },
  { name: 'Hardcoded Database URL with Password', regex: /[a-zA-Z]+:\/\/[^:]+:[^@]+@[^/]+/ }
];

function handleToolCall(name, args) {
  switch (name) {
    case 'inspect_git_diff': {
      const { stagedOnly, baseBranch } = args || {};
      let cmd = 'git diff';
      if (baseBranch) {
        cmd = `git diff ${baseBranch}...HEAD`;
      } else if (stagedOnly) {
        cmd = 'git diff --cached';
      }

      try {
        const diffOutput = execSync(cmd, {
          cwd: WORKSPACE_ROOT,
          encoding: 'utf8',
          timeout: 20000
        });
        return {
          commandExecuted: cmd,
          hasDiff: diffOutput.trim().length > 0,
          diff: diffOutput || 'No changes detected.'
        };
      } catch (err) {
        return {
          error: `Failed to execute git diff: ${err.message}`
        };
      }
    }

    case 'scan_secrets_and_credentials': {
      const targetRel = args?.targetPath || 'src';
      const targetFull = resolveSafePath(targetRel);
      const findings = [];

      function scanFile(filePath) {
        const text = fs.readFileSync(filePath, 'utf8');
        const lines = text.split('\n');
        lines.forEach((line, index) => {
          SECRET_PATTERNS.forEach(pattern => {
            if (pattern.regex.test(line)) {
              findings.push({
                file: path.relative(WORKSPACE_ROOT, filePath),
                line: index + 1,
                rule: pattern.name,
                snippet: line.trim()
              });
            }
          });
        });
      }

      function scanDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (['node_modules', '.git', 'coverage'].includes(entry.name)) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) scanDir(full);
          else if (entry.isFile() && /\.(js|json|env|md)$/.test(entry.name)) scanFile(full);
        }
      }

      if (fs.statSync(targetFull).isDirectory()) scanDir(targetFull);
      else scanFile(targetFull);

      return {
        scannedPath: targetRel,
        totalViolations: findings.length,
        findings
      };
    }

    case 'audit_architecture_compliance': {
      const fullPath = resolveSafePath(args.filePath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${args.filePath}`);
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      const violations = [];

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;

        // Check for generic untyped Error instantiation
        if (/\bnew\s+Error\s*\(/.test(line)) {
          violations.push({
            severity: 'Blocker',
            fileLine: `${args.filePath}:${lineNum}`,
            issue: 'Generic `new Error()` used. Violates error handling standard.',
            remediation: 'Import and throw custom AppError subclasses from src/common/errors.js (e.g. NotFoundError, ValidationError).'
          });
        }

        // Check for uncollected timer loops
        if (/\bsetInterval\s*\(/.test(line) && !/clearInterval/.test(content)) {
          violations.push({
            severity: 'Major',
            fileLine: `${args.filePath}:${lineNum}`,
            issue: '`setInterval` used without explicit cancellation or teardown reference.',
            remediation: 'Store timer reference and expose a cleanup/stop method to prevent memory leaks during tests.'
          });
        }

        // Check for raw console.log instead of winston logger
        if (/console\.(log|error|warn|info)\s*\(/.test(line)) {
          violations.push({
            severity: 'Major',
            fileLine: `${args.filePath}:${lineNum}`,
            issue: 'Raw `console` statement used instead of centralized winston logger.',
            remediation: 'Import and use `logger` from src/common/logger.js.'
          });
        }

        // Check for direct data modification in controllers (Layer Separation violation)
        if (args.filePath.includes('/controllers/') && /\b(new Map|inMemory|\.set\(|\.delete\()/.test(line)) {
          violations.push({
            severity: 'Blocker',
            fileLine: `${args.filePath}:${lineNum}`,
            issue: 'In-memory state manipulation detected inside controller.',
            remediation: 'Controllers must only parse HTTP and delegate to src/services/.'
          });
        }
      });

      return {
        fileAudited: args.filePath,
        totalIssues: violations.length,
        violations
      };
    }

    case 'read_architecture_rule': {
      const rulePath = path.join(WORKSPACE_ROOT, '.cursor', 'rules', 'architecture.mdc');
      if (fs.existsSync(rulePath)) {
        return { content: fs.readFileSync(rulePath, 'utf8') };
      }
      return { warning: '.cursor/rules/architecture.mdc not found' };
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
          serverInfo: { name: 'security-auditor-tools', version: '1.0.0' }
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
  } catch (e) {
    // Suppress unparseable frames
  }
});