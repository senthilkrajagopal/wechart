/**
 * Dashboard parameters (F46, AC-531, direction.md rule 137).
 *
 * A parameter is a typed object on the dashboard, not a string substituted
 * into an expression, so a bookmark, a link, a chart's well and a Text tile's
 * control can each name it by its id (design 21 screen 3). It is a field
 * switch — the only kind R80 takes now ("Field switch now, what-if later") —
 * choosing which measure or which dimension the things bound to it use.
 *
 * Here, in core, because the browser writes it and the API stores it, and
 * both have to agree on what a well-formed one is.
 */

/** R80's "1,000 values", Spotfire's and Power BI's cap (design 21 S3 pin 5). */
export const PARAMETER_CHOICE_LIMIT = 1000;

/** What a field switch switches: a measure (a Metrics well) or a dimension. */
export type ParameterRole = 'measure' | 'dimension';

export interface ParameterChoice {
  /** A member of one of the dashboard's cubes, picked, never typed. */
  readonly member: string;
  /** What the parameter's control shows for it. */
  readonly label: string;
}

export interface DashboardParameter {
  readonly id: string;
  readonly name: string;
  /** The only kind now; value (what-if) parameters come later (R80). */
  readonly kind: 'fieldSwitch';
  readonly role: ParameterRole;
  /** In the order the control shows them; at most 1,000. */
  readonly choices: readonly ParameterChoice[];
  /** The member every reader starts at; one of the choices. */
  readonly default: string;
}

const MEMBER = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const SHAPE = 'A parameter is a field switch, with an id, a name, a role, choices and a default.';

const count = (value: number) => value.toLocaleString('en-US');

function isShaped(value: unknown): value is DashboardParameter {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'] !== '' &&
    typeof value['name'] === 'string' &&
    value['kind'] === 'fieldSwitch' &&
    (value['role'] === 'measure' || value['role'] === 'dimension') &&
    Array.isArray(value['choices']) &&
    value['choices'].every(
      (choice: unknown) =>
        isRecord(choice) &&
        typeof choice['member'] === 'string' &&
        typeof choice['label'] === 'string',
    ) &&
    typeof value['default'] === 'string'
  );
}

/**
 * Everything wrong with one parameter, each named, or none.
 *
 * `roleOf` says whether a member is a measure or a dimension, where the
 * model is at hand (the settings form has it; a stored document alone does
 * not). Without it, a choice of the other role can't be told and isn't
 * refused here.
 */
export function dashboardParameterProblems(
  value: unknown,
  roleOf?: (member: string) => ParameterRole | undefined,
): readonly string[] {
  if (!isShaped(value)) return [SHAPE];
  const problems: string[] = [];
  const name = value.name.trim();
  if (name === '') return ['A parameter needs a name.'];
  const called = `“${name}”`;
  const { choices } = value;
  if (choices.length === 0) return [`${called} has no choices; pick at least one.`];
  if (choices.length > PARAMETER_CHOICE_LIMIT)
    return [
      `${called} has ${count(choices.length)} choices; a parameter holds at most ${count(PARAMETER_CHOICE_LIMIT)}.`,
    ];
  const seen = new Set<string>();
  for (const choice of choices) {
    if (!MEMBER.test(choice.member)) {
      problems.push(`${called}’s choice ${choice.member} isn’t a member, cube.member.`);
      seen.add(choice.member);
      continue;
    }
    if (seen.has(choice.member)) problems.push(`${called} lists ${choice.member} twice.`);
    seen.add(choice.member);
    if (choice.label.trim() === '')
      problems.push(`${called}’s choice ${choice.member} needs a label.`);
    const role = roleOf?.(choice.member);
    if (role !== undefined && role !== value.role)
      problems.push(
        `${called} switches a ${value.role}, and its choice ${choice.label} (${choice.member}) is a ${role}.`,
      );
  }
  if (!seen.has(value.default))
    problems.push(`${called} defaults to ${value.default}, which isn’t one of its choices.`);
  return problems;
}

/** A dashboard's parameters as a set: each id and each name once. */
export function dashboardParametersProblems(parameters: unknown): readonly string[] {
  if (parameters === undefined) return [];
  if (!Array.isArray(parameters)) return ['A dashboard’s parameters are a list.'];
  const problems: string[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const parameter of parameters as unknown[]) {
    if (!isShaped(parameter)) continue;
    if (ids.has(parameter.id)) problems.push(`Two parameters have the id ${parameter.id}.`);
    ids.add(parameter.id);
    const name = parameter.name.trim().toLowerCase();
    if (names.has(name)) problems.push(`Two parameters are named “${parameter.name.trim()}”.`);
    names.add(name);
  }
  return problems;
}

/**
 * The member a parameter stands for now: the reader's choice while it is one
 * of its choices, its default otherwise — a link or bookmark naming a choice
 * since removed opens at the default rather than at nothing (AC-534).
 */
export function parameterValueOf(
  parameter: DashboardParameter,
  chosen: string | undefined,
): string {
  return chosen !== undefined && parameter.choices.some((choice) => choice.member === chosen)
    ? chosen
    : parameter.default;
}

const REF = 'parameter:';

/**
 * How a dashboard-local chart's well holds a parameter (AC-533): in the
 * member's place, `parameter:‹id›` — never a member, which always has a dot
 * after its cube and nothing but letters, digits and `_` before it — so the
 * well keeps its order and its other members as they are.
 */
export function parameterRef(id: string): string {
  return `${REF}${id}`;
}

/** The parameter a well's entry follows, or none for a member. */
export function parameterIdOf(entry: string): string | undefined {
  return entry.startsWith(REF) && entry.length > REF.length ? entry.slice(REF.length) : undefined;
}

/** The choice a parameter stands for now, with its label. */
export function parameterChoiceOf(
  parameter: DashboardParameter,
  chosen: string | undefined,
): ParameterChoice | undefined {
  const member = parameterValueOf(parameter, chosen);
  return parameter.choices.find((choice) => choice.member === member);
}
