// scripts/convert-replies.js
'use strict';

const fs = require('fs-extra');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

function parseCode(src) {
  return parser.parse(src, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator']
  });
}

/**
 * Ensure the AST has an import for replyFromResult from ../../utils/reply.
 * If an import declaration for '../../utils/reply' exists, add the specifier if missing.
 * Otherwise insert a new import at the top.
 */
function ensureReplyFromResultImport(ast) {
  let foundReplyImport = false;
  let foundReplyFromResultSpecifier = false;

  traverse(ast, {
    ImportDeclaration(path) {
      const src = path.node.source && path.node.source.value;
      if (!src) return;

      // Match both relative and package-like imports that end with utils/reply
      if (src === '../../utils/reply' || src.endsWith('/utils/reply')) {
        foundReplyImport = true;
        const specNames = path.node.specifiers.map(s => (s.local && s.local.name) || null).filter(Boolean);
        if (specNames.includes('replyFromResult')) {
          foundReplyFromResultSpecifier = true;
        } else {
          // Add the named specifier if not present
          path.node.specifiers.push(t.importSpecifier(t.identifier('replyFromResult'), t.identifier('replyFromResult')));
          foundReplyFromResultSpecifier = true;
        }
        path.stop();
      }
    }
  });

  if (foundReplyFromResultSpecifier) return;

  // If there is any top-level binding named replyFromResult, do not add import
  let hasTopLevelBinding = false;
  traverse(ast, {
    Program(path) {
      if (path.scope && path.scope.bindings && path.scope.bindings.replyFromResult) {
        hasTopLevelBinding = true;
        path.stop();
      }
    }
  });
  if (hasTopLevelBinding) return;

  // Insert a new import at the top
  const imp = t.importDeclaration(
    [t.importSpecifier(t.identifier('replyFromResult'), t.identifier('replyFromResult'))],
    t.stringLiteral('../../utils/reply')
  );
  ast.program.body.unshift(imp);
}

/**
 * Helper: try to extract a string value from a node if it's a literal.
 * Otherwise return null.
 */
function literalStringValue(node) {
  if (!node) return null;
  if (t.isStringLiteral(node)) return node.value;
  if (t.isTemplateLiteral(node) && node.quasis && node.quasis.length === 1 && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

/**
 * Transform replySuccess/replyError/replyInfo calls into replyFromResult(message, resultObj, optionsObj)
 * - Accepts message argument as any expression (not only Identifier)
 * - Accepts text argument as string/template/binary/call/conditional (best-effort)
 * - If the call is too complex or doesn't match expected patterns, it is reported for manual attention
 */
function transformCalls(ast, report) {
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;

      // Only handle simple identifier callee names
      if (!t.isIdentifier(callee)) return;
      const name = callee.name;
      if (!['replySuccess', 'replyError', 'replyInfo'].includes(name)) return;

      const args = path.node.arguments || [];
      // Need at least message and text
      if (args.length < 2) {
        const loc = path.node.loc ? `${path.node.loc.start.line}:${path.node.loc.start.column}` : 'unknown';
        report.push({ file: path.hub.file.opts.filename, reason: `Too few args for ${name} at ${loc}` });
        return;
      }

      const messageArg = args[0]; // allow any expression
      const textArg = args[1];
      const titleArg = args[2] || t.stringLiteral(name === 'replySuccess' ? 'Success' : (name === 'replyError' ? 'Error' : 'Info'));

      // Accept a broad set of node types for textArg
      const allowedTextTypes = [
        'StringLiteral',
        'TemplateLiteral',
        'BinaryExpression',
        'CallExpression',
        'ConditionalExpression',
        'Identifier',
        'MemberExpression',
        'NumericLiteral',
        'ObjectExpression',
        'ArrayExpression'
      ];
      if (!allowedTextTypes.includes(textArg.type)) {
        const loc = path.node.loc ? `${path.node.loc.start.line}:${path.node.loc.start.column}` : 'unknown';
        report.push({ file: path.hub.file.opts.filename, reason: `Unsupported text arg type for ${name} at ${loc}` });
        return;
      }

      // Build result object
      let resultObj;
      if (name === 'replySuccess') {
        // success: true, data: { message: <textArg> }
        resultObj = t.objectExpression([
          t.objectProperty(t.identifier('success'), t.booleanLiteral(true)),
          t.objectProperty(t.identifier('data'), t.objectExpression([
            t.objectProperty(t.identifier('message'), textArg)
          ]))
        ]);
      } else {
        // error/info -> success: false, error: <textArg>
        resultObj = t.objectExpression([
          t.objectProperty(t.identifier('success'), t.booleanLiteral(false)),
          t.objectProperty(t.identifier('error'), textArg)
        ]);
      }

      // Build options object
      const optionsProps = [];

      // label: try to use titleArg if it's a literal, otherwise fallback to a generic label
      const titleLiteral = literalStringValue(titleArg);
      const labelValue = titleLiteral || (name === 'replySuccess' ? 'Result' : 'Result');
      optionsProps.push(t.objectProperty(t.identifier('label'), t.stringLiteral(labelValue)));

      if (name === 'replySuccess') {
        // successTitle: use titleArg expression (literal or expression)
        optionsProps.push(t.objectProperty(t.identifier('successTitle'), titleArg));
      } else if (name === 'replyError') {
        optionsProps.push(t.objectProperty(t.identifier('errorTitle'), titleArg));
      } else {
        optionsProps.push(t.objectProperty(t.identifier('infoTitle'), titleArg));
      }

      const optionsObj = t.objectExpression(optionsProps);

      // Build new call: replyFromResult(messageArg, resultObj, optionsObj)
      const newCall = t.callExpression(t.identifier('replyFromResult'), [messageArg, resultObj, optionsObj]);

      path.replaceWith(newCall);
    }
  });
}

function processFile(filePath, report) {
  const src = fs.readFileSync(filePath, 'utf8');
  const ast = parseCode(src);
  ensureReplyFromResultImport(ast);
  transformCalls(ast, report);
  const out = generate(ast, { retainLines: true }).code;
  // Backup original
  fs.writeFileSync(filePath + '.bak', src, 'utf8');
  fs.writeFileSync(filePath, out, 'utf8');
}

function walkDir(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...walkDir(full));
    } else if (e.isFile() && full.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const allFiles = walkDir(COMMANDS_DIR);
  const report = [];
  for (const f of allFiles) {
    try {
      processFile(f, report);
      console.log('Processed:', path.relative(process.cwd(), f));
    } catch (err) {
      console.error('Failed to process', f, err);
      report.push({ file: f, reason: 'parse/transform error' });
    }
  }

  console.log('\nConversion complete.');
  if (report.length) {
    console.log('Files needing manual attention:');
    for (const r of report) {
      console.log('-', path.relative(process.cwd(), r.file), '->', r.reason);
    }
  } else {
    console.log('All files converted automatically.');
  }
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
