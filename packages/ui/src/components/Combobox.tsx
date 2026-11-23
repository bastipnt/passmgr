import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { type ComponentProps, createContext, type KeyboardEvent, use } from "react";

// Focus stays in the field (`aria-activedescendant`). Not Base UI's `Combobox`: callers own the
// highlight and what Enter / Esc do (previews, history entries, tag toggles).

export function optionDomId(listboxId: string, index: number) {
  return `${listboxId}-${index}`;
}

export type ComboboxInputOptions = {
  listboxId: string;
  open: boolean;
  /** The listbox stays mounted while closed, so the field always points at it. */
  persistentListbox?: boolean;
  count?: number;
  /** The highlighted option, `-1` for none. */
  activeIndex?: number;
  /** Leave it out and ↑ / ↓ move the caret, as in a plain field. */
  onActiveIndexChange?: (index: number) => void;
  /** ↑ / ↓ go round past the ends instead of stopping at them. */
  wrap?: boolean;
  /** Enter on the highlighted option. */
  onSelect?: (index: number) => void;
  /** Decides itself whether to `preventDefault` (an Esc left alone may close an overlay). */
  onEscape?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Runs first; a key it calls `preventDefault` on is left alone. */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
};

type ComboboxInputProps = Pick<
  ComponentProps<"input">,
  | "role"
  | "aria-autocomplete"
  | "aria-expanded"
  | "aria-controls"
  | "aria-activedescendant"
  | "onKeyDown"
>;

/** Spread on the field's `<input>`. */
export function comboboxInputProps({
  listboxId,
  open,
  persistentListbox = false,
  count = 0,
  activeIndex = -1,
  onActiveIndexChange,
  wrap = false,
  onSelect,
  onEscape,
  onKeyDown,
}: ComboboxInputOptions): ComboboxInputProps {
  return {
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": open,
    "aria-controls": open || persistentListbox ? listboxId : undefined,
    "aria-activedescendant":
      open && activeIndex >= 0 ? optionDomId(listboxId, activeIndex) : undefined,
    onKeyDown: (event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;
      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp": {
          if (!onActiveIndexChange || count === 0) return;
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          if (activeIndex < 0) onActiveIndexChange(wrap && step < 0 ? count - 1 : 0);
          else
            onActiveIndexChange(
              wrap
                ? (activeIndex + step + count) % count
                : Math.max(0, Math.min(count - 1, activeIndex + step)),
            );
          return;
        }
        case "Enter":
          if (!onSelect || activeIndex < 0 || activeIndex >= count) return;
          event.preventDefault();
          onSelect(activeIndex);
          return;
        case "Escape":
          onEscape?.(event);
      }
    },
  };
}

const ListboxContext = createContext<string | null>(null);

/** The combobox's results; `id` is the field's `listboxId`. */
export function Listbox({
  id,
  render,
  ...props
}: useRender.ComponentProps<"div"> & { id: string }) {
  const element = useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">({ id, role: "listbox" }, props),
  });
  return <ListboxContext value={id}>{element}</ListboxContext>;
}

/** A labelled section of the results (`aria-label` / `aria-labelledby`). */
export function ListboxGroup({ render, ...props }: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">({ role: "group" }, props),
  });
}

const keepFieldFocus = (event: { preventDefault: () => void }) => event.preventDefault();

/**
 * One result; `index` is its place among all the listbox's options (the field's `activeIndex`).
 * The field handles the keys, so a press must not take focus (or a phone's keyboard) from it.
 */
export function ListboxOption({
  index,
  selected,
  render,
  ...props
}: useRender.ComponentProps<"div"> & { index: number; selected: boolean | undefined }) {
  const listboxId = use(ListboxContext);
  if (listboxId === null) throw new Error("ListboxOption needs a Listbox");
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(
      {
        id: optionDomId(listboxId, index),
        role: "option",
        "aria-selected": selected,
        tabIndex: -1,
        onPointerDown: keepFieldFocus,
      },
      props,
    ),
  });
}

/** Around the listbox and its extras (scope, hints, buttons): a press in it keeps focus in the field. */
export function ComboboxPanel({ render, ...props }: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">({ onMouseDown: keepFieldFocus }, props),
  });
}
