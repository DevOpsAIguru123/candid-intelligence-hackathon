import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { getConferenceSeries } from "@/data/conference-series";
import { getDemoConference } from "@/data/demo-conference";
import { CalendarBoard } from "@/components/calendar-board";
import { FunnelChart } from "@/components/funnel-chart";
import { DraftApproval } from "@/components/plan-controls";
import { SpeakerTable } from "@/components/speaker-table";
import { buildCalendar, summarizeCalendar } from "@/lib/calendar";
import { calculateFunnel } from "@/lib/funnel";

/**
 * These cover behaviour that would break quietly. Tests that only restated a
 * button label were removed — renaming copy is not a regression, and the demo
 * journey in e2e/ already proves the screens render.
 */

describe("Outreach progress", () => {
  it("shows every step of the funnel so a gap in the middle is visible", () => {
    render(<FunnelChart metrics={calculateFunnel(getDemoConference().funnelEvents)} />);

    expect(screen.getAllByTestId("funnel-stage")).toHaveLength(8);
    expect(screen.getByText("Conversation booked")).toBeInTheDocument();
  });
});

describe("Draft approval", () => {
  it("offers approve or reject, never a way to send", () => {
    render(<DraftApproval speakerId="s1" status="pending" stepId="step-1" />);

    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send/i })).not.toBeInTheDocument();
  });

  it("replaces approve with undo once a person has cleared the draft", () => {
    render(<DraftApproval speakerId="s1" status="approved" stepId="step-1" />);

    expect(screen.getByText("Approved to send")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });
});

describe("Speaker workspace", () => {
  const base = {
    id: "s1",
    name: "Robert Henderson",
    title: "Director Electrical Engineering and Controls",
    company: "Liberty Energy",
    sessionTitle: "Engineering Onsite Power for AI Data Centers",
    score: 90,
    stage: null,
    stageLabel: "not started",
    nextStage: "identified" as const,
    nextStageLabel: "found",
    onMeetList: false,
  };

  it("shows when and where a speaker is on, once the agenda supplies it", () => {
    render(
      <SpeakerTable
        conferenceId="c1"
        speakers={[
          {
            ...base,
            sessionWhen: "Tue, Sep 22 · 8:45 AM",
            sessionRoom: "Longhorn B",
            sessionTrack: "Onsite Power",
          },
        ]}
      />,
    );

    expect(screen.getByText("Tue, Sep 22 · 8:45 AM · Longhorn B · Onsite Power")).toBeInTheDocument();
  });

  it("marks a paid sponsor slot so it is not read as an earned one", () => {
    render(
      <SpeakerTable conferenceId="c1" speakers={[{ ...base, sponsorSlot: true }]} />,
    );

    expect(screen.getByText("Sponsor slot")).toBeInTheDocument();
  });

  it("stays clean when the source published no agenda detail", () => {
    render(<SpeakerTable conferenceId="c1" speakers={[base]} />);

    expect(screen.getByText(base.sessionTitle)).toBeInTheDocument();
    expect(screen.queryByText("Sponsor slot")).not.toBeInTheDocument();
  });
});

describe("Conference calendar board", () => {
  const now = new Date("2026-08-08T12:00:00.000Z");
  const demo = getDemoConference();

  function payload() {
    const entries = buildCalendar({
      series: getConferenceSeries(),
      conferences: [demo.conference],
      speakers: demo.speakers,
      now,
    });
    return { generatedAt: now.toISOString(), summary: summarizeCalendar(entries), entries };
  }

  it("lists every watched event and separates read agendas from expected dates", () => {
    render(<CalendarBoard initial={payload()} />);

    expect(screen.getAllByTestId("calendar-entry")).toHaveLength(getConferenceSeries().length + 1);
    expect(screen.getByText("SPEAKERS PUBLISHED")).toBeInTheDocument();
    expect(screen.getByText("dates confirmed")).toBeInTheDocument();
    expect(screen.getAllByText("dates expected")).toHaveLength(getConferenceSeries().length);
  });

  it("keeps the month view behind a trigger and opens it on demand", () => {
    render(<CalendarBoard initial={payload()} />);
    expect(screen.queryByTestId("month-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /month view/i }));

    const dialog = screen.getByTestId("month-dialog");
    expect(within(dialog).getByText("August 2026")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close month view" }));
    expect(screen.queryByTestId("month-dialog")).not.toBeInTheDocument();
  });
});
