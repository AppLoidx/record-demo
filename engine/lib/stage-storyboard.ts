import ts from "typescript";

function isStoryboardSpecifier(specifier: string) {
  const withoutExtension = specifier.replace(/\.(ts|mts|js|mjs)$/, "");
  return (
    withoutExtension === "record-demo/storyboard" ||
    (withoutExtension.endsWith("/storyboard") &&
      ["./", "../", "/"].some((prefix) => withoutExtension.startsWith(prefix)))
  );
}

function escapeSpecifier(specifier: string, quote: string) {
  return specifier.replaceAll("\\", "\\\\").replaceAll(quote, `\\${quote}`);
}

function moduleSpecifierOf(statement: ts.Statement) {
  if (ts.isImportDeclaration(statement)) return statement.moduleSpecifier;
  if (ts.isExportDeclaration(statement)) return statement.moduleSpecifier;
  return undefined;
}

export function rewriteStoryboardImports(
  source: string,
  storyboardPath: string,
) {
  const sourceFile = ts.createSourceFile(
    "storyboard.demo.ts",
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  const replacements: Array<{ start: number; end: number; quote: string }> = [];
  const collect = (node: ts.Node) => {
    const specifier =
      moduleSpecifierOf(node as ts.Statement) ??
      (ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? node.arguments[0]
        : undefined);
    if (
      specifier &&
      ts.isStringLiteralLike(specifier) &&
      isStoryboardSpecifier(specifier.text)
    ) {
      const start = specifier.getStart(sourceFile);
      const end = specifier.getEnd();
      replacements.push({
        start: start + 1,
        end: end - 1,
        quote: source[start] ?? '"',
      });
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);

  return replacements.reduceRight(
    (rewritten, { start, end, quote }) =>
      `${rewritten.slice(0, start)}${escapeSpecifier(storyboardPath, quote)}${rewritten.slice(end)}`,
    source,
  );
}
