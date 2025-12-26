import Image from 'next/image';

export default function AboutWindow() {
  return (
    <div className="p-4 text-[var(--window-text)]">
      {/* Header with photo */}
      <div className="flex gap-4 mb-4">
        <div className="w-24 h-24 bg-[var(--button-face)] flex items-center justify-center shrink-0"
          style={{
            boxShadow: 'inset -1px -1px 0 var(--button-highlight), inset 1px 1px 0 var(--button-shadow)'
          }}
        >
          <Image
            src="/images/headshot.png"
            alt="Tony Toubia"
            width={88}
            height={88}
            className="object-cover"
          />
        </div>
        <div>
          <h1 className="text-lg font-bold m-0">Tony Toubia</h1>
          <p className="text-sm text-[var(--window-text)] opacity-80 m-0">VP, Global Salesforce Lead @ Merkle</p>
          <p className="text-xs mt-2 italic">&quot;Building the 5% of AI that actually works&quot;</p>
        </div>
      </div>

      <div className="retro-divider" />

      {/* Properties style layout */}
      <div className="group-box">
        <span className="group-box-label">General</span>
        <table className="w-full text-xs">
          <tbody>
            <tr>
              <td className="py-1 pr-4 opacity-70">Type:</td>
              <td className="py-1">Mad Scientist / Enterprise AI Leader</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 opacity-70">Location:</td>
              <td className="py-1">Fairway, KS</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 opacity-70">Education:</td>
              <td className="py-1">Kansas State University</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 opacity-70">Known as:</td>
              <td className="py-1">&quot;Unicorn&quot;, &quot;New Business Threat&quot;</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="group-box">
        <span className="group-box-label">Expertise</span>
        <div className="flex flex-wrap gap-2 text-xs">
          {['Generative AI', 'Agentic Systems', 'Salesforce', 'Data 360', 'Agentforce', 'Marketing Cloud', 'Pre-Sales', 'Solutioning', 'Business Value', 'Identity Resolution'].map(skill => (
            <span
              key={skill}
              className="px-2 py-1 bg-[var(--selection-bg)] text-white"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      <div className="group-box">
        <span className="group-box-label">Certifications</span>
        <ul className="text-xs m-0 pl-4 space-y-1">
          <li>Salesforce Certified AI Specialist (2024)</li>
          <li>Salesforce Certified AI Associate (2024)</li>
          <li>Salesforce Certified Data 360 Consultant</li>
          <li>Salesforce Marketing Cloud Email Specialist</li>
        </ul>
      </div>

      <div className="group-box">
        <span className="group-box-label">Advisory Boards</span>
        <ul className="text-xs m-0 pl-4 space-y-1">
          <li>Salesforce Marketing Cloud Partner Advisory Board</li>
          <li>Salesforce AI+Data+CRM Partner Advisory Board</li>
          <li>Salesforce Agentforce Partner Advisory Board</li>
          <li>Salesforce CDP Technical Advisory Board</li>
        </ul>
      </div>

      <div className="retro-divider" />

      <p className="text-xs leading-relaxed">
        Tony Toubia is a rare breed in enterprise technology - equal parts mad scientist and pragmatic business leader.
        While industry reports show 95% of AI initiatives stalling in proof-of-concept purgatory, Tony specializes in
        the other 5% - the ones that actually make it to production and deliver measurable value.
      </p>
    </div>
  );
}
