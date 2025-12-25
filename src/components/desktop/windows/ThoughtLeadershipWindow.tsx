const articles = [
  {
    title: 'Merkle Leaders Tapped to Join Salesforce Partner Advisory Boards',
    source: 'PR Newswire',
    date: '2024',
    description: 'Tony joined multiple Salesforce advisory boards including Marketing Cloud and AI+Data+CRM.',
    link: 'https://www.prnewswire.com/news-releases/merkle-leaders-tapped-to-join-salesforce-partner-advisory-boards-302073790.html',
    type: 'Press Release',
  },
  {
    title: 'Merkle Announces Merkury on Salesforce AppExchange',
    source: 'PR Newswire',
    date: '2023',
    description: '"Today\'s consumer is more empowered than ever. That\'s why it is important for brands to know their customers and provide consistent, personal experiences to earn their loyalty."',
    link: 'https://www.prnewswire.com/news-releases/merkle-announces-merkury-on-salesforce-appexchange-the-worlds-leading-enterprise-cloud-marketplace-301802612.html',
    type: 'Press Release',
  },
];

const insights = [
  {
    title: 'The 5% Rule',
    content: 'If McKinsey says 95% of AI pilots fail, the key isn\'t avoiding AI - it\'s understanding why most fail and building for production from day one.',
  },
  {
    title: 'FOMU > FOMO',
    content: 'Fear of Messing Up stalls more AI initiatives than Fear of Missing Out ever started. The antidote? Small wins, measured outcomes, iterative progress.',
  },
  {
    title: 'Identity-First Data',
    content: 'In a post-cookie world, brands that own their identity resolution strategy will own their customer relationships.',
  },
];

export default function ThoughtLeadershipWindow() {
  return (
    <div className="p-4 text-[var(--window-text)]">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">📝</span>
        <div>
          <h1 className="text-lg font-bold m-0">Thought Leadership</h1>
          <p className="text-xs opacity-70 m-0">Ideas, insights & industry presence</p>
        </div>
      </div>

      <div className="retro-divider" />

      {/* Key Insights */}
      <div className="group-box mb-4">
        <span className="group-box-label">Core Philosophy</span>
        <div className="space-y-3">
          {insights.map((insight, idx) => (
            <div key={idx} className="text-xs">
              <h4 className="font-bold m-0 text-[var(--kc-teal)]">{insight.title}</h4>
              <p className="m-0 opacity-80 leading-relaxed">{insight.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Press & Articles */}
      <div className="group-box">
        <span className="group-box-label">In the Press</span>
        <div className="space-y-3">
          {articles.map((article, idx) => (
            <div key={idx} className="text-xs border-b border-[var(--button-shadow)] pb-2 last:border-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="retro-link font-bold"
                >
                  {article.title}
                </a>
                <span className="text-[10px] opacity-50 whitespace-nowrap">{article.date}</span>
              </div>
              <p className="text-[10px] opacity-70 m-0">{article.source}</p>
              <p className="m-0 mt-1 opacity-80 italic text-[11px]">{article.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="retro-divider" />

      <p className="text-xs opacity-70 text-center">
        💡 More content coming soon. Follow on{' '}
        <a
          href="https://www.linkedin.com/in/tonytoubia"
          target="_blank"
          rel="noopener noreferrer"
          className="retro-link"
        >
          LinkedIn
        </a>
        {' '}for updates.
      </p>
    </div>
  );
}
