/**
 * A reference field's pickers (T235, AC-224; direction.md §7b, "Reference
 * fields … use member pickers, never free text"), as the prototype draws them
 * (docs/design/prototype/model.js, `ref` and `refs`): a select for one
 * reference, and for a list, a toggle for each member it may name — numbered
 * where the order is the meaning, with "All (*)" where every member may be
 * named at once. A name the model no longer has stays shown, picked, until it
 * is taken away: nothing written is hidden or lost.
 */

const unique = (names: readonly string[]) => [...new Set(names)];

export function MemberSelect({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string | undefined;
  options: readonly string[];
  onChange: (next: string | undefined) => void;
}) {
  return (
    <select
      id={id}
      className="model-picker__select"
      value={value ?? ''}
      onChange={(event) => {
        onChange(event.target.value === '' ? undefined : event.target.value);
      }}
    >
      <option value="">(not set)</option>
      {unique([...options, ...(value === undefined ? [] : [value])]).map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

export function MemberChips({
  labelId,
  value,
  options,
  ordered = false,
  star = false,
  canonical = (name) => name,
  onChange,
}: {
  /** The field's label, which names the group. */
  labelId: string;
  /** The names picked, or `"*"` for every member. */
  value: readonly string[] | '*' | undefined;
  options: readonly string[];
  /** Numbered as picked: the order is the meaning (a hierarchy's levels). */
  ordered?: boolean;
  /** Offers "All (*)" (a view's includes). */
  star?: boolean;
  /**
   * The member a name refers to, however it is spelled — a cube's own
   * `CUBE.count` is its `count` (research/cube/rollup-references.md) — so a
   * member written one way is shown picked, once.
   */
  canonical?: (name: string) => string;
  onChange: (next: readonly string[] | '*' | undefined) => void;
}) {
  const all = value === '*';
  const picked = Array.isArray(value) ? value : [];
  const pickedAt = (name: string) =>
    picked.findIndex((each) => canonical(each) === canonical(name));
  const unpicked = options.filter((name) => pickedAt(name) < 0);
  /**
   * Each member once, picked ones as the file writes them. Where the order is
   * the meaning, the picked come first, in it, so it is the order read out;
   * otherwise each stays where the model has it, the rest after.
   */
  const shown = ordered
    ? [...picked, ...unpicked]
    : [
        ...options.map((name) => picked[pickedAt(name)] ?? name),
        ...picked.filter(
          (name) => !options.some((option) => canonical(option) === canonical(name)),
        ),
      ];
  const toggle = (name: string) => {
    const next =
      pickedAt(name) >= 0
        ? picked.filter((each) => canonical(each) !== canonical(name))
        : [...picked, name];
    onChange(next.length === 0 ? undefined : next);
  };
  return (
    <div className="model-picker" role="group" aria-labelledby={labelId}>
      {star ? (
        <button
          type="button"
          className="model-picker__chip"
          aria-pressed={all}
          onClick={() => {
            onChange(all ? undefined : '*');
          }}
        >
          All (*)
        </button>
      ) : null}
      {unique(shown).map((name) => {
        const at = pickedAt(name);
        return (
          <button
            key={name}
            type="button"
            className="model-picker__chip"
            aria-pressed={at >= 0}
            onClick={() => {
              toggle(name);
            }}
          >
            {ordered && at >= 0 ? (
              // Seen, not read out: the picked come first, in their order.
              <span className="model-picker__order" aria-hidden="true">
                {at + 1}
              </span>
            ) : null}
            {name}
          </button>
        );
      })}
      {shown.length === 0 ? (
        <span className="model-picker__none">Nothing to pick in the model</span>
      ) : null}
    </div>
  );
}
