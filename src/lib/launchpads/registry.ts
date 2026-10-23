
export type LaunchpadNetwork = "solana";

export type PartnershipStatus =
  | "not_partner"
  | "contacted"
  | "partner";

export type ReferralConfiguration =
  | {
      status: "not_configured";
      method: "none";
    }
  | {
      status: "pending_approval";
      method: "none";
    }
  | {
      status: "approved";
      method: "query_parameter";
      parameterName: string;
    }
  | {
      status: "approved";
      method: "path_segment";
    }
  | {
      status: "approved";
      method: "partner_api";
    };

export interface LaunchpadRegistryEntry {
  /** Stable internal ID. Use this for click tracking and project records. */
  id: string;
  name: string;
  network: LaunchpadNetwork;
  description: string;

  /** Official website and token-creation destination. */
  officialUrl: string;
  launchUrl: string;
  documentationUrl: string;

  /** Never describe a platform as a partner without an actual agreement. */
  partnershipStatus: PartnershipStatus;

  /** Referral tracking stays disabled until the platform permits it. */
  referral: ReferralConfiguration;

  /** Information creators can prepare in LoreForge before leaving. */
  accepts: {
    name: boolean;
    ticker: boolean;
    description: boolean;
    image: boolean;
    socialLinks: boolean;
  };

  /** Keeps external launching separate from LoreForge token deployment. */
  launchMode: "external_handoff";
}

export const LAUNCHPAD_REGISTRY: readonly LaunchpadRegistryEntry[] = [
  {
    id: "pump-fun",
    name: "Pump.fun",
    network: "solana",
    description:
      "A Solana token-creation platform for launching community-driven coins.",
    officialUrl: "https://pump.fun/",
    launchUrl: "https://pump.fun/create",
    documentationUrl: "https://pump.fun/docs/terms-and-conditions",

    partnershipStatus: "not_partner",

    referral: {
      status: "not_configured",
      method: "none",
    },

    accepts: {
      name: true,
      ticker: true,
      description: true,
      image: true,
      socialLinks: true,
    },

    launchMode: "external_handoff",
  },
  {
    id: "raydium-launchlab",
    name: "Raydium LaunchLab",
    network: "solana",
    description:
      "A Solana token-launch platform offering quick-launch and configurable launch options.",
    officialUrl: "https://raydium.io/",
    launchUrl: "https://raydium.io/launchpad/create/",
    documentationUrl:
      "https://github.com/raydium-io/raydium-docs-v1/blob/main/user-flows/creating-a-launchlab-token.mdx",

    partnershipStatus: "not_partner",

    referral: {
      status: "not_configured",
      method: "none",
    },

    accepts: {
      name: true,
      ticker: true,
      description: true,
      image: true,
      socialLinks: true,
    },

    launchMode: "external_handoff",
  },
] as const satisfies readonly LaunchpadRegistryEntry[];

/** Return only destinations currently enabled in the directory. */
export function getLaunchpads(): readonly LaunchpadRegistryEntry[] {
  return LAUNCHPAD_REGISTRY;
}

/** Find a destination using its stable internal ID. */
export function getLaunchpadById(
  id: string,
): LaunchpadRegistryEntry | undefined {
  return LAUNCHPAD_REGISTRY.find((launchpad) => launchpad.id === id);
}

/** Only approved configurations may produce referral attribution. */
export function getApprovedReferral(
  launchpad: LaunchpadRegistryEntry,
): ReferralConfiguration | null {
  return launchpad.referral.status === "approved"
    ? launchpad.referral
    : null;
}
