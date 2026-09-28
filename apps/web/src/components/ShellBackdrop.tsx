/**
 * The dimmed light field behind every signed-in screen. Phones have no glass
 * panels, so it also lays their fill over the whole screen: the ground there
 * matches the inside of a desktop panel. Render it in a root with `isolate`.
 */
export default function ShellBackdrop() {
  return (
    <>
      <div className="light-field [--field-opacity:0.28]" aria-hidden />
      <div
        className="pointer-events-none fixed inset-x-0 -inset-y-40 -z-1 bg-(--glass-fill) sm:hidden"
        aria-hidden
      />
    </>
  );
}
