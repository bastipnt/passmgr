import { setProjectAnnotations } from "@storybook/react-vite";
import preview from "./preview";

// Applies preview.ts (its addons included, a11y too) to stories run as Vitest tests.
setProjectAnnotations(preview.composed);
