'use client';

import { useState } from 'react';

interface ContactWindowProps {
  initialSubject?: string;
}

export default function ContactWindow({ initialSubject = 'General Inquiry' }: ContactWindowProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: initialSubject,
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mailtoLink = `mailto:contact@tonytoubia.com?subject=${encodeURIComponent(
      `[${formData.subject}] From ${formData.name}`
    )}&body=${encodeURIComponent(formData.message)}`;
    window.location.href = mailtoLink;
  };

  return (
    <div className="p-4 text-[var(--window-text)]">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">📧</span>
        <div>
          <h1 className="text-lg font-bold m-0">Send Message</h1>
          <p className="text-xs opacity-70 m-0">Let&apos;s connect!</p>
        </div>
      </div>

      <div className="retro-divider" />

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-xs block mb-1">Name:</label>
            <input
              type="text"
              className="retro-input w-full"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="flex-1">
            <label className="text-xs block mb-1">Email:</label>
            <input
              type="email"
              className="retro-input w-full"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>
        </div>

        <div>
          <label className="text-xs block mb-1">Subject:</label>
          <select
            className="retro-input w-full"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
          >
            <option value="General Inquiry">General Inquiry</option>
            <option value="Speaking Engagement">Speaking Engagement</option>
            <option value="Project Collaboration">Project Collaboration</option>
            <option value="AI/Salesforce Consulting">AI/Salesforce Consulting</option>
            <option value="Career Opportunity">Career Opportunity</option>
          </select>
        </div>

        <div>
          <label className="text-xs block mb-1">Message:</label>
          <textarea
            className="retro-textarea w-full"
            rows={5}
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            required
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="submit" className="retro-button">
            Send
          </button>
        </div>
      </form>

      <div className="retro-divider" />

      <div className="group-box">
        <span className="group-box-label">Quick Links</span>
        <div className="flex gap-4 text-xs">
          <a
            href="https://www.linkedin.com/in/tonytoubia"
            target="_blank"
            rel="noopener noreferrer"
            className="retro-link flex items-center gap-1"
          >
            <img src="/images/linkedin-icon.png" alt="" className="w-4 h-4 object-contain" /> LinkedIn
          </a>
          <a
            href="mailto:contact@tonytoubia.com"
            className="retro-link flex items-center gap-1"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
            </svg>
            Email
          </a>
        </div>
      </div>

      <p className="text-xs opacity-70 mt-4 text-center">
        📍 Fairway, KS &bull; Response time: 24-48 hours
      </p>
    </div>
  );
}
