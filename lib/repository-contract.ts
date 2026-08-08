import type {
  Conference,
  ConferenceGraph,
  FunnelEvent,
  FunnelStage,
  SequenceStep,
  Speaker,
} from "@/lib/domain";
import type {
  ConferenceIntelligenceGraph,
  ResearchTask,
  ResearchTaskOutput,
  ResearchTaskStatus,
} from "@/lib/conference-intelligence";

export interface ListResearchTasksOptions {
  conferenceId?: string;
  status?: ResearchTaskStatus;
}

export interface ConferenceRepository {
  initialize(): Promise<void>;
  replaceConference(graph: ConferenceGraph | ConferenceIntelligenceGraph): Promise<void>;
  listConferences(): Promise<Conference[]>;
  getConference(id: string): Promise<Conference | null>;
  getSpeaker(id: string): Promise<Speaker | null>;
  listSpeakers(conferenceId?: string): Promise<Speaker[]>;
  listSequence(speakerId: string): Promise<SequenceStep[]>;
  listFunnelEvents(): Promise<FunnelEvent[]>;
  advanceSpeaker(speakerId: string, targetStage: FunnelStage): Promise<FunnelEvent>;
  listResearchTasks(options?: ListResearchTasksOptions): Promise<ResearchTask[]>;
  claimResearchTask(agentId: string, conferenceId?: string): Promise<ResearchTask | null>;
  completeResearchTask(
    taskId: string,
    agentId: string,
    output: ResearchTaskOutput,
  ): Promise<ResearchTask>;
  close(): Promise<void>;
}

export type SpeakerSignalRepository = ConferenceRepository;
