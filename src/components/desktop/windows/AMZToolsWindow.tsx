'use client';

import { useState } from 'react';

type Tab = 'story' | 'features' | 'tech' | 'architecture';

export default function AMZToolsWindow() {
  const [activeTab, setActiveTab] = useState<Tab>('story');

  return (
    <div className="h-full flex flex-col text-[var(--window-text)]">
      {/* Header */}
      <div className="p-3 border-b border-[var(--button-shadow)]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded flex items-center justify-center text-white text-xl bg-[#FFB81C]">
            <svg viewBox="0 0 48 48" className="w-8 h-8">
              <path d="M12 28c8 4 16 4 24 0" stroke="#232F3E" strokeWidth="3" fill="none" />
              <path d="M34 28l2 4-4-2" fill="#232F3E" />
              <rect x="16" y="14" width="16" height="12" rx="2" fill="#232F3E" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold m-0">AMZ Tools</h1>
            <p className="text-sm m-0 italic text-[#FFB81C]">Your Amazon Seller Companion</p>
          </div>
          <span className="text-xs px-2 py-1 text-white bg-[#FFB81C]">
            Beta
          </span>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="retro-tabs pt-1 bg-[var(--button-face)]">
        <button
          className={`retro-tab ${activeTab === 'story' ? 'active' : ''}`}
          onClick={() => setActiveTab('story')}
        >
          The Story
        </button>
        <button
          className={`retro-tab ${activeTab === 'features' ? 'active' : ''}`}
          onClick={() => setActiveTab('features')}
        >
          Features
        </button>
        <button
          className={`retro-tab ${activeTab === 'tech' ? 'active' : ''}`}
          onClick={() => setActiveTab('tech')}
        >
          Tech Stack
        </button>
        <button
          className={`retro-tab ${activeTab === 'architecture' ? 'active' : ''}`}
          onClick={() => setActiveTab('architecture')}
        >
          Architecture
        </button>
      </div>

      {/* Content */}
      <div className="retro-tab-content flex-1 overflow-auto p-3">
        {activeTab === 'story' && <StoryTab />}
        {activeTab === 'features' && <FeaturesTab />}
        {activeTab === 'tech' && <TechTab />}
        {activeTab === 'architecture' && <ArchitectureTab />}
      </div>
    </div>
  );
}

function StoryTab() {
  return (
    <div className="space-y-4">
      {/* The Origin */}
      <div className="group-box">
        <span className="group-box-label">The Origin</span>
        <div className="text-xs leading-relaxed space-y-3">
          <p className="flex items-start gap-2">
            <span className="text-lg">👨‍👦‍👦</span>
            <span>
              <strong>I&apos;m the youngest of 5 brothers.</strong> Two of my brothers got interested in Amazon selling, and being in software I wanted to build some tools that could help them run a successful operation.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-lg">💡</span>
            <span>
              <strong>Sellers live and die by their tools</strong> - Jungle Scout, Helium 10, SellerAmp, Keepa - these are the industry standard. I wanted to replicate and improve on what they offer, tailored to my brothers&apos; specific needs.
            </span>
          </p>
        </div>
      </div>

      {/* The Build */}
      <div className="group-box">
        <span className="group-box-label">The Build</span>
        <div className="text-xs leading-relaxed space-y-3">
          <p className="flex items-start gap-2">
            <span className="text-lg">🚀</span>
            <span>
              <strong>What started as simple scripts</strong> evolved into a full-stack platform. Product research, price intelligence, keyword analysis, AI-powered listing optimization - all built from the ground up.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-lg">🤖</span>
            <span>
              <strong>Heavy use of Claude Code</strong> for rapid development. The entire platform was built in weeks, not months - a testament to how AI-assisted development changes everything.
            </span>
          </p>
        </div>
      </div>

      {/* Current State */}
      <div className="group-box">
        <span className="group-box-label">Current State</span>
        <div className="text-xs leading-relaxed space-y-3">
          <p className="flex items-start gap-2">
            <span className="text-lg">🧪</span>
            <span>
              <strong>Private beta with 2-3 users</strong> (my brothers and potentially their partners). The platform is feature-complete for their workflow but constantly evolving based on real-world feedback.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-lg">📈</span>
            <span>
              <strong>The goal isn&apos;t to compete</strong> with established tools, but to provide a personalized, flexible alternative that can adapt quickly to their specific selling strategies.
            </span>
          </p>
        </div>
      </div>

      {/* By the Numbers */}
      <div className="group-box">
        <span className="group-box-label">By the Numbers</span>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 bg-[#FFB81C20] border border-[#FFB81C]">
            <div className="text-lg font-bold text-[#FFB81C]">33</div>
            <div className="text-[10px]">API Routers</div>
          </div>
          <div className="p-2 bg-[#FFB81C20] border border-[#FFB81C]">
            <div className="text-lg font-bold text-[#FFB81C]">38</div>
            <div className="text-[10px]">Services</div>
          </div>
          <div className="p-2 bg-[#FFB81C20] border border-[#FFB81C]">
            <div className="text-lg font-bold text-[#FFB81C]">30</div>
            <div className="text-[10px]">Models</div>
          </div>
          <div className="p-2 bg-[#FFB81C20] border border-[#FFB81C]">
            <div className="text-lg font-bold text-[#FFB81C]">31</div>
            <div className="text-[10px]">Pages</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturesTab() {
  const featureCategories = [
    {
      name: 'Product Research',
      icon: '🔍',
      features: [
        'Product lookup by ASIN/UPC',
        'Category analysis & BSR tracking',
        'Sales estimation algorithms',
        'Profit calculators with FBA fees',
      ],
    },
    {
      name: 'Price Intelligence',
      icon: '💰',
      features: [
        'Real-time price monitoring',
        'Historical price charts (Keepa-style)',
        'Buy Box tracking & analysis',
        'Competitor price alerts',
      ],
    },
    {
      name: 'Keyword Tools',
      icon: '🔑',
      features: [
        'Keyword research & suggestions',
        'Search volume estimation',
        'Competitor keyword extraction',
        'Backend keyword optimization',
      ],
    },
    {
      name: 'AI Content Generation',
      icon: '✨',
      features: [
        'Listing title optimization',
        'Bullet point generation',
        'Product description writing',
        'A+ Content suggestions',
      ],
    },
    {
      name: 'Review Analysis',
      icon: '⭐',
      features: [
        'Sentiment analysis',
        'Common complaints extraction',
        'Feature request identification',
        'Competitive review comparison',
      ],
    },
    {
      name: 'Market Intelligence',
      icon: '📊',
      features: [
        'Trend detection & forecasting',
        'Seasonal demand analysis',
        'Niche opportunity scoring',
        'Market saturation metrics',
      ],
    },
  ];

  return (
    <div className="space-y-3">
      {featureCategories.map((category) => (
        <div key={category.name} className="group-box">
          <span className="group-box-label">{category.icon} {category.name}</span>
          <ul className="text-xs pl-4 m-0 space-y-1">
            {category.features.map((feature, idx) => (
              <li key={idx}>{feature}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TechTab() {
  const techStack = [
    { layer: 'Frontend Framework', tech: 'React 19 + TypeScript (Vite)' },
    { layer: 'Styling', tech: 'Tailwind CSS' },
    { layer: 'State Management', tech: 'Zustand' },
    { layer: 'Backend Framework', tech: 'FastAPI (Python)' },
    { layer: 'Database', tech: 'PostgreSQL' },
    { layer: 'Cache / Queue', tech: 'Redis' },
    { layer: 'Task Queue', tech: 'Celery' },
    { layer: 'Scraping', tech: 'Playwright' },
    { layer: 'AI Models', tech: 'Google Gemini, Anthropic Claude' },
    { layer: 'Hosting', tech: 'Google Cloud Run, Cloud SQL' },
  ];

  const backendStats = [
    { metric: 'API Routers', count: '33' },
    { metric: 'Services', count: '38' },
    { metric: 'Database Models', count: '30' },
    { metric: 'Celery Tasks', count: '11' },
  ];

  return (
    <div className="space-y-4">
      {/* Tech Stack Table */}
      <div className="group-box">
        <span className="group-box-label">Technology Stack</span>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[var(--button-face)]">
              <th className="text-left p-2 border border-[var(--button-shadow)]">Layer</th>
              <th className="text-left p-2 border border-[var(--button-shadow)]">Technology</th>
            </tr>
          </thead>
          <tbody>
            {techStack.map((row) => (
              <tr key={row.layer}>
                <td className="p-2 border border-[var(--button-shadow)] font-bold">{row.layer}</td>
                <td className="p-2 border border-[var(--button-shadow)]">{row.tech}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Backend Stats */}
      <div className="group-box">
        <span className="group-box-label">Backend Scale</span>
        <div className="grid grid-cols-4 gap-2 text-center">
          {backendStats.map((stat) => (
            <div key={stat.metric} className="p-2 bg-[#232F3E] text-white">
              <div className="text-lg font-bold text-[#FFB81C]">{stat.count}</div>
              <div className="text-[10px]">{stat.metric}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Integration */}
      <div className="group-box">
        <span className="group-box-label">AI Integration</span>
        <div className="text-xs space-y-2">
          <div className="flex items-start gap-2">
            <span className="px-2 py-1 bg-[#4285F420] border border-[#4285F4] font-bold whitespace-nowrap">Gemini</span>
            <span>Content generation, listing optimization, review analysis</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-2 py-1 bg-[#D97D4920] border border-[#D97D49] font-bold whitespace-nowrap">Claude</span>
            <span>Complex reasoning, strategy suggestions, market analysis</span>
          </div>
        </div>
      </div>

      {/* Current Limitations */}
      <div className="group-box">
        <span className="group-box-label">Current Limitations (Beta)</span>
        <ul className="text-xs pl-4 m-0 space-y-1">
          <li><strong>Rate limits:</strong> Amazon SP-API has strict throttling</li>
          <li><strong>Data freshness:</strong> Some data cached for hours, not real-time</li>
          <li><strong>Scale:</strong> Optimized for small catalog (&lt;1000 ASINs)</li>
          <li><strong>Auth:</strong> Single-tenant, not multi-user ready yet</li>
        </ul>
      </div>
    </div>
  );
}

function ArchitectureTab() {
  return (
    <div className="space-y-4">
      {/* System Overview */}
      <div className="group-box">
        <span className="group-box-label">System Overview</span>
        <div className="text-xs font-mono bg-black text-green-400 p-3 rounded overflow-x-auto">
          <pre className="m-0 whitespace-pre-wrap">{`┌─────────────────────────────────────────────────────────┐
│                    React Frontend                       │
│              (Vite + TypeScript + Zustand)              │
└─────────────────────┬───────────────────────────────────┘
                      │ REST API
┌─────────────────────▼───────────────────────────────────┐
│                   FastAPI Backend                       │
│     ┌──────────┬──────────┬──────────┬─────────┐        │
│     │ Products │ Keywords │ Reviews  │ AI Gen  │        │
│     │  Router  │  Router  │  Router  │ Router  │        │
│     └────┬─────┴────┬─────┴────┬─────┴────┬────┘        │
│          │          │          │          │             │
│     ┌────▼──────────▼──────────▼──────────▼────┐        │
│     │           Service Layer (38)             │        │
│     └────┬──────────┬──────────┬──────────┬────┘        │
└──────────┼──────────┼──────────┼──────────┼─────────────┘
           │          │          │          │
     ┌─────▼────┐ ┌───▼───┐ ┌───▼───┐ ┌────▼────┐
     │PostgreSQL│ │ Redis │ │Celery │ │  AI/ML  │
     │    DB    │ │ Cache │ │Workers│ │ Models  │
     └──────────┘ └───────┘ └───────┘ └─────────┘`}</pre>
        </div>
      </div>

      {/* Data Pipeline */}
      <div className="group-box">
        <span className="group-box-label">Data Pipeline</span>
        <div className="text-xs font-mono bg-black text-green-400 p-3 rounded overflow-x-auto">
          <div className="whitespace-nowrap">
            <div className="text-cyan-400 mb-2">// Product Data Flow</div>
            <div>User Request → API Router → Service → SP-API/Scraper → Cache → DB → Response</div>
            <div className="text-cyan-400 my-2">// Background Processing</div>
            <div>Scheduled Task → Celery Worker → Data Fetch → Transform → PostgreSQL → Notification</div>
          </div>
        </div>
      </div>

      {/* Key Components */}
      <div className="group-box">
        <span className="group-box-label">Key Components</span>
        <div className="text-xs space-y-2">
          <div className="flex items-start gap-2">
            <span className="px-2 py-1 bg-[#FFB81C20] border border-[#FFB81C] font-bold whitespace-nowrap">MCP Servers</span>
            <span>Model Context Protocol servers on Cloud Run for AI tool integration</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-2 py-1 bg-[#00A3AD20] border border-[#00A3AD] font-bold whitespace-nowrap">Celery Workers</span>
            <span>Background tasks: price monitoring, inventory sync, report generation</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-2 py-1 bg-[#E3183720] border border-[#E31837] font-bold whitespace-nowrap">Playwright</span>
            <span>Headless browser for scraping data not available via API</span>
          </div>
        </div>
      </div>

      {/* File Structure */}
      <div className="group-box">
        <span className="group-box-label">Backend Structure</span>
        <div className="text-xs font-mono bg-black text-green-400 p-3 rounded overflow-x-auto">
          <pre className="m-0">{`backend/
├── app/
│   ├── api/
│   │   └── routers/           # 33 API routers
│   │       ├── products.py
│   │       ├── keywords.py
│   │       ├── reviews.py
│   │       └── ...
│   ├── services/              # 38 service modules
│   │   ├── amazon_sp_api.py
│   │   ├── keepa_service.py
│   │   ├── ai_generator.py
│   │   └── ...
│   ├── models/                # 30 SQLAlchemy models
│   └── tasks/                 # 11 Celery tasks
├── mcp_servers/               # MCP protocol servers
└── workers/                   # Celery worker configs`}</pre>
        </div>
      </div>

      {/* External Integrations */}
      <div className="group-box">
        <span className="group-box-label">External Integrations</span>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[var(--button-face)]">
              <th className="text-left p-2 border border-[var(--button-shadow)]">Service</th>
              <th className="text-left p-2 border border-[var(--button-shadow)]">Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border border-[var(--button-shadow)] font-bold">Amazon SP-API</td>
              <td className="p-2 border border-[var(--button-shadow)]">Official seller data, inventory, orders</td>
            </tr>
            <tr>
              <td className="p-2 border border-[var(--button-shadow)] font-bold">Keepa API</td>
              <td className="p-2 border border-[var(--button-shadow)]">Historical price data, sales rank</td>
            </tr>
            <tr>
              <td className="p-2 border border-[var(--button-shadow)] font-bold">Google Cloud</td>
              <td className="p-2 border border-[var(--button-shadow)]">Hosting, Cloud SQL, Cloud Run</td>
            </tr>
            <tr>
              <td className="p-2 border border-[var(--button-shadow)] font-bold">Anthropic / Google AI</td>
              <td className="p-2 border border-[var(--button-shadow)]">Content generation, analysis</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
