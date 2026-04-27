"use client";

export interface ConversationInvitationContent {
  intro: string;
  prompt_suggestions: string[];
}

export function ConversationInvitation({
  intro,
  prompt_suggestions,
}: ConversationInvitationContent) {
  if (
    typeof intro !== "string" ||
    !prompt_suggestions ||
    !Array.isArray(prompt_suggestions) ||
    prompt_suggestions.some((s) => typeof s !== "string")
  ) {
    return null;
  }

  return (
    <section className="py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-8 md:px-10">
        <div className="max-w-xl">
          <div
            className="mb-8 h-px w-12"
            style={{ backgroundColor: "var(--accent)" }}
          />
          <p
            className="mb-8 text-lg leading-relaxed font-normal"
            style={{ color: "var(--fg)" }}
          >
            {intro}
          </p>
          {prompt_suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {prompt_suggestions.map((s, i) => (
                <span
                  key={i}
                  className="cursor-default rounded-full border px-4 py-2 text-sm transition-colors"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--muted)",
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          <div id="chat-anchor" className="mt-12" />
        </div>
      </div>
    </section>
  );
}
