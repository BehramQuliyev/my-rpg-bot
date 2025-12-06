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

function ensureReplyFromResultImport(ast) {
  let hasImport = false;
  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source.value === '../../utils/reply' || path.node.source.value.endsWith('/utils/reply')) {
        const specifiers = path.node.specifiers.map(s => s.local.name);
        if (!specifiers.includes('replyFromResult')) {
          path.node.specifiers.push(t.importSpecifier(t.identifier('replyFromResult'), t.identifier('replyFromResult')));
        }
        hasImport = true;
      }
    }
  });
  // If no import from utils/reply found, add one at top
  if (!hasImport) {
    const imp = t.importDeclaration(
      [t.importSpecifier(t.identifier('replyFromResult'), t.identifier('replyFromResult'))],
      t.stringLiteral('../../utils/reply')
    );
    ast.program.body.unshift(imp);
  }
}

function transformCalls(ast, report) {
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (!t.isIdentifier(callee)) return;

      const name = callee.name;
      // Patterns to transform:
      // replySuccess(message, text, title)
      // replyError(message, text, title)
      // replyInfo(message, text, title)
      if (['replySuccess', 'replyError', 'replyInfo'].includes(name)) {
        const args = path.node.arguments;
        if (args.length >= 2 && t.isIdentifier(args[0]) && (t.isStringLiteral(args[1]) || t.isTemplateLiteral(args[1]) || t.isBinaryExpression(args[1]) || t.isCallExpression(args[1]) || t.isConditionalExpression(args[1]))) {
          const messageArg = args[0];
          const textArg = args[1];
          const titleArg = args[2] || t.stringLiteral(name === 'replySuccess' ? 'Success' : (name === 'replyError' ? 'Error' : 'Info'));

          // Build a result object expression
          let resultObj;
          if (name === 'replySuccess') {
            // { success: true, data: { message: textArg } }
            resultObj = t.objectExpression([
              t.objectProperty(t.identifier('success'), t.booleanLiteral(true)),
              t.objectProperty(t.identifier('data'), t.objectExpression([
                t.objectProperty(t.identifier('message'), textArg)
              ]))
            ]);
          } else {
            // replyError/replyInfo -> success: false
            resultObj = t.objectExpression([
              t.objectProperty(t.identifier('success'), t.booleanLiteral(false)),
              t.objectProperty(t.identifier('error'), textArg)
            ]);
          }

          // Build options object: { label: '<Title>', errorTitle: '<titleArg>' } for errors, successTitle for success
          const optionsProps = [];
          optionsProps.push(t.objectProperty(t.identifier('label'), t.stringLiteral(titleArg.value || (name === 'replySuccess' ? 'Result' : 'Result'))));
          if (name === 'replySuccess') {
            optionsProps.push(t.objectProperty(t.identifier('successTitle'), titleArg));
          } else if (name === 'replyError') {
            optionsProps.push(t.objectProperty(t.identifier('errorTitle'), titleArg));
          } else {
            optionsProps.push(t.objectProperty(t.identifier('infoTitle'), titleArg));
          }
          const optionsObj = t.objectExpression(optionsProps);

          // Replace call with replyFromResult(message, resultObj, optionsObj)
          const newCall = t.callExpression(t.identifier('replyFromResult'), [messageArg, resultObj, optionsObj]);
          path.replaceWith(newCall);
        } else {
          // Complex call site — skip and report
          const loc = path.node.loc ? `${path.node.loc.start.line}:${path.node.loc.start.column}` : 'unknown';
          report.push({ file: path.hub.file.opts.filename, reason: `Complex ${name} call at ${loc}` });
        }
      }
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
