import type {
  DiscoveryConfidence,
  DiscoverySection,
} from "#/constants/onboarding-control";

/**
 * A single thing the onboarding agent learned.
 *
 * `confidence` is carried in the data rather than in the phrasing on purpose:
 * an inferred fact played back as though the user had said it is how an
 * assistant loses someone's trust, and by the time anyone notices, the wrong
 * fact has already shaped the setup.
 */
export interface DiscoveryFact {
  /** Stable key, so a correction updates the fact instead of contradicting it. */
  key: string;
  section: DiscoverySection;
  text: string;
  confidence: DiscoveryConfidence;
  /** Where it came from -- normally the conversation id. */
  source?: string;
  at: string;
}

/**
 * The durable record of what this company is like.
 *
 * The typed sections are what the agent distils; `facts` is the raw interview
 * record it distilled from. Keeping both means a later agent can either read
 * the summary or go back to what was actually said.
 */
export interface CompanyProfile {
  schemaVersion: 1;
  orgId: string;
  org: {
    name?: string;
    size?: string;
    industry?: string;
  };
  stack: {
    languages: string[];
    frameworks: string[];
    buildTools: string[];
    packageManagers: string[];
  };
  delivery: {
    branchingModel?: string;
    reviewPolicy?: string;
    environments: string[];
    releaseCadence?: string;
  };
  team: {
    engineers?: number;
    squads: string[];
    timezones: string[];
  };
  constraints: {
    compliance: string[];
    dataResidency?: string;
    airGapped?: boolean;
    changeControl?: string;
  };
  conventions: {
    commitStyle?: string;
    testFramework?: string;
    docsHome?: string;
  };
  facts: DiscoveryFact[];
  meta: {
    /**
     * The setup conversation. Stored on the org rather than in the browser so
     * onboarding survives a reload, an OAuth round-trip, a different device,
     * and being finished by a different colleague.
     */
    setupConversationId?: string;
    completedAt?: string;
    createdAt: string;
    updatedAt: string;
    updatedBy: string;
    revision: number;
  };
}

export function createEmptyCompanyProfile(
  orgId: string,
  now: string,
): CompanyProfile {
  return {
    schemaVersion: 1,
    orgId,
    org: {},
    stack: {
      languages: [],
      frameworks: [],
      buildTools: [],
      packageManagers: [],
    },
    delivery: { environments: [] },
    team: { squads: [], timezones: [] },
    constraints: { compliance: [] },
    conventions: {},
    facts: [],
    meta: { createdAt: now, updatedAt: now, updatedBy: "", revision: 0 },
  };
}

/** Sections in the order the interview naturally moves through them. */
export const COMPANY_PROFILE_SECTION_ORDER: DiscoverySection[] = [
  "org",
  "stack",
  "delivery",
  "team",
  "constraints",
  "conventions",
];
