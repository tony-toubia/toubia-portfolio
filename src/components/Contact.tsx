'use client';

import { useState } from 'react';

export default function Contact() {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    type: 'general',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would send to an API
    const mailtoLink = `mailto:contact@tonytoubia.com?subject=${encodeURIComponent(
      `[${formState.type.toUpperCase()}] Message from ${formState.name}`
    )}&body=${encodeURIComponent(formState.message)}`;
    window.location.href = mailtoLink;
  };

  return (
    <section id="contact" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Let&apos;s <span className="gradient-text">Connect</span>
          </h2>
          <p className="text-foreground-secondary max-w-2xl mx-auto">
            Whether you&apos;re looking to collaborate on a project, discuss enterprise AI strategy, or book a speaking engagement - I&apos;d love to hear from you.
          </p>
          <div className="w-24 h-1 mx-auto mt-6 rounded-full bg-gradient-to-r from-accent-primary via-accent-tertiary to-accent-secondary" />
        </div>

        <div className="grid lg:grid-cols-5 gap-12">
          {/* Contact Form */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-card-bg focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors"
                    placeholder="Your name"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-card-bg focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="type" className="block text-sm font-medium mb-2">
                  What brings you here?
                </label>
                <select
                  id="type"
                  value={formState.type}
                  onChange={(e) => setFormState({ ...formState, type: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card-bg focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors"
                >
                  <option value="general">General Inquiry</option>
                  <option value="collaboration">Project Collaboration</option>
                  <option value="speaking">Speaking Engagement</option>
                  <option value="consulting">AI/Salesforce Consulting</option>
                  <option value="opportunity">Career Opportunity</option>
                </select>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  value={formState.message}
                  onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                  rows={5}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card-bg focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors resize-none"
                  placeholder="Tell me what you're thinking..."
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 bg-accent-primary text-white font-medium rounded-lg hover:bg-accent-primary/90 transition-colors"
              >
                Send Message
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </form>
          </div>

          {/* Contact Info Sidebar */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Connect */}
            <div className="bg-card-bg border border-border rounded-xl p-6">
              <h3 className="font-semibold mb-4">Quick Connect</h3>
              <div className="space-y-4">
                <a
                  href="https://www.linkedin.com/in/tonytoubia"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-border/50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#0077B5]/10 text-[#0077B5] flex items-center justify-center">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium group-hover:text-accent-primary transition-colors">LinkedIn</p>
                    <p className="text-sm text-foreground-muted">/in/tonytoubia</p>
                  </div>
                </a>

                <a
                  href="mailto:contact@tonytoubia.com"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-border/50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent-primary/10 text-accent-primary flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium group-hover:text-accent-primary transition-colors">Email</p>
                    <p className="text-sm text-foreground-muted">contact@tonytoubia.com</p>
                  </div>
                </a>
              </div>
            </div>

            {/* Location */}
            <div className="bg-gradient-to-br from-accent-primary/10 via-accent-tertiary/10 to-accent-secondary/10 border border-accent-primary/20 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <svg className="w-5 h-5 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="font-semibold">Based in Kansas City</span>
              </div>
              <p className="text-sm text-foreground-secondary">
                Proud to call KC home. Available for remote collaboration worldwide and in-person engagements across the US.
              </p>
            </div>

            {/* Response Time */}
            <div className="text-sm text-foreground-muted">
              <p>Typical response time: 24-48 hours</p>
              <p className="mt-1">For urgent matters, please indicate in your message.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
