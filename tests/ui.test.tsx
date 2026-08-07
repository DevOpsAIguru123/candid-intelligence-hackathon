import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { getDemoConference } from "@/data/demo-conference";
import { FunnelChart } from "@/components/funnel-chart";
import { IngestForm } from "@/components/ingest-form";
import { ScoreBadge } from "@/components/score-badge";
import { Sidebar } from "@/components/sidebar";
import { calculateFunnel } from "@/lib/funnel";

describe("Signal Room shell", () => {
  it("renders the Signal Room identity and core navigation", () => {
    render(<Sidebar />);

    expect(screen.getByText("SPEAKER SIGNAL")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Funnel" })).toHaveAttribute("href", "/funnel");
  });
});

describe("Signal Room product components", () => {
  it("renders every funnel stage with conversion context", () => {
    const metrics = calculateFunnel(getDemoConference().funnelEvents);

    render(<FunnelChart metrics={metrics} />);

    expect(screen.getAllByTestId("funnel-stage")).toHaveLength(8);
    expect(screen.getByText("Conversation booked")).toBeInTheDocument();
  });

  it("makes high-priority scores explicit", () => {
    render(<ScoreBadge score={94} />);

    expect(screen.getByLabelText("ICP score 94, high priority")).toBeInTheDocument();
  });

  it("offers live URL analysis and an explicit demo action", () => {
    render(<IngestForm />);

    expect(screen.getByLabelText("Conference URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze conference" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load demo conference" })).toBeInTheDocument();
  });
});
