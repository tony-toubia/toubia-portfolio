'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  sender: 'user' | 'tonybot';
  content: string;
  timestamp: Date;
}

// Tonybot's pre-programmed responses (placeholder until API integration)
const tonybotResponses = [
  "Hey! Great to hear from you. What's on your mind?",
  "That's a great question about AI - the key is always starting with the business problem, not the technology.",
  "Ha! You sound like someone who's dealt with the 95% of AI pilots that fail. Let me tell you about the other 5%...",
  "Kansas City represent! Best BBQ, best sports fans, best place to build the future of enterprise AI.",
  "FOMU - Fear of Messing Up - is real. But small wins build confidence. What's the smallest valuable thing you could ship?",
  "Identity resolution is the foundation. You can't personalize what you can't recognize.",
  "Salesforce + AI + someone who actually knows what they're doing = magic. Or at least, production-ready systems.",
  "The secret? Stop treating AI like a science project and start treating it like a product.",
  "Want to collaborate on something? Hit me up through the Contact window - I actually read those!",
  "Agentic AI isn't about replacing humans - it's about giving humans superpowers. With great power comes great ROI.",
];

export default function AIMWindow() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'tonybot',
      content: "TonyBot signed on at " + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      timestamp: new Date(),
    },
    {
      id: '2',
      sender: 'tonybot',
      content: "Hey! 👋 Welcome to Automated Interaction Messenger. I'm TonyBot - Tony's AI assistant. Ask me anything about AI, Salesforce, or just chat!",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate typing delay (will be replaced with actual API call)
    setTimeout(() => {
      const randomResponse = tonybotResponses[Math.floor(Math.random() * tonybotResponses.length)];
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'tonybot',
        content: randomResponse,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);
    }, 1000 + Math.random() * 2000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="h-full flex flex-col" style={{ background: '#f0f0f0' }}>
      {/* AIM Header */}
      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{
          background: 'linear-gradient(180deg, #ffde00 0%, #ffc800 50%, #e5b400 100%)',
          borderBottom: '1px solid #c9a000'
        }}
      >
        <div className="flex items-center gap-2">
          {/* Running man icon */}
          <div className="w-6 h-6 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <circle cx="12" cy="4" r="2.5" fill="#000"/>
              <path d="M8 9l4-1 4 1-2 4-1 6h-2l-1-6z" fill="#000"/>
              <path d="M6 14l3-2M18 14l-3-2M9 19l-2 4M15 19l2 4" stroke="#000" strokeWidth="1.5" fill="none"/>
            </svg>
          </div>
          <div>
            <div className="text-xs font-bold text-black">TonyBot</div>
            <div className="text-[10px] text-black/70">Automated Interaction Messenger</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm"></div>
          <span className="text-[10px] text-black/80">Online</span>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Buddy Info Sidebar */}
        <div
          className="w-20 p-2 flex flex-col items-center gap-2 border-r"
          style={{
            background: 'linear-gradient(180deg, #e8e8e8 0%, #d0d0d0 100%)',
            borderColor: '#b0b0b0'
          }}
        >
          {/* TonyBot Avatar */}
          <div
            className="w-12 h-12 rounded flex items-center justify-center text-2xl"
            style={{
              background: 'linear-gradient(135deg, #00A3AD 0%, #004687 100%)',
              border: '2px solid #fff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
          >
            🤖
          </div>
          <div className="text-[9px] text-center font-bold text-gray-700">TonyBot</div>
          <div className="text-[8px] text-center text-gray-500 leading-tight">
            AI Assistant<br/>
            <span className="text-green-600">● Available</span>
          </div>

          <div className="mt-auto text-[8px] text-gray-400 text-center">
            Powered by<br/>the 5%
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 flex flex-col">
          <div
            className="flex-1 overflow-y-auto p-3 space-y-2"
            style={{ background: '#fff' }}
          >
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${message.sender === 'user' ? 'order-2' : ''}`}>
                  <div
                    className="text-[10px] mb-0.5"
                    style={{ color: message.sender === 'user' ? '#c00000' : '#0000c0' }}
                  >
                    <span className="font-bold">{message.sender === 'user' ? 'You' : 'TonyBot'}</span>
                    <span className="text-gray-400 ml-2">{formatTime(message.timestamp)}</span>
                  </div>
                  <div
                    className="text-xs p-2 rounded"
                    style={{
                      background: message.sender === 'user' ? '#fff3cd' : '#e3f2fd',
                      border: `1px solid ${message.sender === 'user' ? '#ffc107' : '#90caf9'}`,
                    }}
                  >
                    {message.content}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div>
                  <div className="text-[10px] mb-0.5" style={{ color: '#0000c0' }}>
                    <span className="font-bold">TonyBot</span>
                    <span className="text-gray-400 ml-2">is typing...</span>
                  </div>
                  <div
                    className="text-xs p-2 rounded inline-flex gap-1"
                    style={{ background: '#e3f2fd', border: '1px solid #90caf9' }}
                  >
                    <span className="animate-bounce">●</span>
                    <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                    <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div
            className="p-2 border-t"
            style={{
              background: 'linear-gradient(180deg, #f5f5f5 0%, #e0e0e0 100%)',
              borderColor: '#c0c0c0'
            }}
          >
            <div className="flex gap-2">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type a message..."
                className="flex-1 p-2 text-xs resize-none rounded"
                style={{
                  border: '2px inset #c0c0c0',
                  background: '#fff',
                  minHeight: '36px',
                  maxHeight: '60px',
                }}
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="px-4 text-xs font-bold rounded"
                style={{
                  background: inputValue.trim()
                    ? 'linear-gradient(180deg, #ffde00 0%, #e5b400 100%)'
                    : '#d0d0d0',
                  border: '2px outset #c0c0c0',
                  color: inputValue.trim() ? '#000' : '#808080',
                }}
              >
                Send
              </button>
            </div>
            <div className="flex justify-between items-center mt-1">
              <div className="text-[9px] text-gray-500">
                Press Enter to send
              </div>
              <div className="text-[9px] text-gray-400">
                A.I.M. v1.0 - Tony&apos;s Personal Agent
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div
        className="px-2 py-1 text-[9px] flex justify-between"
        style={{
          background: '#e0e0e0',
          borderTop: '1px solid #c0c0c0',
          color: '#606060'
        }}
      >
        <span>Connected to TonyBot</span>
        <span>🔒 Secure Chat</span>
      </div>
    </div>
  );
}
