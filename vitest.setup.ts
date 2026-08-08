import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without globals here, so Testing Library's automatic teardown
// never registers and rendered trees would otherwise leak between tests.
afterEach(cleanup);
