import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sidebar } from "@/components/sidebar";

describe("Signal Room shell", () => {
  it("renders the Signal Room identity and core navigation", () => {
    render(<Sidebar />);

    expect(screen.getByText("SPEAKER SIGNAL")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Funnel" })).toHaveAttribute("href", "/funnel");
  });
});
