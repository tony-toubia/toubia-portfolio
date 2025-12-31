import { useWindowManager } from '../WindowManager';
import ContactWindow from './ContactWindow';

const speakingEngagements = [
  {
    title: 'Forget FOMU: The Business Case for Enterprise Agentforce',
    event: 'Salesforce Connections',
    type: 'Conference Session',
    description: 'Addressing the "Fear of Messing Up" that stalls AI adoption. Practical frameworks for moving from analysis paralysis to actionable execution.',
    topics: ['Agentic AI', 'Business Case', 'Enterprise Adoption'],
    link: 'https://www.merkle.com/en/merkle-now/events/salesforce-connections/forget-fomu-business-case-for-enterprise-agentforce-session.html',
    featured: true,
  },
  {
    title: 'Building the Future of Advertising with Data 360',
    event: 'Salesforce Agentforce World Tour',
    type: 'Keynote',
    description: 'Exploring how identity-first data strategies and AI are reshaping advertising in a privacy-conscious world.',
    topics: ['Data Strategy', 'Identity Resolution', 'AdTech'],
    featured: false,
  },
];

export default function SpeakingWindow() {
  const { openWindow, windows } = useWindowManager();

  const handleBookSpeaker = () => {
    const availableWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const availableHeight = typeof window !== 'undefined' ? window.innerHeight - 36 : 700;
    const isMobile = availableWidth < 768;

    const windowSize = isMobile
      ? { width: Math.min(availableWidth - 20, 350), height: Math.min(availableHeight - 60, 400) }
      : { width: 500, height: 420 };

    const offsetIndex = windows.filter(w => w.isOpen).length;
    let centerX = Math.max(10, (availableWidth - windowSize.width) / 2);
    let centerY = Math.max(10, (availableHeight - windowSize.height) / 2);
    const stackOffset = isMobile ? offsetIndex * 15 : offsetIndex * 30;
    centerX = Math.max(10, Math.min(centerX + stackOffset, availableWidth - windowSize.width - 10));
    centerY = Math.max(10, Math.min(centerY + stackOffset, availableHeight - windowSize.height - 10));

    openWindow({
      id: 'contact-speaking',
      title: 'Contact - Speaking Inquiry',
      isMinimized: false,
      isMaximized: false,
      position: { x: centerX, y: centerY },
      size: windowSize,
      content: <ContactWindow initialSubject="Speaking Engagement" />,
      icon: (
        <svg viewBox="0 0 48 48" className="w-4 h-4">
          <rect x="4" y="10" width="40" height="28" rx="2" fill="#00A3AD" />
          <path d="M4 14l20 12 20-12" stroke="#fff" strokeWidth="2" fill="none" />
        </svg>
      ),
    });
  };

  return (
    <div className="p-4 text-[var(--window-text)]">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🎤</span>
        <div>
          <h1 className="text-lg font-bold m-0">Speaking Engagements</h1>
          <p className="text-xs opacity-70 m-0">Conferences, keynotes & thought leadership</p>
        </div>
      </div>

      <div className="retro-divider" />

      <div className="space-y-4">
        {speakingEngagements.map((engagement, idx) => (
          <div key={idx} className="group-box">
            <span className="group-box-label">
              {engagement.featured ? '⭐ Featured' : engagement.type}
            </span>

            <h3 className="font-bold text-sm m-0 mb-1">{engagement.title}</h3>
            <p className="text-xs opacity-70 m-0 mb-2">{engagement.event}</p>
            <p className="text-xs leading-relaxed m-0 mb-3">{engagement.description}</p>

            <div className="flex flex-wrap gap-1 mb-3">
              {engagement.topics.map(topic => (
                <span
                  key={topic}
                  className="text-[10px] px-2 py-0.5 bg-[var(--selection-bg)] text-white"
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
                className="retro-link text-xs"
              >
                ▶️ Watch Recording
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="retro-divider" />

      <div className="bg-[var(--selection-bg)] text-white p-3 text-center">
        <p className="text-xs m-0 mb-2">Interested in having Tony speak at your event?</p>
        <p className="text-[10px] opacity-80 m-0 mb-3">
          Topics: Agentic AI • Enterprise Transformation • Data Strategy • Business Value
        </p>
        <button
          onClick={handleBookSpeaker}
          className="retro-button bg-white text-[var(--selection-bg)] hover:bg-gray-100 font-bold px-4 py-1"
        >
          📧 Book Tony as a Speaker
        </button>
      </div>
    </div>
  );
}
