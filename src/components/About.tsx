export default function About() {
  const expertise = [
    {
      title: 'Generative AI & Agentic Systems',
      description: 'Building production-grade AI agents that deliver measurable business outcomes, not just impressive demos.',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      title: 'Salesforce Ecosystem',
      description: 'Deep expertise across Data 360, Marketing Cloud, Agentforce, and the broader Customer 360 platform.',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
        </svg>
      ),
    },
    {
      title: 'Business Value Realization',
      description: 'Translating complex technology investments into concrete ROI through strategic implementation.',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      title: 'Identity Resolution & Data Strategy',
      description: 'Pioneering identity-first approaches to customer data that work in a post-cookie world.',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
        </svg>
      ),
    },
  ];

  return (
    <section id="about" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            About <span className="gradient-text">Tony</span>
          </h2>
          <div className="w-24 h-1 mx-auto rounded-full bg-gradient-to-r from-accent-primary via-accent-tertiary to-accent-secondary" />
        </div>

        {/* Bio */}
        <div className="grid md:grid-cols-5 gap-12 mb-16">
          <div className="md:col-span-3">
            <p className="text-lg text-foreground-secondary mb-6">
              Tony Toubia is a rare breed in enterprise technology - equal parts mad scientist and pragmatic business leader. As VP, Global Salesforce Lead at Merkle (a dentsu company), he bridges the gap between cutting-edge AI innovation and real-world business outcomes.
            </p>
            <p className="text-lg text-foreground-secondary mb-6">
              Dubbed a &quot;unicorn&quot; and &quot;new business threat&quot; (in the best possible way), Tony has spent his career proving that enterprise AI doesn&apos;t have to be another failed pilot. While industry reports show 95% of AI initiatives stalling in proof-of-concept purgatory, Tony specializes in the other 5% - the ones that actually make it to production and deliver measurable value.
            </p>
            <p className="text-lg text-foreground-secondary">
              A proud Kansas City native and K-State alum, Tony serves on multiple Salesforce Partner Advisory Boards and has been instrumental in bringing solutions like Merkury to market on the Salesforce AppExchange. When he&apos;s not helping enterprises navigate the agentic AI revolution, he&apos;s building his own AI-powered applications.
            </p>
          </div>

          {/* Certifications */}
          <div className="md:col-span-2">
            <div className="bg-card-bg border border-border rounded-xl p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                Salesforce Certifications
              </h3>
              <ul className="space-y-3">
                {[
                  'AI Specialist',
                  'AI Associate',
                  'Data 360 Consultant',
                  'Marketing Cloud Email Specialist',
                  'Platform Expertise',
                ].map((cert) => (
                  <li key={cert} className="flex items-center gap-2 text-sm text-foreground-secondary">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
                    {cert}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Expertise Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {expertise.map((item) => (
            <div
              key={item.title}
              className="group p-6 bg-card-bg border border-border rounded-xl hover:border-accent-primary/50 transition-all duration-300 hover-glow"
            >
              <div className="w-12 h-12 rounded-lg bg-accent-primary/10 text-accent-primary flex items-center justify-center mb-4 group-hover:bg-accent-primary group-hover:text-white transition-colors">
                {item.icon}
              </div>
              <h3 className="font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-foreground-muted">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
