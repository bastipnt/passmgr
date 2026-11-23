import { AVATAR_TILE, type AvatarTileSize } from "@repo/ui-shared";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecordTypeTile } from "./RecordAvatar";
import { WebsiteAvatar } from "./WebsiteAvatar";

const sizes = Object.keys(AVATAR_TILE) as AvatarTileSize[];

/** The Tailwind classes that draw `AVATAR_TILE[size]` (mobile reads the px directly). */
function tileClasses(size: AvatarTileSize): string[] {
  const { box, radius } = AVATAR_TILE[size];
  const edge = box % 4 === 0 ? `size-${box / 4}` : `size-[${box / 16}rem]`;
  const named: Record<number, string> = { 12: "rounded-xl", 16: "rounded-2xl" };
  return [edge, named[radius] ?? `rounded-[${radius}px]`];
}

describe.each(sizes)("avatar tile %s", (size) => {
  it("WebsiteAvatar has the shared edge and radius", () => {
    const { container } = render(<WebsiteAvatar title="GitHub" websites={[]} size={size} />);
    const classes = (container.firstElementChild as HTMLElement).classList;

    for (const cls of tileClasses(size)) expect(classes).toContain(cls);
  });

  it("RecordTypeTile has the shared edge and radius", () => {
    const { container } = render(<RecordTypeTile type="note" size={size} />);
    const classes = (container.firstElementChild as HTMLElement).classList;

    for (const cls of tileClasses(size)) expect(classes).toContain(cls);
  });
});
