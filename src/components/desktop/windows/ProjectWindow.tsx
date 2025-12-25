interface ProjectData {
  id: string;
  title: string;
  tagline: string;
  description: string;
  highlights: string[];
  tech: string[];
  status: string;
  color: string;
}

const projects: Record<string, ProjectData> = {
  'aura': {
    id: 'aura',
    title: 'Aura Platform',
    tagline: 'AI Companions that flow with your day',
    description: 'A sophisticated multi-agent AI platform that creates personalized AI companions designed to seamlessly integrate into daily life. Aura represents the next evolution of human-AI interaction—proactive, contextual, and genuinely helpful.',
    highlights: [
      'Multi-agent architecture with specialized AI personas',
      'Context-aware scheduling and productivity assistance',
      'Natural conversation flow with memory persistence',
      'Seamless integration across work and personal contexts',
    ],
    tech: ['LangChain', 'Claude API', 'Vector Databases', 'Real-time Streaming'],
    status: 'In Development',
    color: '#00A3AD',
  },
  'amz-tools': {
    id: 'amz-tools',
    title: 'AMZ Tools',
    tagline: 'Your Amazon Seller Companion',
    description: 'A comprehensive toolkit built for Amazon sellers to streamline their business operations. AMZ Tools leverages AI to provide actionable insights, automate repetitive tasks, and optimize listing performance.',
    highlights: [
      'Intelligent product research and market analysis',
      'Automated listing optimization with AI-powered copywriting',
      'Inventory management and demand forecasting',
      'Competitor tracking and pricing intelligence',
    ],
    tech: ['Python', 'Amazon SP-API', 'OpenAI', 'Data Analytics'],
    status: 'Active',
    color: '#FFB81C',
  },
  'duet': {
    id: 'duet',
    title: 'Duet',
    tagline: 'Stay connected without the interruption',
    description: 'A mobile voice companion app designed for couples and partners to communicate freely without disrupting their media consumption. Duet enables seamless, ambient voice communication that respects your current activity.',
    highlights: [
      'Ambient voice mode that overlays on any media',
      'Smart presence detection and availability status',
      'Low-latency, high-quality audio optimized for mobile',
      'Privacy-first architecture with end-to-end encryption',
    ],
    tech: ['React Native', 'WebRTC', 'Audio Processing', 'Real-time Sync'],
    status: 'Concept',
    color: '#E31837',
  },
};

interface ProjectWindowProps {
  projectId: string;
}

export default function ProjectWindow({ projectId }: ProjectWindowProps) {
  const project = projects[projectId];

  if (!project) {
    return <div className="p-4">Project not found</div>;
  }

  return (
    <div className="p-4 text-[var(--window-text)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-12 h-12 rounded flex items-center justify-center text-white text-xl"
          style={{ backgroundColor: project.color }}
        >
          {project.title[0]}
        </div>
        <div>
          <h1 className="text-lg font-bold m-0">{project.title}</h1>
          <p className="text-sm m-0 italic" style={{ color: project.color }}>{project.tagline}</p>
        </div>
        <span
          className="ml-auto text-xs px-2 py-1 text-white"
          style={{ backgroundColor: project.color }}
        >
          {project.status}
        </span>
      </div>

      <div className="retro-divider" />

      {/* Description */}
      <div className="group-box">
        <span className="group-box-label">Description</span>
        <p className="text-xs leading-relaxed m-0">{project.description}</p>
      </div>

      {/* Highlights */}
      <div className="group-box">
        <span className="group-box-label">Key Features</span>
        <ul className="text-xs m-0 pl-4 space-y-1">
          {project.highlights.map((highlight, idx) => (
            <li key={idx}>{highlight}</li>
          ))}
        </ul>
      </div>

      {/* Tech Stack */}
      <div className="group-box">
        <span className="group-box-label">Tech Stack</span>
        <div className="flex flex-wrap gap-2">
          {project.tech.map(tech => (
            <span
              key={tech}
              className="text-xs px-2 py-1"
              style={{
                backgroundColor: `${project.color}20`,
                border: `1px solid ${project.color}`,
              }}
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      <div className="retro-divider" />

      <div className="flex gap-2 justify-end">
        <button className="retro-button">Learn More</button>
      </div>
    </div>
  );
}
