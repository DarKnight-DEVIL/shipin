#!/usr/bin/env node
/**
 * Fails when a Firestore query needs a composite index that
 * `firestore.indexes.json` does not declare.
 *
 * Why this exists: the dashboard list (`where('userId','==',…)` +
 * `orderBy('createdAt','desc')`) shipped before any index existed, so every page
 * load failed with FAILED_PRECONDITION and the only way to find out was to load
 * the page and read the console. A missing index is a *static* fact about the
 * code and the index file, so it can be caught before deploy.
 *
 * The rule Firestore applies, measured against this project's Firestore on
 * 2026-11-15 rather than assumed:
 *   - two equality filters and nothing ordered are answered by *merging* the
 *     automatic single-field indexes (`notifications` with `userId ==` +
 *     `read ==` returns rows), so they need no composite index;
 *   - the same pair plus `orderBy('read')` fails with FAILED_PRECONDITION, so a
 *     composite index is required as soon as something is ordered or ranged.
 * Hence: an index is required only when at least one filter is combined with an
 * order (`orderBy`, or a range filter, which sorts by that field).
 *
 * What it reads: query expressions parsed with the TypeScript compiler, so
 * parenthesisation, line breaks and arguments in any order do not matter. It
 * understands `collection(...)`/`db.collection(...)`/`adminDb.collection(...)`,
 * `query(...)` with `where`/`orderBy` arguments, fluent chains ending in
 * `.get()`/`.count()`/`.onSnapshot()`, `getDocs(...)`/`get(q)`, and queries
 * built up in a variable (`let q = query(collection(...), where(...))`, then
 * `q = query(q, orderBy(...))` or `q = q.where(...)`).
 *
 * What it cannot see, and says so instead of guessing:
 *   - a dynamic `orderBy(sortField, sortDirection)`: the ordered field only
 *     exists at runtime. Such a query is checked for an index that covers its
 *     filters — the failure that broke the dashboard — and reported as
 *     unverified for the ordering. Making that field a literal lets the check
 *     see it too;
 *   - query objects handed to helpers outside this file, and collections named
 *     by a non-literal argument.
 *
 * Directions are matched by field name only: Firestore can walk an index
 * backwards for a lone ordered field, so requiring an exact direction would
 * reject indexes that work.
 *
 * Usage:
 *   node scripts/check-firestore-indexes.mjs            # gate
 *   node scripts/check-firestore-indexes.mjs --print    # show what it derived
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const INDEX_FILE = path.resolve(ROOT, "..", "..", "firestore.indexes.json");
const SOURCE_ROOTS = ["src"];
const SKIP_DIRS = new Set(["node_modules", ".next", "coverage"]);
const SKIP_FILE = /\.(test|spec)\.tsx?$/;

// Firestore plans these as equality matches for index selection.
const EQUALITY_OPS = new Set(["==", "===", "in", "array-contains", "array-contains-any"]);

const print = process.argv.includes("--print");
const out = (line = "") => process.stdout.write(`${line}\n`);

function collectFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...collectFiles(path.join(dir, entry.name)));
      continue;
    }

    if (/\.tsx?$/.test(entry.name) && !SKIP_FILE.test(entry.name)) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

function emptyConstraints() {
  return { equals: new Set(), ranges: new Set(), order: null, dynamic: false };
}

function emptySpec(collection, where) {
  return { collection, ...emptyConstraints(), where };
}

function mergeInto(target, source) {
  for (const field of source.equals) target.equals.add(field);
  for (const field of source.ranges) target.ranges.add(field);
  if (source.order) target.order = source.order;
  if (source.dynamic) target.dynamic = true;
  return target;
}

/** The last string-literal argument of `collection(db, 'a', id, 'b')`. */
function collectionName(args) {
  let name = null;

  for (const arg of args) {
    if (!ts.isStringLiteralLike(arg) && !ts.isNoSubstitutionTemplateLiteral(arg)) continue;
    name = arg.text.includes("/") ? arg.text.split("/").pop() : arg.text;
  }

  return name;
}

function literalText(node) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/** `where('field', 'op', …)` / `orderBy('field'[, 'dir'])` — standalone or method. */
function constraintsOf(node) {
  const found = emptyConstraints();
  if (!node || !ts.isCallExpression(node)) return found;

  const callee = node.expression;
  const method = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : null;

  if (method === "where") {
    const field = literalText(node.arguments[0]);
    const op = literalText(node.arguments[1]);
    if (field && op) {
      if (EQUALITY_OPS.has(op)) found.equals.add(field);
      else found.ranges.add(field);
    }
  }

  if (method === "orderBy") {
    const field = literalText(node.arguments[0]);
    const direction = literalText(node.arguments[1]);
    if (field) found.order = { field, direction: (direction ?? "asc").toLowerCase() };
    else found.dynamic = true;
  }

  return found;
}

/**
 * Resolve an expression to the query it builds, or null when it is not a query
 * this checker can see (a document reference, a helper call, a literal, …).
 */
function specOf(node, env) {
  if (!node) return null;

  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return specOf(node.expression, env);
  }

  if (ts.isIdentifier(node)) return env.get(node.text) ?? null;

  if (!ts.isCallExpression(node)) return null;

  const callee = node.expression;

  if (ts.isIdentifier(callee)) {
    // `get(q)` / `getDocs(q)` / `getCountFromServer(q)`: the query is the argument.
    if (callee.text === "get" || callee.text === "getDocs" || callee.text === "getCountFromServer") {
      return specOf(node.arguments[0], env);
    }
    if (callee.text === "collection") {
      const name = collectionName(node.arguments);
      return name ? emptySpec(name, null) : null;
    }
    if (callee.text === "query") {
      const base = specOf(node.arguments[0], env);
      if (!base) return null;
      const spec = { ...base, equals: new Set(base.equals), ranges: new Set(base.ranges) };
      for (const arg of node.arguments.slice(1)) mergeInto(spec, constraintsOf(arg));
      return spec;
    }
    // `where(...)` / `orderBy(...)` on their own carry no collection.
    return null;
  }

  if (!ts.isPropertyAccessExpression(callee)) return null;

  const method = callee.name.text;
  const receiver = callee.expression;

  if (method === "collection") {
    const name = collectionName(node.arguments);
    return name ? emptySpec(name, null) : null;
  }

  // A document reference is not a query; `doc(...)`/`.doc(...)` invalidates it.
  if (method === "doc") return null;

  if (method === "where" || method === "orderBy") {
    const base = specOf(receiver, env);
    if (!base) return null;
    const spec = { ...base, equals: new Set(base.equals), ranges: new Set(base.ranges) };
    return mergeInto(spec, constraintsOf(node));
  }

  const base = specOf(receiver, env);
  if (!base) return null;

  // Ordering modifiers do not change which fields the index needs.
  if (method === "limit" || method === "limitToLast" || method === "offset") return base;
  if (method === "startAt" || method === "startAfter" || method === "endAt" || method === "endBefore") {
    return base;
  }
  if (method === "get" || method === "count" || method === "onSnapshot") return base;

  // An unknown method could mean anything; do not invent a requirement.
  return null;
}

function signature(requirement) {
  return [
    requirement.collection,
    [...requirement.equals].sort().join(","),
    [...requirement.ranges].sort().join(","),
    requirement.order ? `${requirement.order.field}:${requirement.order.direction}` : "-",
    requirement.dynamic ? "dynamic" : "static",
  ].join("|");
}

/** Every composite-index requirement in one file. */
function requirementsFor(file, relative) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const env = new Map();
  const requirements = [];
  const seen = new Set();

  const emit = (spec) => {
    if (!spec || !spec.collection) return;
    const fields =
      spec.equals.size + spec.ranges.size + (spec.order ? 1 : 0) + (spec.dynamic ? 1 : 0);
    if (fields === 0) return;

    const requirement = {
      collection: spec.collection,
      equals: new Set(spec.equals),
      ranges: new Set(spec.ranges),
      order: spec.order,
      dynamic: spec.dynamic,
      where: relative,
    };
    const key = signature(requirement);
    if (seen.has(key)) return;
    seen.add(key);
    requirements.push(requirement);
  };

  const visit = (node) => {
    // Track `x = <query>` so later statements resolve `x`.
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const spec = specOf(node.initializer, env);
      if (spec) env.set(node.name.text, spec);
      else env.delete(node.name.text);
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const spec = specOf(node.right, env);
      if (spec) env.set(node.left.text, spec);
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression;

      if (ts.isPropertyAccessExpression(callee)) {
        const method = callee.name.text;
        if (method === "get" || method === "count" || method === "onSnapshot") {
          emit(specOf(callee.expression, env));
        }
      }

      if (
        ts.isIdentifier(callee) &&
        (callee.text === "get" || callee.text === "getDocs" || callee.text === "getCountFromServer")
      ) {
        emit(specOf(node.arguments[0], env));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  // A built-up query that is handed to something this file cannot follow still
  // is a query: emit what was accumulated for each variable.
  for (const spec of env.values()) emit(spec);

  return requirements;
}

/**
 * Split a requirement into the equality columns and the ordered/range column
 * that must come last in the index.
 */
function needsComposite(requirement) {
  const orderedField = requirement.order?.field ?? null;
  const rangeFields = [...requirement.ranges].filter((field) => !requirement.equals.has(field));
  const tail = orderedField ?? rangeFields[0] ?? null;
  const equalityFields = [...requirement.equals].filter((field) => field !== tail);
  const fields = new Set([...equalityFields, ...(tail ? [tail] : [])]);

  return { equalityFields, tail, fields };
}

function indexFields(index) {
  return (index.fields ?? [])
    .map((field) => field.fieldPath)
    .filter((field) => field !== "__name__");
}

function satisfies(requirement, index) {
  const { equalityFields, tail, fields } = needsComposite(requirement);
  const indexed = indexFields(index);

  if (index.collectionGroup !== requirement.collection) return false;
  if (indexed.length !== fields.size) return false;

  if (!tail) {
    // Equality-only: the index must carry exactly these fields, in any order.
    return equalityFields.every((field) => indexed.includes(field));
  }

  // Equality fields lead the index in any order; the ordered field must be last.
  if (indexed[indexed.length - 1] !== tail) return false;

  const head = indexed.slice(0, -1);
  return head.length === equalityFields.length && equalityFields.every((field) => head.includes(field));
}

function describe(requirement) {
  const { equalityFields, tail } = needsComposite(requirement);
  const parts = [
    ...equalityFields.map((field) => `${field} ==`),
    tail ? `${tail} ordered` : null,
  ]
    .filter(Boolean)
    .join(" + ");

  return `${requirement.collection}: ${parts}  (${requirement.where})`;
}

function suggestedIndex(requirement) {
  const { equalityFields, tail } = needsComposite(requirement);
  const direction = requirement.order?.direction === "desc" ? "DESCENDING" : "ASCENDING";

  return {
    collectionGroup: requirement.collection,
    queryScope: "COLLECTION",
    fields: [
      ...equalityFields.map((field) => ({ fieldPath: field, order: "ASCENDING" })),
      ...(tail ? [{ fieldPath: tail, order: direction }] : []),
      { fieldPath: "__name__", order: direction },
    ],
  };
}

/** For a dynamic ordering, an index has to cover the equality filters at least. */
function coversEquality(requirement, index) {
  return (
    index.collectionGroup === requirement.collection &&
    [...requirement.equals].every((field) => indexFields(index).includes(field))
  );
}

// ─── run ────────────────────────────────────────────────────────────────────
if (!existsSync(INDEX_FILE)) {
  console.error(
    `check-firestore-indexes: ${path.relative(ROOT, INDEX_FILE)} is missing, so nothing can be checked. ` +
      "Run `firebase firestore:indexes > firestore.indexes.json` and commit it."
  );
  process.exit(1);
}

const indexDocument = JSON.parse(readFileSync(INDEX_FILE, "utf8"));
const indexes = Array.isArray(indexDocument.indexes) ? indexDocument.indexes : [];

const sources = SOURCE_ROOTS.flatMap((root) => {
  const dir = path.join(ROOT, root);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(
      `check-firestore-indexes: source root ${root} does not exist. A check that scans ` +
        "nothing would pass, so this is an error rather than a warning."
    );
    process.exit(1);
  }
  return collectFiles(dir);
});

const allRequirements = sources.flatMap((file) =>
  requirementsFor(file, path.relative(ROOT, file).split(path.sep).join("/"))
);

const checked = [];
const unchecked = [];
const trivial = [];
const equalityOnly = [];

for (const requirement of allRequirements) {
  const { tail, fields } = needsComposite(requirement);

  // A dynamic `orderBy(sortField)` cannot be resolved statically, but the
  // expensive failure — no index for this collection at all — still is: that is
  // the shape that broke the dashboard. Require an index covering the filters.
  if (requirement.dynamic) {
    if (requirement.equals.size > 0) unchecked.push(requirement);
    else trivial.push(requirement);
    continue;
  }

  // Ordered/ranged on one field only, nothing filtered: single-field index.
  if (fields.size < 2) {
    trivial.push(requirement);
    continue;
  }

  // Several equality filters and nothing ordered: index merging covers it.
  if (!tail) {
    equalityOnly.push(requirement);
    continue;
  }

  checked.push(requirement);
}

if (checked.length === 0 && unchecked.length === 0) {
  console.error(
    "check-firestore-indexes: no Firestore queries were found under " +
      SOURCE_ROOTS.join(", ") +
      ". The scan is probably broken, and a check that finds nothing must not pass."
  );
  process.exit(1);
}

const missing = checked.filter((requirement) => !indexes.some((index) => satisfies(requirement, index)));
const missingDynamic = unchecked.filter(
  (requirement) => !indexes.some((index) => coversEquality(requirement, index))
);

const failures = [
  ...missing.map((requirement) => ({ requirement, dynamic: false })),
  ...missingDynamic.map((requirement) => ({ requirement, dynamic: true })),
];

if (print) {
  out(`${sources.length} files scanned, ${indexes.length} declared indexes`);
  out("");
  out("composite-index requirements:");
  for (const requirement of checked) {
    out(`  ${missing.includes(requirement) ? "MISS" : "ok  "} ${describe(requirement)}`);
  }
  if (unchecked.length > 0) {
    out("");
    out("dynamic orderBy (index must cover the filters; ordering unverified):");
    for (const requirement of unchecked) {
      out(
        `  ${missingDynamic.includes(requirement) ? "MISS" : "ok? "} ${requirement.collection}  ` +
          `(${[...requirement.equals].join(" + ")} filtered)  (${requirement.where})`
      );
    }
  }
  out("");
  out(`single-field only: ${trivial.length} query/queries need no composite index`);
  out(`equality-only: ${equalityOnly.length} query/queries are answered by index merging`);
  for (const requirement of equalityOnly) out(`  ----  ${describe(requirement)}`);
}

if (failures.length > 0) {
  console.error("");
  console.error(
    "check-firestore-indexes: these queries need a composite index that " +
      "firestore.indexes.json does not declare:"
  );
  console.error("");

  for (const { requirement, dynamic } of failures) {
    console.error(`  - ${describe(requirement)}`);
    if (dynamic) {
      console.error(
        `    orderBy is dynamic, so the ordered field is unverified; no declared index covers ` +
          `${[...requirement.equals].join(" + ")} on ${requirement.collection}`
      );
    }
  }

  const suggestable = failures.filter((failure) => !failure.dynamic);
  if (suggestable.length > 0) {
    console.error("");
    console.error("Add to firestore.indexes.json (then deploy with `npm run deploy:firestore`):");
    console.error("");
    console.error(JSON.stringify(suggestable.map((failure) => suggestedIndex(failure.requirement)), null, 2));
  } else {
    console.error("");
    console.error(
      "Every failure above has a dynamic orderBy: add an index for the filters plus the field " +
        "it orders by."
    );
  }

  process.exit(1);
}

out(
  `${checked.length} composite-index requirements across ${sources.length} files are declared ` +
    `(${indexes.length} indexes in firestore.indexes.json; ${equalityOnly.length} equality-only ` +
    `queries need none, ${trivial.length} are single-field).`
);

if (unchecked.length > 0) {
  out(
    `${unchecked.length} dynamic query/queries have an index covering their filters, ` +
      "but their ordered field could not be verified: " +
      unchecked.map((requirement) => `${requirement.collection} (${requirement.where})`).join(", ")
  );
  out("Pass a literal field to orderBy(...) where possible so this check can see it too.");
}
