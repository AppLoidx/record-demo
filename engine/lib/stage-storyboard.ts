import ts from "typescript";

function isStoryboardSpecifier(specifier: string) {
  return (
    specifier === "record-demo/storyboard" || specifier.endsWith("/storyboard")
  );
}

function escapeSpecifier(specifier: string, quote: string) {
  return specifier.replaceAll("\\", "\\\\").replaceAll(quote, `\\${quote}`);
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
  const replacements = sourceFile.statements.flatMap((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !isStoryboardSpecifier(statement.moduleSpecifier.text)
    ) {
      return [];
    }

    const start = statement.moduleSpecifier.getStart(sourceFile);
    const end = statement.moduleSpecifier.getEnd();
    const quote = source[start] ?? '"';
    return [{ start: start + 1, end: end - 1, quote }];
  });

  return replacements.reduceRight(
    (rewritten, { start, end, quote }) =>
      `${rewritten.slice(0, start)}${escapeSpecifier(storyboardPath, quote)}${rewritten.slice(end)}`,
    source,
  );
}
