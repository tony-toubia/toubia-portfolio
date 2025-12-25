'use client';

import { useState } from 'react';

interface Project {
  id: string;
  title: string;
  tagline: string;
  description: string;
  highlights: string[];
  tech: string[];
  status: string;
  color: 'teal' | 'red' | 'blue';
  icon: React.ReactNode;
}

const projects: Project[] = [
  {
    id: 'aura-platform',
    title: 'Aura Platform',
    tagline: 'AI Companions that flow with your day',
    description:
      'A sophisticated multi-agent AI platform that creates personalized AI companions designed to seamlessly integrate into daily life. Aura represents the next evolution of human-AI interaction—proactive, contextual, and genuinely helpful.',
    highlights: [
      'Multi-agent architecture with specialized AI personas',
      'Context-aware scheduling and productivity assistance',
      'Natural conversation flow with memory persistence',
      'Seamless integration across work and personal contexts',
    ],
    tech: ['LangChain', 'Claude API', 'Vector Databases', 'Real-time Streaming'],
    status: 'In Development',
    color: 'teal',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
  },
  {
    id: 'amz-tools',
    title: 'AMZ Tools',
    tagline: 'Your Amazon Seller Companion',
    description:
      'A comprehensive toolkit built for Amazon sellers to streamline their business operations. AMZ Tools leverages AI to provide actionable insights, automate repetitive tasks, and optimize listing performance.',
    highlights: [
      'Intelligent product research and market analysis',
      'Automated listing optimization with AI-powered copywriting',
      'Inventory management and demand forecasting',
      'Competitor tracking and pricing intelligence',
    ],
    tech: ['Python', 'Amazon SP-API', 'OpenAI', 'Data Analytics'],
    status: 'Active',
    color: 'red',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  },
  {
    id: 'duet',
    title: 'Duet',
    tagline: 'Stay connected without the interruption',
    description:
      'A mobile voice companion app designed for couples and partners to communicate freely without disrupting their media consumption. Duet enables seamless, ambient voice communication that respects your current activity.',
    highlights: [
      'Ambient voice mode that overlays on any media',
      'Smart presence detection and availability status',
      'Low-latency, high-quality audio optimized for mobile',
      'Privacy-first architecture with end-to-end encryption',
    ],
    tech: ['React Native', 'WebRTC', 'Audio Processing', 'Real-time Sync'],
    status: 'Concept',
    color: 'blue',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
  },
];

const colorClasses = {
  teal: {
    bg: 'bg-[#00A3AD]/10',
    text: 'text-[#00A3AD]',
    border: 'border-[#00A3AD]/30',
    hoverBorder: 'hover:border-[#00A3AD]',
    gradient: 'from-[#00A3AD]',
  },
  red: {
    bg: 'bg-[#E31837]/10',
    text: 'text-[#E31837]',
    border: 'border-[#E31837]/30',
    hoverBorder: 'hover:border-[#E31837]',
    gradient: 'from-[#E31837]',
  },
  blue: {
    bg: 'bg-[#004687]/10',
    text: 'text-[#004687]',
    border: 'border-[#004687]/30',
    hoverBorder: 'hover:border-[#004687]',
    gradient: 'from-[#004687]',
  },
};

export default function Projects() {
  const [activeProject, setActiveProject] = useState<string | null>(null);

  return (
    <section id="projects" className="py-24 px-6 bg-background-secondary">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Side <span className="gradient-text">Projects</span>
          </h2>
          <p className="text-foreground-secondary max-w-2xl mx-auto">
            When the mad scientist leaves the enterprise lab, these are the experiments that come to life. Real applications tackling real problems.
          </p>
          <div className="w-24 h-1 mx-auto mt-6 rounded-full bg-gradient-to-r from-accent-primary via-accent-tertiary to-accent-secondary" />
        </div>

        {/* Projects Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {projects.map((project) => {
            const colors = colorClasses[project.color];
            const isActive = activeProject === project.id;

            return (
              <div
                key={project.id}
                className={`group relative bg-card-bg border rounded-2xl overflow-hidden transition-all duration-500 ${
                  colors.border
                } ${colors.hoverBorder} ${isActive ? 'md:col-span-3' : ''}`}
                onMouseEnter={() => setActiveProject(project.id)}
                onMouseLeave={() => setActiveProject(null)}
              >
                {/* Gradient top border */}
                <div className={`h-1 bg-gradient-to-r ${colors.gradient} to-transparent`} />

                <div className={`p-6 ${isActive ? 'md:grid md:grid-cols-2 md:gap-8' : ''}`}>
                  {/* Header */}
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-xl ${colors.bg} ${colors.text}`}>
                        {project.icon}
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${colors.bg} ${colors.text}`}
                      >
                        {project.status}
                      </span>
                    </div>

                    <h3 className="text-xl font-bold mb-2">{project.title}</h3>
                    <p className={`text-sm font-medium ${colors.text} mb-4`}>{project.tagline}</p>
                    <p className="text-foreground-secondary text-sm mb-6">{project.description}</p>

                    {/* Tech Stack */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {project.tech.map((tech) => (
                        <span
                          key={tech}
                          className="text-xs px-2 py-1 rounded-md bg-border/50 text-foreground-muted"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isActive && (
                    <div className="hidden md:block">
                      <h4 className="font-semibold mb-4">Key Highlights</h4>
                      <ul className="space-y-3">
                        {project.highlights.map((highlight, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm text-foreground-secondary">
                            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${colors.bg.replace('/10', '')} shrink-0`} />
                            {highlight}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <p className="text-foreground-muted mb-4">Interested in collaborating on one of these projects?</p>
          <a
            href="#contact"
            className="inline-flex items-center gap-2 text-accent-primary hover:underline font-medium"
          >
            Let&apos;s talk
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
