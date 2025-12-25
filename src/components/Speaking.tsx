const speakingEngagements = [
  {
    title: 'Forget FOMU: The Business Case for Enterprise Agentforce',
    event: 'Salesforce Connections',
    type: 'Conference Session',
    description:
      'Addressing the "Fear of Messing Up" that stalls AI adoption. Practical frameworks for transitioning from analysis paralysis to actionable execution with real-world examples and measurable KPIs.',
    topics: ['Agentic AI', 'Business Case Development', 'Enterprise Adoption'],
    link: 'https://www.merkle.com/en/merkle-now/events/salesforce-connections/forget-fomu-business-case-for-enterprise-agentforce-session.html',
    featured: true,
  },
  {
    title: 'Building the Future of Advertising with Data 360',
    event: 'Salesforce Agentforce World Tour',
    type: 'Keynote Appearance',
    description:
      'Exploring how identity-first data strategies and AI are reshaping the advertising landscape in a privacy-conscious world.',
    topics: ['Data Strategy', 'Identity Resolution', 'Advertising Tech'],
    featured: false,
  },
];

export default function Speaking() {
  return (
    <section id="speaking" className="py-24 px-6 bg-background-secondary">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Speaking & <span className="gradient-text">Thought Leadership</span>
          </h2>
          <p className="text-foreground-secondary max-w-2xl mx-auto">
            Sharing insights on enterprise AI adoption, data strategy, and the practical path from pilot to production.
          </p>
          <div className="w-24 h-1 mx-auto mt-6 rounded-full bg-gradient-to-r from-accent-primary via-accent-tertiary to-accent-secondary" />
        </div>

        {/* Speaking Engagements */}
        <div className="space-y-8">
          {speakingEngagements.map((engagement, idx) => (
            <div
              key={idx}
              className={`group relative bg-card-bg border border-border rounded-2xl overflow-hidden transition-all hover:border-accent-primary/50 ${
                engagement.featured ? 'md:grid md:grid-cols-5' : ''
              }`}
            >
              {engagement.featured && (
                <div className="md:col-span-2 bg-gradient-to-br from-accent-primary/20 via-accent-tertiary/20 to-accent-secondary/20 p-8 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto rounded-full bg-accent-primary/20 flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-accent-primary">Featured Session</span>
                    <p className="text-xs text-foreground-muted mt-1">On-Demand Recording Available</p>
                  </div>
                </div>
              )}

              <div className={`p-8 ${engagement.featured ? 'md:col-span-3' : ''}`}>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-accent-primary/10 text-accent-primary">
                    {engagement.type}
                  </span>
                  <span className="text-sm text-foreground-muted">{engagement.event}</span>
                </div>

                <h3 className="text-xl font-bold mb-3 group-hover:text-accent-primary transition-colors">
                  {engagement.title}
                </h3>

                <p className="text-foreground-secondary mb-6">{engagement.description}</p>

                {/* Topics */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {engagement.topics.map((topic) => (
                    <span
                      key={topic}
                      className="text-xs px-3 py-1 rounded-full border border-border text-foreground-muted"
                    >
                      {topic}
                    </span>
                  ))}
                </div>

                {engagement.link && (
                  <a
                    href={engagement.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-accent-primary hover:underline font-medium text-sm"
                  >
                    Watch Recording
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <div className="inline-flex flex-col sm:flex-row items-center gap-4 p-6 bg-card-bg border border-border rounded-xl">
            <div className="text-left">
              <p className="font-medium">Interested in having Tony speak at your event?</p>
              <p className="text-sm text-foreground-muted">Topics include agentic AI, enterprise transformation, and data strategy.</p>
            </div>
            <a
              href="#contact"
              className="shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-accent-primary text-white font-medium rounded-lg hover:bg-accent-primary/90 transition-colors"
            >
              Book Speaking
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
