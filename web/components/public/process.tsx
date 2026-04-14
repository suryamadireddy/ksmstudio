const processSteps = [
    {
        number: "01",
        title: "Idea",
        description: "Initial concept exploration and problem framing",
    },
    {
        number: "02",
        title: "Brief",
        description: "Structured project definition and scope alignment",
    },
    {
        number: "03",
        title: "Synthesis",
        description: "Research consolidation and insight extraction",
    },
    {
        number: "04",
        title: "PRD",
        description: "Product requirements with rationale and constraints",
    },
    {
        number: "05",
        title: "Prototype",
        description: "Interactive explorations and grounded conversations",
    },
]

export function Process() {
    return (
        <section id="process" className="bg-secondary/50 px-6 py-24 md:py-32">
            <div className="mx-auto max-w-6xl">
                <div className="mb-16">
                    <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        How We Work
                    </p>
                    <h2 className="max-w-2xl font-serif text-3xl font-normal tracking-tight text-foreground md:text-4xl">
                        A structured approach to product thinking
                    </h2>
                </div>

                <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-5">
                    {processSteps.map((step) => (
                        <div
                            key={step.number}
                            className="flex flex-col bg-card p-6 transition-colors hover:bg-secondary/80"
                        >
                            <span className="mb-4 text-xs font-medium text-accent">
                                {step.number}
                            </span>
                            <h3 className="mb-2 font-serif text-lg font-normal tracking-tight text-foreground">
                                {step.title}
                            </h3>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                {step.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
