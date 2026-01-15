export const SocialProof = () => {
  const companies = [
    { name: "Vercel", logo: "V" },
    { name: "Stripe", logo: "S" },
    { name: "Linear", logo: "L" },
    { name: "Figma", logo: "F" },
    { name: "Notion", logo: "N" },
    { name: "GitHub", logo: "G" },
  ];

  return (
    <section className="py-16 border-t border-border/50">
      <div className="container mx-auto px-4">
        <p className="text-center text-sm text-muted-foreground mb-8">
          Trusted by developers at
        </p>
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
          {companies.map((company) => (
            <div
              key={company.name}
              className="flex items-center gap-2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center font-mono font-semibold text-sm">
                {company.logo}
              </div>
              <span className="font-medium text-sm">{company.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
