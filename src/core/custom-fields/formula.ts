/**
 * Safe formula parser — NO eval, NO Function(). Recursive-descent over a
 * strict grammar:
 *
 *   expr   := term (('+'|'-') term)*
 *   term   := factor (('*'|'/'|'%') factor)*
 *   factor := unary ('^' factor)?
 *   unary  := ('-'|'+')? primary
 *   primary:= NUMBER | IDENT | IDENT '(' args ')' | '(' expr ')'
 *
 * Identifiers resolve ONLY from the caller-provided scope (field keys).
 * Function whitelist: MIN MAX ROUND ABS FLOOR CEIL. Everything else —
 * unknown identifiers, functions, or ANY character outside the grammar —
 * throws FormulaError (goal M5.2: injection attempts fail validation).
 */
export class FormulaError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "FormulaError";
  }
}

type Token =
  | { t: "num"; v: number }
  | { t: "ident"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "%" | "^" | "(" | ")" | "," };

const OPS = new Set(["+", "-", "*", "/", "%", "^", "(", ")", ","]);
const FUNCS = new Set(["MIN", "MAX", "ROUND", "ABS", "FLOOR", "CEIL"]);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      let dots = 0;
      while (j < src.length && /[0-9.]/.test(src[j])) {
        if (src[j] === ".") dots += 1;
        j += 1;
      }
      if (dots > 1) throw new FormulaError("Malformed number in formula", src.slice(i, j));
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) throw new FormulaError("Malformed number in formula", src.slice(i, j));
      tokens.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      tokens.push({ t: "ident", v: src.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }
    // Single-char ident fallback for lowercase-only idents is handled above
    // via uppercase normalization; anything else:
    if (OPS.has(ch)) {
      tokens.push({ t: "op", v: ch as Extract<Token, { t: "op" }>["v"] });
      i += 1;
      continue;
    }
    throw new FormulaError("Illegal character in formula", `'${ch}' at position ${i}`);
  }
  return tokens;
}

export type Scope = Readonly<Record<string, number>>;

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly scope: Scope,
    private readonly depth = 0,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private eat(): Token {
    const tok = this.tokens[this.pos];
    if (!tok) throw new FormulaError("Unexpected end of formula");
    this.pos += 1;
    return tok;
  }

  parse(): number {
    const v = this.expr();
    if (this.pos !== this.tokens.length) {
      throw new FormulaError("Unexpected trailing input in formula");
    }
    return v;
  }

  private expr(): number {
    let left = this.term();
    while (true) {
      const tok = this.peek();
      if (tok?.t === "op" && (tok.v === "+" || tok.v === "-")) {
        this.eat();
        const right = this.term();
        left = tok.v === "+" ? left + right : left - right;
      } else break;
    }
    return left;
  }

  private term(): number {
    let left = this.factor();
    while (true) {
      const tok = this.peek();
      if (tok?.t === "op" && (tok.v === "*" || tok.v === "/" || tok.v === "%")) {
        this.eat();
        const right = this.factor();
        if ((tok.v === "/" || tok.v === "%") && right === 0) {
          throw new FormulaError("Division by zero in formula");
        }
        left = tok.v === "*" ? left * right : tok.v === "/" ? left / right : left % right;
      } else break;
    }
    return left;
  }

  private factor(): number {
    const base = this.unary();
    const tok = this.peek();
    if (tok?.t === "op" && tok.v === "^") {
      this.eat();
      return Math.pow(base, this.factor()); // right-assoc
    }
    return base;
  }

  private unary(): number {
    const tok = this.peek();
    if (tok?.t === "op" && (tok.v === "-" || tok.v === "+")) {
      this.eat();
      const v = this.unary();
      return tok.v === "-" ? -v : v;
    }
    return this.primary();
  }

  private primary(): number {
    const tok = this.eat();

    if (tok.t === "num") return tok.v;

    if (tok.t === "op" && tok.v === "(") {
      const v = this.expr();
      const close = this.eat();
      if (!(close.t === "op" && close.v === ")")) {
        throw new FormulaError("Missing closing parenthesis");
      }
      return v;
    }

    if (tok.t === "ident") {
      const next = this.peek();
      if (next?.t === "op" && next.v === "(") {
        if (!FUNCS.has(tok.v)) {
          throw new FormulaError("Unknown function in formula", tok.v);
        }
        this.eat(); // (
        const args: number[] = [];
        if (this.peek()?.t === "op" && this.peek()!.v === ")") {
          this.eat();
        } else {
          args.push(this.expr());
          while (this.peek()?.t === "op" && this.peek()!.v === ",") {
            this.eat();
            args.push(this.expr());
          }
          const close = this.eat();
          if (!(close.t === "op" && close.v === ")")) {
            throw new FormulaError("Missing closing parenthesis in function call");
          }
        }
        return applyFunc(tok.v, args);
      }
      if (tok.v in this.scope) return this.scope[tok.v] ?? NaN;
      throw new FormulaError("Unknown identifier in formula", tok.v);
    }

    throw new FormulaError("Unexpected token in formula");
  }
}

function applyFunc(name: string, args: number[]): number {
  switch (name) {
    case "MIN":
      return Math.min(...args);
    case "MAX":
      return Math.max(...args);
    case "ROUND":
      return Number(args[0]?.toFixed(args[1] ?? 0));
    case "ABS":
      return Math.abs(args[0] ?? 0);
    case "FLOOR":
      return Math.floor(args[0] ?? 0);
    case "CEIL":
      return Math.ceil(args[0] ?? 0);
    default:
      throw new FormulaError("Unknown function in formula", name);
  }
}

/** Parse+evaluate with the given scope. Throws FormulaError on ANY violation. */
export function evaluateFormula(source: string, scope: Scope): number {
  if (source.length > 500) throw new FormulaError("Formula too long (max 500 chars)");
  const parser = new Parser(tokenize(source), scope);
  const result = parser.parse();
  if (!Number.isFinite(result)) throw new FormulaError("Formula produced non-finite result");
  return result;
}

/**
 * Validates a formula WITHOUT values (compile-time): every identifier must be
 * present in `allowedKeys`. Uses 1 as sample value to avoid division-by-zero
 * in compile-time checks (e.g. margin formulas).
 */
export function validateFormula(source: string, allowedKeys: readonly string[]): void {
  const tokens = tokenize(source);
  const scope: Scope = Object.fromEntries(allowedKeys.map((k) => [k.toUpperCase(), 1]));
  new Parser(tokens, scope).parse();
}
