/**
 * The analysis behind `scripts/check-firestore-indexes.mjs`.
 *
 * Split out so it can be tested: the first version of that gate read the
 * ordered field out of a property nobody set, verified nothing, and failed CI on
 * equality-only queries that Firestore serves from its automatic single-field
 * indexes. The rules it encodes are documented on the CLI script; this module
 * holds the parsing (`readQueries`) and the index comparison (`indexCovers`).
 */

export const EQUALITY_OPS = new Set([
  "==",
  "in",
  "not-in",
  "array-contains",
  "array-contains-any",
]);
export const RANGE_OPS = new Set(["<", "<=", ">", ">=", "!="]);

/**
 * Blank out comments, keeping every offset where it was.
 *
 * The docblocks in this codebase quote real query code (`orderBy(field, …)` in
 * requests.ts), and reading a comment as a query is how a checker invents work.
 * Strings are left alone, so `//` inside a URL is not a comment.
 */
export function blankComments(text) {
  const chars = text.split("");
  let quote = null;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (quote) {
      if (char === "\\") {
        i += 2;
        continue;
      }
      if (char === quote) quote = null;
      i += 1;
      continue;
    }

    if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") {
        chars[i] = " ";
        i += 1;
      }
      continue;
    }

    if (char === "/" && text[i + 1] === "*") {
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] !== "\n") chars[i] = " ";
        i += 1;
      }
      i += 2;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") quote = char;
    i += 1;
  }

  return chars.join("");
}

/** The quoted string literals in an argument list, in order. */
function quotedArgs(text, start, end) {
  const args = [];
  const re = /(['"`])((?:\\.|(?!\1).)*)\1/g;
  re.lastIndex = start;
  let match;
  while ((match = re.exec(text)) !== null && match.index < end) {
    args.push(match[2]);
  }
  return args;
}

/** Parameters of a call: from its `(` to the matching `)`. */
function callSpan(text, openParen) {
  let depth = 0;
  for (let i = openParen; i < text.length; i += 1) {
    const char = text[i];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return { start: openParen + 1, end: i };
    }
  }
  return { start: openParen + 1, end: text.length };
}

/**
 * Every call of `name(...)` in the source, with its position and quoted
 * arguments.
 *
 * Matched on the bare name plus `(`, so `where(`, `.where(`, `query(q, where(`
 * and `collection(db, 'x')` all land here; a property named e.g. `somewhere(`
 * is excluded by the word boundary.
 */
function calls(text, name) {
  const found = [];
  const re = new RegExp(`(?:^|[^A-Za-z0-9_$])(${name})\\s*\\(`, "g");
  let match;
  while ((match = re.exec(text)) !== null) {
    const openParen = match.index + match[0].length - 1;
    const { start, end } = callSpan(text, openParen);
    found.push({ pos: match.index, args: quotedArgs(text, start, end) });
    re.lastIndex = openParen + 1;
  }
  return found;
}

/**
 * The query sites in one file.
 *
 * A site is one `collection(...)` anchor plus the `where`/`orderBy` calls that
 * follow it, so a filter and the order it is chained with end up together even
 * when the chain is built across statements (`q = query(q, orderBy(...))`).
 * Filters that cannot be read because an argument is a variable are returned as
 * `unverified` rather than guessed at.
 */
export function readQueries(source) {
  const text = blankComments(source);

  const anchors = calls(text, "collection")
    .map((call) => {
      const name = call.args.find((arg) => arg && !arg.includes("("));
      return name ? { pos: call.pos, collection: name } : null;
    })
    .filter(Boolean);

  if (anchors.length === 0) return { sites: [], unverified: [] };

  /** The anchor a call belongs to: the nearest `collection(...)` above it. */
  function anchorFor(pos) {
    let chosen = null;
    for (const anchor of anchors) {
      if (anchor.pos < pos) chosen = anchor;
      else break;
    }
    return chosen;
  }

  const sites = new Map();
  const unverified = [];

  /**
   * A method signature inside a local `interface` — `where(field: string,
   * op: string, value: unknown): FirebaseQuery;` — is textually identical to a
   * call. It is not one: its arguments are parameter declarations with type
   * annotations and it quotes nothing, which no query ever does. Counting those
   * as unreadable made the gate report two permanent phantom gaps in the
   * retention route and hid whatever real ones ever appeared next to them.
   */
  function isParameterDeclaration(call) {
    const openParen = text.indexOf("(", call.pos);
    if (openParen === -1) return false;
    const { start, end } = callSpan(text, openParen);
    return /^[A-Za-z_$][\w$]*\s*:\s*[A-Za-z_$[{]/.test(
      text.slice(start, end).trim()
    );
  }

  function site(anchor) {
    const key = `${anchor.pos}`;
    if (!sites.has(key)) {
      sites.set(key, {
        collection: anchor.collection,
        equals: new Set(),
        ranges: new Set(),
        orders: new Map(),
        documentId: false,
      });
    }
    return sites.get(key);
  }

  function applyWhere(call, target) {
    const [first, second] = call.args;
    // `where(sortField, "==", value)`: the field, not the operator, is the
    // variable, so the filter cannot be placed in an index.
    const fieldIsOperator =
      first !== undefined && (EQUALITY_OPS.has(first) || RANGE_OPS.has(first));
    if (!first || fieldIsOperator) {
      unverified.push("where(<dynamic field>)");
      return;
    }

    const field = first;
    const op = second;
    if (!op) {
      // `where('field', variable)` reads as equality in the client SDK.
      target.equals.add(field);
      return;
    }

    const normalised = op.toLowerCase();
    if (EQUALITY_OPS.has(normalised)) {
      if (field === "__name__") target.documentId = true;
      else target.equals.add(field);
    } else if (RANGE_OPS.has(normalised)) {
      target.ranges.add(field);
    } else {
      unverified.push(`where('${field}', '${op}')`);
    }
  }

  function applyOrderBy(call, target) {
    const [field, direction] = call.args;
    const directionIsFirst =
      field !== undefined &&
      (field.toLowerCase() === "asc" || field.toLowerCase() === "desc");
    if (!field || directionIsFirst) {
      unverified.push("orderBy(<dynamic field>)");
      return;
    }

    const dir =
      (direction ?? "").toLowerCase() === "desc" ? "DESCENDING" : "ASCENDING";
    target.orders.set(field, dir);
  }

  for (const call of calls(text, "where")) {
    if (isParameterDeclaration(call)) continue;
    const anchor = anchorFor(call.pos);
    if (anchor) applyWhere(call, site(anchor));
  }

  for (const call of calls(text, "orderBy")) {
    if (isParameterDeclaration(call)) continue;
    const anchor = anchorFor(call.pos);
    if (anchor) applyOrderBy(call, site(anchor));
  }

  // A query is often assembled before its collection is named:
  //   const constraints = [where('userId','==',id), orderBy('createdAt','desc')];
  //   query(collection(db,'shipments'), ...constraints)
  // Nearest-preceding anchoring hands those filters to whatever collection was
  // named earlier in the file, so the spread is resolved through its array.
  for (const spread of spreadConstraints(text)) {
    const anchor = anchors.find(
      (candidate) =>
        candidate.pos > spread.queryStart && candidate.pos < spread.queryEnd
    );
    if (!anchor) continue;

    for (const call of spread.filters) {
      if (call.name === "where") applyWhere(call, site(anchor));
      else applyOrderBy(call, site(anchor));
    }
  }

  return { sites: [...sites.values()], unverified };
}

/**
 * `query(collection(...), ...name)` calls, with the wheres/orderBys from the
 * array `name` was assigned.
 */
function spreadConstraints(text) {
  const spread = [];

  for (const queryCall of calls(text, "query")) {
    const { start, end } = callArgs(text, queryCall.pos);
    const body = text.slice(start, end);

    for (const match of body.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*)/g)) {
      const variable = match[1];
      const assignment = new RegExp(
        `const\\s+${variable}\\s*(?::[^=]+)?=\\s*\\[`,
        "g"
      );
      const found = assignment.exec(text);
      if (!found) continue;

      const openBracket = found.index + found[0].length - 1;
      const arrayEnd = matchingBracket(text, openBracket);
      const array = text.slice(openBracket, arrayEnd);
      const filters = [
        ...calls(array, "where").map((call) => ({ ...call, name: "where" })),
        ...calls(array, "orderBy").map((call) => ({
          ...call,
          name: "orderBy",
        })),
      ];

      spread.push({
        queryStart: start - 1,
        queryEnd: end + 1,
        filters,
      });
    }
  }

  return spread;
}

/** The `[` … `]` span that starts at `open`. */
function matchingBracket(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "[") depth += 1;
    else if (text[i] === "]") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

/** The argument span of the call whose `(` sits after `pos`. */
function callArgs(text, pos) {
  const open = text.indexOf("(", pos);
  if (open === -1) return { start: pos, end: pos };
  return callSpan(text, open);
}

/**
 * A composite index is only ever required when a filter meets an order (or a
 * range, which Firestore treats as the ordering). Everything else — equality
 * filters alone, a document-id lookup, a bare order — is covered by the
 * automatic single-field indexes.
 */
export function requirementsFor(site) {
  const range = [...site.ranges][0] ?? null;

  if (site.orders.size === 0) {
    if (site.equals.size > 0 && range) {
      return [
        {
          ...site,
          equals: [...site.equals],
          order: { field: range, direction: "ASCENDING" },
        },
      ];
    }
    return [];
  }

  if (site.equals.size === 0 && !range && !site.documentId) return [];

  // A document-id filter is a filter like any other once something is ordered.
  const equals = [...site.equals];
  if (site.equals.size === 0 && range === null) equals.push("__name__");

  return [...site.orders]
    .filter(([field]) => !equals.includes(field))
    .map(([field, direction]) => ({
      ...site,
      equals,
      order: { field, direction },
    }));
}

/** Firestore: equality fields first (ascending), then the ordered field. */
export function indexCovers(requirement, index) {
  if (index.collectionGroup !== requirement.collection) return false;

  const fields = index.fields || [];
  const equalityCount = requirement.equals.length;

  if (fields.length < equalityCount + 1) return false;

  const head = fields.slice(0, equalityCount).map((field) => field.fieldPath);
  const headMatches =
    head.length === requirement.equals.length &&
    requirement.equals.every((field) => head.includes(field));
  if (!headMatches) return false;

  const ordered = fields[equalityCount];
  return (
    ordered.fieldPath === requirement.order.field &&
    (ordered.order ?? "ASCENDING").toUpperCase() === requirement.order.direction
  );
}
