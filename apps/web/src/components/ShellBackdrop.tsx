/**
 * The dimmed light field behind every signed-in screen. Phones have no glass
 * panels, so it also veils the field with their fill: the ground there
 * matches the inside of a desktop panel. Render it as the first child of a
 * root with `isolate`.
 */
export default function ShellBackdrop() {
  return (
    <div
      className="light-field [--field-opacity:0.28] [--field-veil:var(--glass-fill)]"
      aria-hidden
    />
  );
}
