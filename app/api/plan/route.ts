import { NextResponse } from "next/server";
import { z } from "zod";

import { getPlanningRepository } from "@/lib/planning-repository";
import { getRepository } from "@/lib/conference-repository";

export const runtime = "nodejs";

/**
 * One endpoint for every human decision on the plan. Each action is explicit —
 * nothing here sends an email; approval only records that a person cleared a
 * draft to be sent by hand.
 */
const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("attendance"),
    conferenceId: z.string().min(1),
    status: z.enum(["attending", "undecided", "not_attending"]),
  }),
  z.object({
    action: z.literal("meet-add"),
    speakerId: z.string().min(1),
    conferenceId: z.string().min(1),
    note: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("meet-note"),
    speakerId: z.string().min(1),
    note: z.string().max(500),
  }),
  z.object({ action: z.literal("meet-remove"), speakerId: z.string().min(1) }),
  z.object({
    action: z.literal("approval"),
    stepId: z.string().min(1),
    speakerId: z.string().min(1),
    status: z.enum(["pending", "approved", "changes_requested"]),
    note: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("advance-stage"),
    speakerId: z.string().min(1),
    stage: z.string().min(1),
  }),
]);

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const planning = getPlanningRepository();
  const input = parsed.data;

  switch (input.action) {
    case "attendance":
      return NextResponse.json({
        success: true,
        attendance: planning.setAttendance(input.conferenceId, input.status),
      });

    case "meet-add":
      return NextResponse.json({
        success: true,
        entry: planning.addToMeetList(input.speakerId, input.conferenceId, input.note ?? ""),
      });

    case "meet-note":
      return NextResponse.json({
        success: true,
        entry: planning.setMeetNote(input.speakerId, input.note),
      });

    case "meet-remove":
      planning.removeFromMeetList(input.speakerId);
      return NextResponse.json({ success: true });

    case "approval":
      return NextResponse.json({
        success: true,
        approval: planning.setApproval(
          input.stepId,
          input.speakerId,
          input.status,
          input.note ?? "",
        ),
      });

    case "advance-stage":
      try {
        const event = await getRepository().advanceSpeaker(
          input.speakerId,
          input.stage as Parameters<ReturnType<typeof getRepository>["advanceSpeaker"]>[1],
        );
        return NextResponse.json({ success: true, event });
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            message: error instanceof Error ? error.message : "Could not update the stage.",
          },
          { status: 422 },
        );
      }
  }
}
