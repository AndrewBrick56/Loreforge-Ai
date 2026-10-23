"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  Copy,
  Rocket,
  ShieldAlert,
  Save,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { styleLabel } from "@/lib/format";
import { getLaunchpads } from "@/lib/launchpads/registry";
import type { MyCharacterDTO } from "@/lib/characters-data";

type Draft = {
  projectName: string;
  ticker: string;
  tagline: string;
  description: string;
  xPost: string;
  telegramWelcome: string;
};

type SavedProject = {
  id: string;
  character_id: string;
  project_name: string;
  ticker: string;
  tagline: string;
  description: string;
  x_post: string;
  telegram_welcome: string;
  selected_launchpad_id: string | null;
};

function makeDraft(character: MyCharacterDTO): Draft {
  const rawTicker = character.name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

  const ticker =
    rawTicker.length >= 3
      ? rawTicker
      : `${rawTicker}LORE`.slice(0, 6) || "LORE";

  const tagline =
    character.lore?.catchphrase ||
    `Meet ${character.name}. A character with a story to tell.`;

  const description = [
    `${character.name} is an original ${styleLabel(character.style).toLowerCase()} character project.`,
    character.lore?.personality
      ? `Personality: ${character.lore.personality}`
      : "",
    character.lore?.originStory
      ? `Origin story: ${character.lore.originStory}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2500);

  return {
    projectName: character.name.slice(0, 80),
    ticker,
    tagline: tagline.slice(0, 160),
    description,
    xPost: [
      `Meet ${character.name} — an original character project.`,
      "",
      tagline,
      "",
      "We're building the brand, sharing the story, and growing our community.",
      "",
      "#Memecoin #Solana #LoreForge",
    ]
      .join("\n")
      .slice(0, 2000),
    telegramWelcome: [
      `Welcome to the ${character.name} community!`,
      "",
      tagline,
      "",
      "Follow project updates, character artwork, community events,",
      "and future launch announcements here.",
      "",
      "Crypto assets are risky. No financial returns are promised.",
    ]
      .join("\n")
      .slice(0, 2000),
  };
}

const FIELDS: {
  key: keyof Draft;
  label: string;
  rows: number;
  maxLength: number;
}[] = [
  { key: "projectName", label: "Project name", rows: 1, maxLength: 80 },
  { key: "ticker", label: "Suggested token ticker", rows: 1, maxLength: 6 },
  { key: "tagline", label: "Tagline", rows: 2, maxLength: 160 },
  {
    key: "description",
    label: "Project description",
    rows: 5,
    maxLength: 2500,
  },
  { key: "xPost", label: "X announcement draft", rows: 6, maxLength: 2000 },
  {
    key: "telegramWelcome",
    label: "Telegram welcome message",
    rows: 6,
    maxLength: 2000,
  },
];

export function LaunchKitBuilder({
  characters,
  initialCharacterId,
}: {
  characters: MyCharacterDTO[];
  initialCharacterId?: string;
}) {
  const initialCharacter =
    characters.find((item) => item.id === initialCharacterId) ?? characters[0];

  const [selectedId, setSelectedId] = useState(initialCharacter?.id ?? "");
  const [draft, setDraft] = useState<Draft | null>(() =>
    initialCharacter ? makeDraft(initialCharacter) : null,
  );
  const [feedback, setFeedback] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedLaunchpadId, setSelectedLaunchpadId] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingProject, setLoadingProject] = useState(
    Boolean(initialCharacter),
  );

  const character = characters.find((item) => item.id === selectedId);

  // Load the saved project for the selected character.
  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;

    async function loadProject() {
      try {
        const response = await fetch(
          `/api/launch-projects?characterId=${encodeURIComponent(selectedId)}`,
          { cache: "no-store" },
        );

        const data = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (!response.ok) {
          setFeedback(
            data.error ??
              "Couldn't load the saved project. Your current draft is still available.",
          );
          return;
        }

        const project = data.project as SavedProject | null;

        if (project) {
          setProjectId(project.id);
          setDraft({
            projectName: project.project_name,
            ticker: project.ticker,
            tagline: project.tagline,
            description: project.description,
            xPost: project.x_post,
            telegramWelcome: project.telegram_welcome,
          });
          setSelectedLaunchpadId(project.selected_launchpad_id ?? "");
        } else {
          const selectedCharacter = characters.find(
            (item) => item.id === selectedId,
          );

          setProjectId(null);
          setDraft(selectedCharacter ? makeDraft(selectedCharacter) : null);
          setSelectedLaunchpadId("");
        }
      } catch {
        if (!cancelled) {
          setFeedback(
            "Couldn't reach the save service. Your current draft is still available.",
          );
        }
      } finally {
        if (!cancelled) setLoadingProject(false);
      }
    }

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, [selectedId, characters]);

  const packageText = useMemo(() => {
    if (!draft || !character) return "";

    const launchpad = getLaunchpads().find(
      (item) => item.id === selectedLaunchpadId,
    );

    return `# ${draft.projectName}

Character: ${character.name}
Suggested ticker: ${draft.ticker}
Preferred launchpad: ${launchpad?.name ?? "Not selected"}

## Tagline
${draft.tagline}

## Project description
${draft.description}

## X announcement
${draft.xPost}

## Telegram welcome message
${draft.telegramWelcome}

## Before launching
- Check token name and ticker availability.
- Confirm you have rights to use the project's artwork.
- Review supply, authorities, liquidity arrangements and fees.
- Verify the network and wallet address before signing.
- Never promise buyers financial returns.

This is a launch-preparation draft. It does not create a token
or guarantee trading activity or earnings.
`;
  }, [draft, character, selectedLaunchpadId]);

  function updateField(key: keyof Draft, value: string) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setFeedback("");
  }

  function selectCharacter(id: string) {
    const next = characters.find((item) => item.id === id);

    setSelectedId(id);
    setProjectId(null);
    setDraft(next ? makeDraft(next) : null);
    setSelectedLaunchpadId("");
    setLoadingProject(Boolean(next));
    setFeedback("");
  }

  async function saveProject() {
    if (!character || !draft || saving || loadingProject) return;

    const projectName = draft.projectName.trim();

    if (!projectName || projectName.length > 80) {
      setFeedback("Project name must be between 1 and 80 characters.");
      return;
    }

    if (!/^[A-Z0-9]{3,6}$/.test(draft.ticker)) {
      setFeedback("Ticker must contain 3–6 uppercase letters or numbers.");
      return;
    }

    setSaving(true);
    setFeedback("");

    try {
      const response = await fetch("/api/launch-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          characterId: character.id,
          projectName,
          ticker: draft.ticker,
          tagline: draft.tagline,
          description: draft.description,
          xPost: draft.xPost,
          telegramWelcome: draft.telegramWelcome,
          selectedLaunchpadId: selectedLaunchpadId || null,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const tickerError = data.details?.ticker?.[0];
        setFeedback(tickerError ?? data.error ?? "Couldn't save your project.");
        return;
      }

      setProjectId(data.project.id);
      setFeedback(
        "Project saved. Your edits and launchpad preference are stored in LoreForge.",
      );
    } catch {
      setFeedback(
        "Couldn't reach LoreForge. Please check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(`${label} copied.`);
    } catch {
      setFeedback("Copy failed. Select the text and copy it manually.");
    }
  }

  function downloadPackage() {
    if (!packageText || !draft) return;

    const blob = new Blob([packageText], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const slug = draft.projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

    link.href = url;
    link.download = `${slug || "loreforge-launch-kit"}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setFeedback("Launch package downloaded.");
  }

  if (!character || !draft) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <GlassCard hover={false} className="text-center">
          <Rocket className="mx-auto text-lf-cyan" size={34} />
          <h1 className="mt-4 font-display text-2xl font-bold">
            Start with a saved character
          </h1>
          <p className="mt-3 text-sm text-lf-text-dim">
            Create and save a character before preparing its memecoin project.
          </p>
          <Link href="/create" className="mt-5 inline-block">
            <Button>Create a character</Button>
          </Link>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lf-cyan">
            Creator tools
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
            Character Launch Kit
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-lf-text-dim">
            Turn your character into a memecoin project concept with editable
            branding and community launch materials.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={saveProject}
            disabled={saving || loadingProject}
          >
            <Save size={15} />
            {saving ? "Saving..." : projectId ? "Save changes" : "Save project"}
          </Button>

          <Button
            variant="secondary"
            onClick={() => copyText(packageText, "Full package")}
          >
            <Copy size={15} /> Copy all
          </Button>

          <Button onClick={downloadPackage}>
            <ArrowDownToLine size={15} /> Download package
          </Button>
        </div>
      </div>

      <GlassCard hover={false} className="mb-6">
        <label
          htmlFor="launch-character"
          className="mb-2 block text-sm font-semibold"
        >
          Choose a saved character
        </label>

        <select
          id="launch-character"
          value={selectedId}
          onChange={(event) => selectCharacter(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm"
        >
          {characters.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <p className="mt-2 text-xs text-lf-text-dim">
          {styleLabel(character.style)}
        </p>

        <div className="mt-5">
          <label
            htmlFor="launchpad-destination"
            className="mb-2 block text-sm font-semibold"
          >
            Preferred launchpad
          </label>

          <select
            id="launchpad-destination"
            value={selectedLaunchpadId}
            onChange={(event) => setSelectedLaunchpadId(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm"
          >
            <option value="">Choose later</option>
            {getLaunchpads().map((launchpad) => (
              <option key={launchpad.id} value={launchpad.id}>
                {launchpad.name} — Solana
              </option>
            ))}
          </select>

          <p className="mt-2 text-xs leading-5 text-lf-text-dim">
            Choosing a launchpad saves your preference. It does not deploy a
            token or imply an official LoreForge partnership.
          </p>
        </div>

        {loadingProject && (
          <p role="status" className="mt-3 text-xs text-lf-text-dim">
            <Sparkles className="mr-1 inline" size={13} />
            Loading your saved project…
          </p>
        )}
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          {FIELDS.map((field) => (
            <GlassCard key={field.key} hover={false}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <label
                  htmlFor={`launch-${field.key}`}
                  className="text-sm font-semibold"
                >
                  {field.label}
                </label>

                <Button
                  variant="ghost"
                  className="px-3 py-2 text-xs"
                  onClick={() => copyText(draft[field.key], field.label)}
                >
                  <Copy size={13} /> Copy
                </Button>
              </div>

              {field.rows === 1 ? (
                <input
                  id={`launch-${field.key}`}
                  value={draft[field.key]}
                  maxLength={field.maxLength}
                  disabled={loadingProject}
                  onChange={(event) =>
                    updateField(
                      field.key,
                      field.key === "ticker"
                        ? event.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, "")
                            .slice(0, 6)
                        : event.target.value,
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm disabled:opacity-60"
                />
              ) : (
                <textarea
                  id={`launch-${field.key}`}
                  rows={field.rows}
                  maxLength={field.maxLength}
                  value={draft[field.key]}
                  disabled={loadingProject}
                  onChange={(event) =>
                    updateField(field.key, event.target.value)
                  }
                  className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm leading-6 disabled:opacity-60"
                />
              )}
            </GlassCard>
          ))}
        </div>

        <aside className="space-y-5">
          <GlassCard hover={false}>
            {character.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={character.coverUrl}
                alt={character.name}
                className="aspect-square w-full rounded-xl object-cover"
              />
            ) : (
              <div className="grid aspect-square place-items-center rounded-xl bg-black/30 text-sm text-lf-text-dim">
                No image available
              </div>
            )}

            <h2 className="mt-4 font-display text-lg font-bold">
              {draft.projectName || "Untitled project"}
            </h2>

            <p className="mt-2 text-sm text-lf-text-dim">{draft.tagline}</p>

            <Link
              href={`/c/${character.id}`}
              className="mt-4 inline-block text-sm text-lf-cyan hover:underline"
            >
              View character →
            </Link>
          </GlassCard>

          <GlassCard hover={false}>
            <ShieldAlert className="text-amber-300" size={22} />
            <h2 className="mt-3 font-semibold">Before launching</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-lf-text-dim">
              <li>The ticker is a suggestion, not verified availability.</li>
              <li>This page does not deploy a token or create liquidity.</li>
              <li>Never promise buyers financial returns.</li>
              <li>
                Review fees, authorities and launch settings before signing.
              </li>
              <li>Never share your seed phrase or private key.</li>
            </ul>
          </GlassCard>
        </aside>
      </div>

      {feedback && (
        <p role="status" className="mt-5 text-sm text-lf-cyan">
          {feedback}
        </p>
      )}

      <p className="mt-8 text-xs leading-5 text-lf-text-faint">
        This is a preparation tool. Save your edits to keep them in LoreForge.
        No token is deployed and no earnings are promised.
      </p>
    </div>
  );
}
