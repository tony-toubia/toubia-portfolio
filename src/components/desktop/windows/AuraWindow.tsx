'use client';

import { useState } from 'react';

type Tab = 'story' | 'features' | 'tech' | 'architecture';

export default function AuraWindow() {
  const [activeTab, setActiveTab] = useState<Tab>('story');

  return (
    <div className="h-full flex flex-col text-[var(--window-text)]">
      {/* Header */}
      <div className="p-3 border-b border-[var(--button-shadow)]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded flex items-center justify-center text-white text-xl bg-[#00A3AD]">
            <svg viewBox="0 0 48 48" className="w-8 h-8">
              <circle cx="24" cy="24" r="12" fill="none" stroke="#fff" strokeWidth="2" />
              <circle cx="24" cy="24" r="6" fill="#fff" />
              <path d="M24 8v4M24 36v4M8 24h4M36 24h4" stroke="#fff" strokeWidth="2" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold m-0">Aura Platform</h1>
            <p className="text-sm m-0 italic text-[#00A3AD]">AI Companions that flow with your day</p>
          </div>
          <a
            href="https://www.aura-link.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2 py-1 text-white bg-[#00A3AD] hover:opacity-80 no-underline"
          >
            Visit Site
          </a>
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
      {/* The Insight */}
      <div className="group-box">
        <span className="group-box-label">The Insight</span>
        <div className="text-xs leading-relaxed space-y-3">
          <p className="flex items-start gap-2">
            <span className="text-lg">🧠</span>
            <span>
              <strong>AI is only as good as the data we feed it.</strong> I heard this every day. And when I thought about how people would adopt AI in their everyday lives - especially agentic AI combining multiple systems - something became clear.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-lg">📡</span>
            <span>
              We needed a way to bring all our personal data sensors together into one place. Weather, health metrics, calendar, location, fitness - the contextual signals that define our daily rhythms.
            </span>
          </p>
        </div>
      </div>

      {/* The Vision */}
      <div className="group-box">
        <span className="group-box-label">The Vision</span>
        <div className="text-xs leading-relaxed space-y-3">
          <p className="flex items-start gap-2">
            <span className="text-lg">💬</span>
            <span>
              What if we put a conversational agent over all that data? One that could help us manage our lives, stick to routines, discover new things about ourselves, and provide genuine 1:1 companionship?
            </span>
          </p>
          <p className="flex items-start gap-2">
            <span className="text-lg">🎭</span>
            <span>
              Better yet - what if users could create and refine distinct personalities, quirks, traits, and deliberate rules based on their integrated data? A companion that thinks, acts, and flows exactly the way you want them to.
            </span>
          </p>
        </div>
      </div>

      {/* What Aura Does */}
      <div className="group-box">
        <span className="group-box-label">What Aura Does</span>
        <div className="text-xs leading-relaxed">
          <p className="mb-2">
            An <strong>AI companion platform</strong> where users create personalized &quot;Auras&quot; - contextually-aware AI personalities that learn, remember, and proactively communicate based on environmental, health, and lifestyle data.
          </p>
          <ul className="pl-4 space-y-1 m-0">
            <li>🌡️ Context-aware - knows your weather, calendar, fitness, location</li>
            <li>🧠 Persistent memory - remembers your preferences, goals, habits</li>
            <li>📲 Proactive outreach - reaches out based on configurable rules</li>
            <li>🎨 Customizable personality - warmth, playfulness, verbosity, empathy</li>
            <li>🔗 Multi-channel - in-app, web push, SMS, WhatsApp, email</li>
          </ul>
        </div>
      </div>

      {/* Vessel Types */}
      <div className="group-box">
        <span className="group-box-label">Aura Archetypes (Vessels)</span>
        <div className="text-xs flex flex-wrap gap-2">
          <span className="px-2 py-1 bg-[#00A3AD20] border border-[#00A3AD]">🤖 Digital - Cyberspace-native AI</span>
          <span className="px-2 py-1 bg-[#00A3AD20] border border-[#00A3AD]">🌱 Terra - Plant consciousness</span>
          <span className="px-2 py-1 bg-[#00A3AD20] border border-[#00A3AD]">💕 Companion - Emotional friend</span>
          <span className="px-2 py-1 bg-[#00A3AD20] border border-[#00A3AD]">📚 Memory - Story connector</span>
          <span className="px-2 py-1 bg-[#00A3AD20] border border-[#00A3AD]">🦉 Sage - Wisdom guide</span>
        </div>
      </div>
    </div>
  );
}

function FeaturesTab() {
  const features = [
    { feature: 'Personality System', desc: '5 sliders (warmth, playfulness, verbosity, empathy, creativity) + tone + quirks' },
    { feature: 'Behavior Rules', desc: '10 operators, compound AND/OR logic, time windows, cooldowns' },
    { feature: 'Proactive Messages', desc: 'Cron-triggered rule evaluation with multi-channel dispatch' },
    { feature: 'Memory Persistence', desc: 'AI extracts & stores user facts, preferences, goals automatically' },
    { feature: 'Context Awareness', desc: 'Time, location, weather, calendar, fitness, air quality, commute' },
    { feature: 'Multi-Aura Support', desc: 'Create multiple auras with different personalities per user' },
  ];

  const integrations = [
    { provider: 'Google', data: 'Calendar, Fit (steps, heart rate, activity)' },
    { provider: 'Microsoft', data: 'Outlook calendar, email metadata' },
    { provider: 'Strava', data: 'Activities, distance, calories' },
    { provider: 'Fitbit', data: 'Sleep, heart rate, steps' },
    { provider: 'Spotify', data: 'Currently playing, playlists' },
    { provider: 'Apple Health', data: 'iOS health metrics' },
  ];

  const subscriptionTiers = [
    { tier: 'Free', auras: '1', features: 'Basic senses, simple rules' },
    { tier: 'Personal', auras: '3', features: 'All senses, compound rules' },
    { tier: 'Family', auras: '10', features: 'Shared auras, priority support' },
    { tier: 'Business', auras: '∞', features: 'API access, custom integrations' },
  ];

  return (
    <div className="space-y-4">
      {/* Key Capabilities */}
      <div className="group-box">
        <span className="group-box-label">Key Capabilities</span>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[var(--button-face)]">
              <th className="text-left p-2 border border-[var(--button-shadow)]">Feature</th>
              <th className="text-left p-2 border border-[var(--button-shadow)]">Implementation</th>
            </tr>
          </thead>
          <tbody>
            {features.map((row) => (
              <tr key={row.feature}>
                <td className="p-2 border border-[var(--button-shadow)] font-bold">{row.feature}</td>
                <td className="p-2 border border-[var(--button-shadow)]">{row.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* OAuth Integrations */}
      <div className="group-box">
        <span className="group-box-label">Data Integrations (7 OAuth Providers)</span>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[var(--button-face)]">
              <th className="text-left p-2 border border-[var(--button-shadow)]">Provider</th>
              <th className="text-left p-2 border border-[var(--button-shadow)]">Data Accessed</th>
            </tr>
          </thead>
          <tbody>
            {integrations.map((row) => (
              <tr key={row.provider}>
                <td className="p-2 border border-[var(--button-shadow)] font-bold">{row.provider}</td>
                <td className="p-2 border border-[var(--button-shadow)]">{row.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notification Channels */}
      <div className="group-box">
        <span className="group-box-label">Notification Channels</span>
        <div className="text-xs flex flex-wrap gap-2">
          <span className="px-2 py-1 bg-[#00A3AD20] border border-[#00A3AD]">📱 In-App</span>
          <span className="px-2 py-1 bg-[#00A3AD20] border border-[#00A3AD]">🔔 Web Push (VAPID)</span>
          <span className="px-2 py-1 bg-[#FFB81C20] border border-[#FFB81C]">💬 SMS (planned)</span>
          <span className="px-2 py-1 bg-[#FFB81C20] border border-[#FFB81C]">📲 WhatsApp (planned)</span>
          <span className="px-2 py-1 bg-[#FFB81C20] border border-[#FFB81C]">📧 Email (planned)</span>
        </div>
      </div>

      {/* Subscription Tiers */}
      <div className="group-box">
        <span className="group-box-label">Subscription Tiers</span>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[var(--button-face)]">
              <th className="text-left p-2 border border-[var(--button-shadow)]">Tier</th>
              <th className="text-left p-2 border border-[var(--button-shadow)]">Auras</th>
              <th className="text-left p-2 border border-[var(--button-shadow)]">Features</th>
            </tr>
          </thead>
          <tbody>
            {subscriptionTiers.map((row) => (
              <tr key={row.tier}>
                <td className="p-2 border border-[var(--button-shadow)] font-bold">{row.tier}</td>
                <td className="p-2 border border-[var(--button-shadow)]">{row.auras}</td>
                <td className="p-2 border border-[var(--button-shadow)]">{row.features}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Current Limitations */}
      <div className="group-box">
        <span className="group-box-label">Current Limitations</span>
        <ul className="text-xs pl-4 m-0 space-y-1">
          <li><strong>No mobile app:</strong> Web-only (PWA planned)</li>
          <li><strong>SMS/WhatsApp:</strong> Channels defined but not yet implemented</li>
          <li><strong>Nutrition APIs:</strong> Manual logging only (MyFitnessPal OAuth not yet integrated)</li>
          <li><strong>Focus tracking:</strong> Calendar-based only (RescueTime/Toggl not yet integrated)</li>
        </ul>
      </div>
    </div>
  );
}

function TechTab() {
  const techStack = [
    { layer: 'Framework', tech: 'Next.js 14 (App Router) + React 18' },
    { layer: 'Language', tech: 'TypeScript 5.8' },
    { layer: 'UI', tech: 'TailwindCSS 4 + Radix UI primitives' },
    { layer: 'AI/LLM', tech: 'Anthropic Claude (primary), OpenAI (secondary)' },
    { layer: 'Database', tech: 'Supabase (PostgreSQL)' },
    { layer: 'Auth', tech: 'Supabase Auth + 7 OAuth providers' },
    { layer: 'Caching', tech: 'Redis (ioredis)' },
    { layer: 'Payments', tech: 'Stripe' },
    { layer: 'Monorepo', tech: 'Turborepo + pnpm' },
  ];

  const ruleEngine = [
    { type: 'simple', desc: 'Single sensor condition (weather.temp > 30)' },
    { type: 'compound', desc: 'Multiple conditions with AND/OR logic' },
    { type: 'time', desc: 'Time range + days of week' },
    { type: 'threshold', desc: 'Value crosses boundary' },
  ];

  const operators = ['<', '<=', '>', '>=', '==', '!=', 'contains', 'between', 'in', 'not_in'];

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

      {/* Rule Engine */}
      <div className="group-box">
        <span className="group-box-label">Rule Engine</span>
        <div className="text-xs mb-2 font-bold">Trigger Types:</div>
        <table className="w-full text-xs border-collapse mb-3">
          <tbody>
            {ruleEngine.map((row) => (
              <tr key={row.type}>
                <td className="p-2 border border-[var(--button-shadow)] font-mono bg-[#00A3AD20]">{row.type}</td>
                <td className="p-2 border border-[var(--button-shadow)]">{row.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-xs mb-1 font-bold">Operators:</div>
        <div className="flex flex-wrap gap-1">
          {operators.map(op => (
            <span key={op} className="px-2 py-0.5 font-mono text-xs bg-black text-green-400">{op}</span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="group-box">
        <span className="group-box-label">Rule Actions</span>
        <div className="text-xs space-y-1">
          <div className="flex items-start gap-2">
            <span className="font-mono bg-[#00A3AD20] px-2 py-0.5">notify</span>
            <span>Send notification with template</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono bg-[#00A3AD20] px-2 py-0.5">prompt_respond</span>
            <span>AI generates contextual response</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono bg-[#00A3AD20] px-2 py-0.5">webhook</span>
            <span>Call external URL</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono bg-[#00A3AD20] px-2 py-0.5">log</span>
            <span>Record to audit log</span>
          </div>
        </div>
      </div>

      {/* Memory System */}
      <div className="group-box">
        <span className="group-box-label">Memory System</span>
        <div className="text-xs mb-2">Memory Types:</div>
        <div className="flex flex-wrap gap-1 mb-3">
          {['preference', 'fact', 'relationship', 'goal', 'habit', 'context'].map(type => (
            <span key={type} className="px-2 py-0.5 font-mono text-xs bg-[#00A3AD20] border border-[#00A3AD]">{type}</span>
          ))}
        </div>
        <div className="text-xs font-mono bg-black text-green-400 p-2 rounded">
          Conversation → AI extracts memories → Stored with importance/confidence scores<br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↓<br />
          Future conversations ← Relevant memories injected into AI context
        </div>
      </div>
    </div>
  );
}

function ArchitectureTab() {
  return (
    <div className="space-y-4">
      {/* Data Pipeline */}
      <div className="group-box">
        <span className="group-box-label">Data Pipeline</span>
        <div className="text-xs font-mono bg-black text-green-400 p-3 rounded overflow-x-auto">
          <pre className="m-0 whitespace-pre-wrap">{`External APIs → Sense Services → SenseDataService → Rule Engine → Notification Channels
                                        ↓
                              Claude AI → Aura Response
                                        ↓
                              Memory Service (learns from conversations)`}</pre>
        </div>
      </div>

      {/* Service Architecture */}
      <div className="group-box">
        <span className="group-box-label">Service Architecture (40+ services)</span>
        <div className="text-xs font-mono bg-black text-green-400 p-3 rounded overflow-x-auto">
          <pre className="m-0">{`/lib/services/
├── AI & Conversation
│   ├── claude-service.ts          # Primary AI with tool calling
│   ├── aura-building-agent.ts     # Guided aura creation
│   └── memory-service.ts          # Persistent aura memory
├── Sense Data (7 integrations)
│   ├── sense-data-service.ts      # Unified sensor fetcher
│   ├── weather-service.ts         # OpenWeatherMap
│   ├── air-quality-service.ts     # IQAir/AirNow
│   ├── commute-service.ts         # Google Directions
│   ├── nutrition-service.ts       # Food/hydration tracking
│   ├── focus-service.ts           # Calendar + RescueTime
│   └── email-summary-service.ts   # Gmail/Outlook metadata
├── Rules & Logic
│   ├── rule-engine.ts             # Conditional behavior evaluation
│   └── proactive-message-service.ts
└── Notifications (5 channels)
    ├── notification-service.ts    # Queue & dispatch
    └── channels/{in-app, web-push, sms, whatsapp, email}`}</pre>
        </div>
      </div>

      {/* Database Schema */}
      <div className="group-box">
        <span className="group-box-label">Database Schema (29 migrations)</span>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="font-bold mb-1">Core Tables</div>
            <ul className="pl-4 m-0 space-y-1">
              <li><span className="font-mono">auras</span> - AI companions with personality JSONB</li>
              <li><span className="font-mono">aura_senses</span> - Connected senses junction</li>
              <li><span className="font-mono">behavior_rules</span> - Trigger/action pairs</li>
              <li><span className="font-mono">aura_memories</span> - Persistent memory storage</li>
              <li><span className="font-mono">conversations</span> - Chat history</li>
            </ul>
          </div>
          <div>
            <div className="font-bold mb-1">Supporting Tables</div>
            <ul className="pl-4 m-0 space-y-1">
              <li><span className="font-mono">oauth_connections</span> - Third-party credentials</li>
              <li><span className="font-mono">user_locations</span> - Saved places</li>
              <li><span className="font-mono">push_subscriptions</span> - Web push endpoints</li>
              <li><span className="font-mono">subscriptions</span> - Stripe subscription state</li>
              <li><span className="font-mono">food_entries</span> - Nutrition logging</li>
            </ul>
          </div>
        </div>
      </div>

      {/* API Routes */}
      <div className="group-box">
        <span className="group-box-label">API Routes (113 endpoints)</span>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[var(--button-face)]">
              <th className="text-left p-2 border border-[var(--button-shadow)]">Domain</th>
              <th className="text-left p-2 border border-[var(--button-shadow)]">Count</th>
              <th className="text-left p-2 border border-[var(--button-shadow)]">Key Endpoints</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border border-[var(--button-shadow)] font-bold">Aura Management</td>
              <td className="p-2 border border-[var(--button-shadow)]">17</td>
              <td className="p-2 border border-[var(--button-shadow)] font-mono text-[10px]">/api/aura/chat, /api/auras/[id]</td>
            </tr>
            <tr>
              <td className="p-2 border border-[var(--button-shadow)] font-bold">Authentication</td>
              <td className="p-2 border border-[var(--button-shadow)]">21</td>
              <td className="p-2 border border-[var(--button-shadow)] font-mono text-[10px]">/api/auth/{'{provider}'}/callback</td>
            </tr>
            <tr>
              <td className="p-2 border border-[var(--button-shadow)] font-bold">Behavior Rules</td>
              <td className="p-2 border border-[var(--button-shadow)]">7</td>
              <td className="p-2 border border-[var(--button-shadow)] font-mono text-[10px]">/api/behavior-rules, /api/rules/evaluate</td>
            </tr>
            <tr>
              <td className="p-2 border border-[var(--button-shadow)] font-bold">Notifications</td>
              <td className="p-2 border border-[var(--button-shadow)]">14</td>
              <td className="p-2 border border-[var(--button-shadow)] font-mono text-[10px]">/api/notifications/push/subscribe</td>
            </tr>
            <tr>
              <td className="p-2 border border-[var(--button-shadow)] font-bold">Subscriptions</td>
              <td className="p-2 border border-[var(--button-shadow)]">12</td>
              <td className="p-2 border border-[var(--button-shadow)] font-mono text-[10px]">/api/subscription/checkout</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* File Structure */}
      <div className="group-box">
        <span className="group-box-label">Project Structure</span>
        <div className="text-xs font-mono bg-black text-green-400 p-3 rounded overflow-x-auto">
          <pre className="m-0">{`aura-platform/
├── apps/web/
│   ├── app/
│   │   ├── api/                    # 113 API routes
│   │   ├── auth/                   # Auth pages
│   │   └── flow-*/                 # 12+ feature flows
│   ├── lib/
│   │   ├── services/               # 40+ business services
│   │   ├── supabase/               # DB client setup
│   │   └── utils/                  # Shared utilities
│   ├── components/                 # React components
│   ├── types/                      # TypeScript definitions
│   └── supabase/migrations/        # 29 SQL migrations
└── packages/
    ├── eslint-config/
    └── typescript-config/`}</pre>
        </div>
      </div>
    </div>
  );
}
