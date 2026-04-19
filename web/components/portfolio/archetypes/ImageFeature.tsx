export interface ImageFeatureContent {
  caption: string;
  image_brief: string;
  image_url?: string;
}

export function ImageFeature({ caption, image_brief, image_url }: ImageFeatureContent) {
  return (
    <section className="py-16 md:py-32">
      <div className="mx-auto max-w-6xl px-8 md:px-10">
        <div
          className="flex min-h-64 items-center justify-center rounded-sm md:min-h-96"
          style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image_url} alt={caption} className="h-full w-full rounded-sm object-cover" />
          ) : (
            <p className="max-w-sm text-center text-sm italic" style={{ color: "var(--muted)" }}>
              {image_brief}
            </p>
          )}
        </div>
        {caption && (
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            {caption}
          </p>
        )}
      </div>
    </section>
  );
}
