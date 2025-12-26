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
      content: "Hey! Welcome to A.I.M. - Automated Interaction Messenger. I'm TonyBot, Tony's AI assistant. Ask me anything about AI, Salesforce, or just chat!",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [warningLevel] = useState(0);

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

  return (
    <div className="h-full flex flex-col bg-[#ece9d8]" style={{ fontFamily: 'Tahoma, sans-serif' }}>
      {/* Menu Bar */}
      <div className="flex items-center text-[11px] bg-[#ece9d8] border-b border-[#aca899]">
        <button className="px-2 py-0.5 hover:bg-[#316ac5] hover:text-white">File</button>
        <button className="px-2 py-0.5 hover:bg-[#316ac5] hover:text-white">Edit</button>
        <button className="px-2 py-0.5 hover:bg-[#316ac5] hover:text-white">Insert</button>
        <button className="px-2 py-0.5 hover:bg-[#316ac5] hover:text-white">People</button>
        <div className="ml-auto pr-2 text-[10px] text-gray-600">
          TonyBot&apos;s Warning Level: {warningLevel}%
        </div>
      </div>

      {/* Chat Display Area */}
      <div
        className="flex-1 overflow-y-auto p-2 text-[11px] bg-white border-2 border-t-[#808080] border-l-[#808080] border-b-white border-r-white m-1"
        style={{ fontFamily: 'Times New Roman, serif' }}
      >
        {messages.map((message) => (
          <div key={message.id} className="mb-1">
            <span
              className="font-bold"
              style={{ color: message.sender === 'user' ? '#ff0000' : '#0000ff' }}
            >
              {message.sender === 'user' ? 'You' : 'TonyBot'}
            </span>
            <span className="text-black">: {message.content}</span>
          </div>
        ))}

        {isTyping && (
          <div className="mb-1 text-gray-500 italic">
            TonyBot is typing...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Formatting Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-[#ece9d8] border-t border-[#aca899]">
        <div className="flex items-center border border-[#808080] bg-white">
          <select className="text-[10px] px-1 py-0.5 bg-white border-none outline-none">
            <option>Arial</option>
            <option>Times New Roman</option>
            <option>Comic Sans MS</option>
          </select>
        </div>
        <div className="flex items-center gap-0.5 ml-1">
          <button className="w-5 h-5 flex items-center justify-center text-[11px] font-bold border border-[#808080] bg-[#ece9d8] hover:bg-[#d4d0c8]">A</button>
          <button className="w-5 h-5 flex items-center justify-center text-[10px] font-bold border border-[#808080] bg-[#ece9d8] hover:bg-[#d4d0c8]">B</button>
          <button className="w-5 h-5 flex items-center justify-center text-[10px] italic border border-[#808080] bg-[#ece9d8] hover:bg-[#d4d0c8]">I</button>
          <button className="w-5 h-5 flex items-center justify-center text-[10px] underline border border-[#808080] bg-[#ece9d8] hover:bg-[#d4d0c8]">U</button>
        </div>
        <div className="w-4 h-4 bg-black ml-1 border border-[#808080]" title="Text Color"></div>
        <div className="w-4 h-4 bg-yellow-300 ml-0.5 border border-[#808080]" title="Background Color"></div>
        <div className="ml-auto flex items-center gap-1">
          <button className="text-[10px] text-blue-600 underline hover:text-blue-800">link</button>
        </div>
      </div>

      {/* Message Input Area */}
      <div className="m-1 mt-0">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          className="w-full p-1 text-[11px] bg-white border-2 border-t-[#808080] border-l-[#808080] border-b-white border-r-white resize-none outline-none"
          style={{ fontFamily: 'Times New Roman, serif', minHeight: '40px' }}
          rows={2}
        />
      </div>

      {/* Bottom Toolbar */}
      <div className="flex items-center justify-between px-1 py-1 bg-[#ece9d8] border-t border-[#aca899]">
        <div className="flex items-center gap-0.5">
          {/* Warn Button */}
          <button className="flex flex-col items-center px-2 py-0.5 hover:bg-[#d4d0c8] border border-transparent hover:border-[#808080]">
            <div className="w-6 h-6 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <path d="M12 2L2 22h20L12 2z" fill="#ffcc00" stroke="#000" strokeWidth="1"/>
                <text x="12" y="18" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#000">!</text>
              </svg>
            </div>
            <span className="text-[9px]">Warn</span>
          </button>

          {/* Block Button */}
          <button className="flex flex-col items-center px-2 py-0.5 hover:bg-[#d4d0c8] border border-transparent hover:border-[#808080]">
            <div className="w-6 h-6 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <circle cx="12" cy="12" r="10" fill="none" stroke="#ff0000" strokeWidth="2"/>
                <line x1="5" y1="5" x2="19" y2="19" stroke="#ff0000" strokeWidth="2"/>
              </svg>
            </div>
            <span className="text-[9px]">Block</span>
          </button>

          {/* Add Buddy Button */}
          <button className="flex flex-col items-center px-2 py-0.5 hover:bg-[#d4d0c8] border border-transparent hover:border-[#808080]">
            <div className="w-6 h-6 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <circle cx="12" cy="8" r="4" fill="#000"/>
                <path d="M6 20c0-4 3-6 6-6s6 2 6 6" fill="#000"/>
                <circle cx="18" cy="8" r="3" fill="#00aa00"/>
                <text x="18" y="11" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#fff">+</text>
              </svg>
            </div>
            <span className="text-[9px]">Add Buddy</span>
          </button>

          {/* Talk Button */}
          <button className="flex flex-col items-center px-2 py-0.5 hover:bg-[#d4d0c8] border border-transparent hover:border-[#808080]">
            <div className="w-6 h-6 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <ellipse cx="12" cy="14" rx="6" ry="4" fill="#4a90d9"/>
                <rect x="10" y="6" width="4" height="10" rx="2" fill="#4a90d9"/>
              </svg>
            </div>
            <span className="text-[9px]">Talk</span>
          </button>

          {/* Get Info Button */}
          <button className="flex flex-col items-center px-2 py-0.5 hover:bg-[#d4d0c8] border border-transparent hover:border-[#808080]">
            <div className="w-6 h-6 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <rect x="4" y="2" width="16" height="20" fill="#ffffd0" stroke="#000" strokeWidth="1"/>
                <line x1="7" y1="6" x2="17" y2="6" stroke="#000" strokeWidth="1"/>
                <line x1="7" y1="10" x2="17" y2="10" stroke="#000" strokeWidth="1"/>
                <line x1="7" y1="14" x2="14" y2="14" stroke="#000" strokeWidth="1"/>
              </svg>
            </div>
            <span className="text-[9px]">Get Info</span>
          </button>
        </div>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={!inputValue.trim()}
          className="flex flex-col items-center px-3 py-0.5 border border-transparent hover:border-[#808080]"
          style={{
            background: inputValue.trim() ? '#ece9d8' : '#ece9d8',
            opacity: inputValue.trim() ? 1 : 0.5,
          }}
        >
          <div className="w-6 h-6 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path d="M2 12l18-8-4 8 4 8z" fill="#4a90d9" stroke="#000" strokeWidth="1"/>
            </svg>
          </div>
          <span className="text-[9px]">Send</span>
        </button>
      </div>
    </div>
  );
}
