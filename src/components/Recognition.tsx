const recognitions = [
  {
    title: 'Salesforce Marketing Cloud Partner Advisory Board',
    organization: 'Salesforce',
    period: 'Mar 2021 – Present',
    description:
      'Advising Salesforce on Marketing Cloud product direction and partner ecosystem strategy.',
    type: 'advisory',
  },
  {
    title: 'Salesforce AI+Data+CRM Advisory Board',
    organization: 'Salesforce',
    period: '2024 – Present',
    description:
      'Shaping the future of Salesforce\'s AI and data strategy at the intersection of enterprise needs.',
    type: 'advisory',
  },
  {
    title: 'Salesforce CDP Technical Advisory Board',
    organization: 'Salesforce',
    period: 'Mar 2022 – Present',
    description:
      'Providing technical guidance on Customer Data Platform capabilities and roadmap.',
    type: 'advisory',
  },
  {
    title: 'Merkury on Salesforce AppExchange Launch',
    organization: 'Merkle',
    period: '2023',
    description:
      'Led the strategic launch of Merkury identity solution on Salesforce AppExchange, enabling brands to expand marketing reach without third-party cookies.',
    type: 'achievement',
  },
];

const certifications = [
  { name: 'Salesforce Certified AI Specialist', year: '2024' },
  { name: 'Salesforce Certified AI Associate', year: '2024' },
  { name: 'Salesforce Certified Data Cloud Consultant', year: '2021' },
  { name: 'Salesforce Marketing Cloud Email Specialist', year: '2020' },
];

export default function Recognition() {
  return (
    <section id="recognition" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Recognition & <span className="gradient-text">Leadership</span>
          </h2>
          <p className="text-foreground-secondary max-w-2xl mx-auto">
            Building influence at the intersection of enterprise technology and business strategy.
          </p>
          <div className="w-24 h-1 mx-auto mt-6 rounded-full bg-gradient-to-r from-accent-primary via-accent-tertiary to-accent-secondary" />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Advisory Boards */}
          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Advisory Boards & Achievements
            </h3>

            {recognitions.map((item, idx) => (
              <div
                key={idx}
                className="group p-6 bg-card-bg border border-border rounded-xl hover:border-accent-primary/50 transition-all"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h4 className="font-semibold group-hover:text-accent-primary transition-colors">
                      {item.title}
                    </h4>
                    <p className="text-sm text-foreground-muted">{item.organization}</p>
                  </div>
                  <span className="text-xs text-foreground-muted whitespace-nowrap">{item.period}</span>
                </div>
                <p className="text-sm text-foreground-secondary">{item.description}</p>
              </div>
            ))}
          </div>

          {/* Certifications Sidebar */}
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-6">
              <svg className="w-5 h-5 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              Certifications
            </h3>

            <div className="bg-card-bg border border-border rounded-xl p-6">
              <div className="space-y-4">
                {certifications.map((cert, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-accent-primary shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{cert.name}</p>
                      <p className="text-xs text-foreground-muted">{cert.year}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quote */}
            <div className="mt-8 p-6 bg-gradient-to-br from-accent-primary/10 to-accent-tertiary/10 rounded-xl border border-accent-primary/20">
              <blockquote className="text-sm italic text-foreground-secondary">
                &quot;Today&apos;s consumer is more empowered than ever. That&apos;s why it is important for brands to know their customers and provide consistent, personal experiences to earn their loyalty.&quot;
              </blockquote>
              <p className="text-xs text-foreground-muted mt-3">— Tony Toubia, on the Merkury launch</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
