import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { useOneShotParam } from "./use-one-shot-param";

function Probe() {
  return <p>{useOneShotParam("generate") ? "asked" : "not asked"}</p>;
}

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <Probe />
    </Router>,
  );
  return location;
}

describe("useOneShotParam", () => {
  it("reports the flag it mounted with and drops it from the URL, keeping the rest", async () => {
    const location = renderAt("/record/a/edit?generate&tab=x");

    await waitFor(() => expect(location.history.at(-1)).toBe("/record/a/edit?tab=x"));
    expect(screen.getByText("asked")).toBeInTheDocument();
    expect(location.history).toHaveLength(1);
  });

  it("is false without the flag", () => {
    renderAt("/record/a/edit");
    expect(screen.getByText("not asked")).toBeInTheDocument();
  });
});
