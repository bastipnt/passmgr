import {
  type ComboboxInputOptions,
  comboboxInputProps,
  Listbox,
  ListboxGroup,
  ListboxOption,
} from "@repo/ui/components/Combobox";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

const FRUITS = ["Apple", "Banana", "Cherry"];

function Fruits({
  wrap,
  onSelect = () => {},
  onEscape = () => {},
  onKeyDown,
}: Pick<ComboboxInputOptions, "wrap" | "onKeyDown"> & {
  onSelect?: (fruit: string) => void;
  onEscape?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(-1);
  return (
    <>
      <input
        aria-label="Fruit"
        {...comboboxInputProps({
          listboxId: "fruits",
          open,
          count: FRUITS.length,
          activeIndex: active,
          onActiveIndexChange: setActive,
          wrap,
          onSelect: (index) => onSelect(FRUITS[index] ?? ""),
          onEscape: () => {
            setOpen(false);
            onEscape();
          },
          onKeyDown,
        })}
      />
      {open && (
        <Listbox id="fruits" aria-label="Fruits">
          <ListboxGroup aria-label="All">
            {FRUITS.map((fruit, index) => (
              <ListboxOption
                key={fruit}
                index={index}
                selected={index === active}
                onClick={() => onSelect(fruit)}
              >
                {fruit}
              </ListboxOption>
            ))}
          </ListboxGroup>
        </Listbox>
      )}
    </>
  );
}

const activeOption = () => {
  const id = screen.getByRole("combobox").getAttribute("aria-activedescendant");
  return id ? document.getElementById(id)?.textContent : undefined;
};

describe("Combobox", () => {
  it("wires the field to the listbox and its options", () => {
    render(<Fruits />);
    const field = screen.getByRole("combobox", { name: "Fruit" });
    expect(field).toHaveAttribute("aria-autocomplete", "list");
    expect(field).toHaveAttribute("aria-expanded", "true");
    expect(field).toHaveAttribute("aria-controls", "fruits");
    expect(field).not.toHaveAttribute("aria-activedescendant");
    expect(screen.getByRole("listbox", { name: "Fruits" })).toHaveAttribute("id", "fruits");
    expect(screen.getByRole("group", { name: "All" })).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.id)).toEqual(["fruits-0", "fruits-1", "fruits-2"]);
    expect(options[0]).toHaveAttribute("tabindex", "-1");
  });

  it("walks the options with the arrow keys, stopping at the ends", async () => {
    const user = userEvent.setup();
    render(<Fruits />);
    await user.click(screen.getByRole("combobox"));

    await user.keyboard("{ArrowDown}");
    expect(activeOption()).toBe("Apple");
    expect(screen.getByRole("option", { name: "Apple" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(activeOption()).toBe("Cherry");
    await user.keyboard("{ArrowUp}");
    expect(activeOption()).toBe("Banana");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(activeOption()).toBe("Apple");
  });

  it("starts at the first option on ↑ from no highlight without `wrap`", async () => {
    const user = userEvent.setup();
    render(<Fruits />);
    await user.click(screen.getByRole("combobox"));

    await user.keyboard("{ArrowUp}");
    expect(activeOption()).toBe("Apple");
  });

  it("wraps past the ends with `wrap`", async () => {
    const user = userEvent.setup();
    render(<Fruits wrap />);
    await user.click(screen.getByRole("combobox"));

    await user.keyboard("{ArrowUp}");
    expect(activeOption()).toBe("Cherry");
    await user.keyboard("{ArrowDown}");
    expect(activeOption()).toBe("Apple");
    await user.keyboard("{ArrowUp}");
    expect(activeOption()).toBe("Cherry");
    await user.keyboard("{ArrowDown}");
    expect(activeOption()).toBe("Apple");
  });

  it("selects the highlighted option on Enter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Fruits onSelect={onSelect} />);
    await user.click(screen.getByRole("combobox"));

    await user.keyboard("{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("Banana");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onEscape = vi.fn();
    render(<Fruits onEscape={onEscape} />);
    await user.click(screen.getByRole("combobox"));

    await user.keyboard("{Escape}");
    expect(onEscape).toHaveBeenCalledOnce();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    const field = screen.getByRole("combobox");
    expect(field).toHaveAttribute("aria-expanded", "false");
    expect(field).not.toHaveAttribute("aria-controls");
  });

  it("leaves a key the caller's onKeyDown handled alone", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Fruits
        onSelect={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
      />,
    );
    await user.click(screen.getByRole("combobox"));

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps focus in the field when an option is pressed", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Fruits onSelect={onSelect} />);
    const field = screen.getByRole("combobox");
    await user.click(field);

    const cherry = screen.getByRole("option", { name: "Cherry" });
    expect(fireEvent.pointerDown(cherry)).toBe(false);
    await user.click(cherry);
    expect(onSelect).toHaveBeenCalledWith("Cherry");
    expect(field).toHaveFocus();
  });
});
