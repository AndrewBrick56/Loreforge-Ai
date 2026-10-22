const STEPS = [
  {
    n: "01",
    title: "Upload a photograph",
    body: "Any animal, person or object. This is the visual anchor for your character.",
  },
  {
    n: "02",
    title: "Describe your character",
    body: "Tell LoreForge what to transform your subject into — a personality, a world, a vibe.",
  },
  {
    n: "03",
    title: "Choose your artistic style",
    body: "3D animation, anime, cyberpunk, comic book and more — nine styles to pick from.",
  },
  {
    n: "04",
    title: "Generate your character",
    body: "The studio renders a genuinely new image, built from your photo and your prompt.",
  },
  {
    n: "05",
    title: "Download, share or save",
    body: "Keep it in your collection, drop it into a meme, or send it out into the world.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
      <h2 className="font-display text-2xl font-bold sm:text-3xl">How it works</h2>
      <div className="mt-10 space-y-0">
        {STEPS.map((step) => (
          <div
            key={step.n}
            className="flex gap-5 border-t border-white/5 py-6 first:border-t-0 sm:gap-8"
          >
            <span className="font-display text-2xl font-bold text-lf-purple-light/70 sm:text-3xl">
              {step.n}
            </span>
            <div>
              <h3 className="font-display text-lg font-bold">{step.title}</h3>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-lf-text-dim">
                {step.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
