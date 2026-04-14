"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ArtifactType } from "@/lib/types";

type ArtifactItem = {
    artifact_type: ArtifactType;
    content_md: string;
    version: number;
};

type PublicArtifactType = "brief" | "synthesis" | "prd";

type PublicArtifactItem = {
    artifact_type: PublicArtifactType;
    content_md: string;
    version: number;
};

const PUBLIC_ARTIFACT_TYPES: PublicArtifactType[] = [
    "brief",
    "synthesis",
    "prd",
];

const ARTIFACT_LABELS: Record<PublicArtifactType, string> = {
    brief: "Problem",
    synthesis: "Research Synthesis",
    prd: "PRD",
};

function isPublicArtifactType(value: ArtifactType): value is PublicArtifactType {
    return PUBLIC_ARTIFACT_TYPES.includes(value as PublicArtifactType);
}

export function ArtifactExplorer({
    artifacts,
    defaultArtifactType = "brief",
}: {
    artifacts: ArtifactItem[];
    defaultArtifactType?: ArtifactType;
}) {
    const availableArtifacts = useMemo<PublicArtifactItem[]>(
        () =>
            artifacts
                .filter(
                    (artifact): artifact is PublicArtifactItem =>
                        isPublicArtifactType(artifact.artifact_type),
                )
                .sort(
                    (a, b) =>
                        PUBLIC_ARTIFACT_TYPES.indexOf(a.artifact_type) -
                        PUBLIC_ARTIFACT_TYPES.indexOf(b.artifact_type),
                ),
        [artifacts],
    );

    const safeDefaultType: PublicArtifactType | undefined =
        defaultArtifactType && isPublicArtifactType(defaultArtifactType)
            ? availableArtifacts.some(
                (artifact) => artifact.artifact_type === defaultArtifactType,
            )
                ? defaultArtifactType
                : availableArtifacts[0]?.artifact_type
            : availableArtifacts[0]?.artifact_type;

    const [selectedType, setSelectedType] = useState<
        PublicArtifactType | undefined
    >(safeDefaultType);

    const selectedArtifact = availableArtifacts.find(
        (artifact) => artifact.artifact_type === selectedType,
    );

    if (availableArtifacts.length === 0) {
        return null;
    }

    return (
        <section className="mt-12">
            <div className="mb-6">
                <p className="text-sm text-gray-500">Explore the Work</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Project Artifacts
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-600">
                    Select a layer of the project to explore. These are curated excerpts
                    from the working artifacts behind the case study.
                </p>
            </div>

            <div className="mb-3 flex flex-wrap gap-3">
                {availableArtifacts.map((artifact) => {
                    const isActive = artifact.artifact_type === selectedType;

                    return (
                        <button
                            key={artifact.artifact_type}
                            type="button"
                            onClick={() => setSelectedType(artifact.artifact_type)}
                            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${isActive
                                    ? "border-gray-900 bg-gray-900 text-white"
                                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                }`}
                        >
                            {ARTIFACT_LABELS[artifact.artifact_type]}
                        </button>
                    );
                })}
            </div>

            <p className="mb-6 text-sm text-gray-500">
                Select a layer of the project to explore.
            </p>

            {selectedArtifact ? (
                <div className="rounded-lg border p-6">
                    <div className="mb-4 flex items-center justify-between gap-4">
                        <h3 className="text-lg font-medium">
                            {ARTIFACT_LABELS[selectedArtifact.artifact_type]}
                        </h3>
                        <span className="text-sm text-gray-500">
                            Version {selectedArtifact.version}
                        </span>
                    </div>

                    <ReactMarkdown
                        components={{
                            h1: ({ children }) => (
                                <h1 className="mb-4 mt-0 font-serif text-2xl font-normal tracking-tight text-foreground">
                                    {children}
                                </h1>
                            ),
                            h2: ({ children }) => (
                                <h2 className="mb-3 mt-8 font-serif text-xl font-normal tracking-tight text-foreground">
                                    {children}
                                </h2>
                            ),
                            h3: ({ children }) => (
                                <h3 className="mb-2 mt-6 text-base font-semibold text-foreground">
                                    {children}
                                </h3>
                            ),
                            p: ({ children }) => (
                                <p className="my-3 text-sm leading-7 text-muted-foreground">
                                    {children}
                                </p>
                            ),
                            ul: ({ children }) => (
                                <ul className="my-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
                                    {children}
                                </ul>
                            ),
                            ol: ({ children }) => (
                                <ol className="my-4 list-decimal space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
                                    {children}
                                </ol>
                            ),
                            li: ({ children }) => <li>{children}</li>,
                            strong: ({ children }) => (
                                <strong className="font-semibold text-foreground">
                                    {children}
                                </strong>
                            ),
                        }}
                    >
                        {selectedArtifact.content_md.slice(0, 1200)}
                    </ReactMarkdown>

                    <p className="mt-4 text-xs uppercase tracking-[0.14em] text-gray-500">
                        Showing a curated excerpt of the artifact
                    </p>
                </div>
            ) : null}
        </section>
    );
}
