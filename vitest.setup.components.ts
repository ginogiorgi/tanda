// Setup del proyecto `components` (React Testing Library sobre happy-dom).
// - Matchers de jest-dom (`toBeInTheDocument`, `toBeDisabled`…) tipados para Vitest.
// - `cleanup` explícito: sin `globals: true`, RTL no registra su afterEach solo.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
