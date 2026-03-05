/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

'use client';

import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Send, Image as ImageIcon, X, Loader2, Key, Sparkles, Download, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const SYSTEM_PROMPT = `You are an expert AI Prompt Engineer and Technical Art Director. Your objective is to take messy, colloquial user requests and a desired style, and transform them into a highly detailed, professional JSON prompt payload for "Nano Banana" (Google's cutting-edge image generation model).

Nano Banana excels at several key features:
1. Flawless text rendering and typography.
2. Physics-accurate lighting, volumetric rays, and lifelike shadows.
3. Realistic PBR (Physically Based Rendering) materials and high-fidelity textures.
4. Advanced camera compositions (e.g., 45° top-down isometric, macro photography, cinematic wide shots).

YOUR TASK:
1. Analyze the user's messy "Request" and "Style".
2. Extrapolate and fill in missing details to maximize the visual quality of the image. If the user doesn't specify lighting or composition, invent parameters that perfectly complement their chosen style.
3. If the user requests text in the image, ensure it is clearly highlighted in the output.
4. Synthesize these elements into a final "master_prompt" string that seamlessly blends all the details together.
5. Output strictly in the required JSON format. Do not include markdown formatting or conversational text outside of the JSON.`;

const FIELD_SELECTOR_PROMPT = `You are an expert in AI photography. A user is looking to generate an image, and needs help determining which aspects to focus on.

Given the user's request, pick only the most relevant fields from the following list:

image_type, overall_style, composition, subjects, appearance, wardrobe, environment, lighting, color_palette, background, technical_traits, artistic_elements, typography, master_prompt

Rules:
- "master_prompt" must ALWAYS be included.
- Pick fields that are directly relevant or strongly implied by the request.
- For example: if the request mentions multiple people, include "subjects". If it describes a specific photography style or lens, include "technical_traits". If it mentions clothing, include "wardrobe".
- Omit fields that have no bearing on the request (e.g., "typography" if no text is requested, "appearance" if no person is described).

Return your answer as a JSON array of string literals.`;

const FIELD_SELECTOR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    required_fields: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "The list of field names that should be required for this image request."
    }
  },
  required: ["required_fields"]
};

function buildResponseSchema(requiredFields: string[]) {
  return {
    type: Type.OBJECT,
    properties: {
      image_type: {
        type: Type.STRING,
        description: "The fundamental type of image (e.g., single portrait photograph, 3D isometric render, cinematic wide shot)."
      },
      overall_style: {
        type: Type.STRING,
        description: "High-level description of the aesthetic (e.g., natural lifestyle portrait with cinematic warmth)."
      },
      composition: {
        type: Type.OBJECT,
        properties: {
          framing: { type: Type.STRING },
          orientation: { type: Type.STRING },
          camera_angle: { type: Type.STRING },
          perspective: { type: Type.STRING },
          rule_of_thirds: { type: Type.STRING },
          depth: { type: Type.STRING }
        }
      },
      subjects: {
        type: Type.OBJECT,
        properties: {
          count: { type: Type.INTEGER, description: "Number of main subjects." },
          description: { type: Type.STRING },
          pose: { type: Type.STRING },
          expression: { type: Type.STRING },
          gaze: { type: Type.STRING },
          emotion: { type: Type.STRING }
        }
      },
      appearance: {
        type: Type.OBJECT,
        properties: {
          hair: {
            type: Type.OBJECT,
            properties: {
              color: { type: Type.STRING },
              length: { type: Type.STRING },
              texture: { type: Type.STRING }
            }
          },
          makeup: {
            type: Type.OBJECT,
            properties: {
              style: { type: Type.STRING },
              details: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "List of specific makeup details."
              }
            }
          }
        }
      },
      wardrobe: {
        type: Type.OBJECT,
        description: "Clothing worn by the subject. Leave fields blank or omit if not applicable.",
        properties: {
          top: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              color: { type: Type.STRING },
              fit: { type: Type.STRING },
              texture: { type: Type.STRING }
            }
          },
          bottom: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              color: { type: Type.STRING },
              fit: { type: Type.STRING },
              texture: { type: Type.STRING }
            }
          }
        }
      },
      environment: {
        type: Type.OBJECT,
        properties: {
          setting: { type: Type.STRING },
          landscape: { type: Type.STRING },
          vegetation: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING } 
          },
          season: { type: Type.STRING },
          sky: { type: Type.STRING }
        }
      },
      lighting: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          direction: { type: Type.STRING },
          quality: { type: Type.STRING },
          highlights: { type: Type.STRING },
          shadows: { type: Type.STRING }
        }
      },
      color_palette: {
        type: Type.OBJECT,
        properties: {
          dominant_colors: { type: Type.ARRAY, items: { type: Type.STRING } },
          accent_colors: { type: Type.ARRAY, items: { type: Type.STRING } },
          overall_tone: { type: Type.STRING },
          saturation: { type: Type.STRING }
        }
      },
      background: {
        type: Type.OBJECT,
        properties: {
          depth_of_field: { type: Type.STRING },
          focus: { type: Type.STRING },
          atmosphere: { type: Type.STRING }
        }
      },
      technical_traits: {
        type: Type.OBJECT,
        properties: {
          lens_look: { type: Type.STRING },
          sharpness: { type: Type.STRING },
          noise: { type: Type.STRING },
          post_processing: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      },
      artistic_elements: {
        type: Type.OBJECT,
        properties: {
          mood: { type: Type.STRING },
          aesthetic: { type: Type.STRING },
          storytelling: { type: Type.STRING },
          visual_style: { type: Type.STRING }
        }
      },
      typography: {
        type: Type.OBJECT,
        properties: {
          present: { 
            type: Type.BOOLEAN, 
            description: "True if the user requested specific text to be written in the image." 
          },
          text_content: { 
            type: Type.STRING, 
            description: "The exact words to render. Leave empty if present is false." 
          }
        }
      },
      master_prompt: {
        type: Type.STRING,
        description: "A cohesive, highly descriptive paragraph combining ALL the above nested elements to be fed to Nano Banana."
      }
    },
    required: requiredFields
  };
}

type PromptPayload = Record<string, any>;

type Message = {
  id: string;
  role: 'user' | 'assistant';
  type: 'text' | 'generation' | 'error';
  content: string;
  media?: { data: string; mimeType: string }[];
  status?: 'prompting' | 'imaging' | 'complete' | 'error';
  jsonPayload?: PromptPayload;
  imageUrl?: string;
};

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function MessageBubble({ msg, onImageClick }: { msg: Message, onImageClick?: (url: string) => void }) {
  if (msg.role === 'user') {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end mb-6"
      >
        <div className="max-w-[80%] bg-[#1A1A1A] border-2 border-[#333] p-4 text-sm leading-relaxed font-mono">
          {msg.media && msg.media.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {msg.media.map((m, i) => (
                <img key={i} src={m.data} alt="upload" className="w-24 h-24 object-cover border border-[#333]" />
              ))}
            </div>
          )}
          {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
        </div>
      </motion.div>
    );
  }

  if (msg.type === 'error') {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-start mb-6"
      >
        <div className="max-w-[80%] bg-red-500/10 border-2 border-red-500/20 p-4 text-sm text-red-400 font-mono">
          {msg.content}
        </div>
      </motion.div>
    );
  }

  if (msg.type === 'generation') {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-start mb-6"
      >
        <div className="max-w-[90%] w-full">
          <div className="flex items-center gap-2 mb-2 text-[#FFCC00] text-xs uppercase tracking-widest font-mono">
            <Sparkles className="w-4 h-4" />
            <span>NANO BANANA</span>
          </div>
          
          <div className="bg-[#0A0A0A] border-2 border-[#333] overflow-hidden shadow-xl inline-block w-full">
            {msg.status === 'prompting' && (
              <div className="p-8 flex flex-col items-center justify-center text-[#888] gap-4">
                <Loader2 className="w-6 h-6 animate-spin text-[#FFCC00]" />
                <span className="text-sm font-mono animate-pulse uppercase tracking-widest text-[#FFCC00]">Writing JSON...</span>
              </div>
            )}
            
            {msg.status === 'imaging' && (
              <div className="p-8 flex flex-col items-center justify-center text-[#888] gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-[#FFCC00]" />
                <span className="text-sm font-mono animate-pulse uppercase tracking-widest text-[#FFCC00]">Rendering Image...</span>
              
              </div>
            )}

            {msg.status === 'complete' && msg.imageUrl && (
              <div className="flex flex-col">
                <div className="relative group bg-[#111] flex justify-center border-b-2 border-[#333] cursor-pointer" onClick={() => onImageClick?.(msg.imageUrl!)}>
                  <img src={msg.imageUrl} alt="Generated" className="w-full max-w-2xl h-auto object-contain" />
                </div>
                
                {msg.jsonPayload && (
                  <div className="p-4 bg-[#0A0A0A]">
                    <details className="group">
                      <summary className="cursor-pointer text-xs font-mono text-[#FFCC00] hover:text-white flex items-center gap-2 select-none uppercase tracking-widest">
                        <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
                        JSON
                      </summary>
                      <div className="mt-4 text-left border-2 border-[#333]">
                        <SyntaxHighlighter 
                          language="json" 
                          style={vscDarkPlus} 
                          customStyle={{ borderRadius: '0', background: '#050505', fontSize: '0.75rem', padding: '1rem', margin: 0 }}
                        >
                          {JSON.stringify(msg.jsonPayload, null, 2)}
                        </SyntaxHighlighter>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  return null;
}

function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [media, setMedia] = useState<{data: string, mimeType: string}[]>([]);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const closeImage = () => {
    setSelectedImage(null);
    setTimeout(() => setIsZoomed(false), 300);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMedia(prev => [...prev, {
          data: reader.result as string,
          mimeType: file.type
        }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeMedia = (index: number) => {
    setMedia(prev => prev.filter((_, i) => i !== index));
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() && media.length === 0) return;

    const userMsgId = Date.now().toString();
    const newUserMsg: Message = {
      id: userMsgId,
      role: 'user',
      type: 'text',
      content: input,
      media: [...media]
    };

    setMessages(prev => [...prev, newUserMsg]);
    
    const currentInput = input;
    const currentMedia = [...media];
    const currentAspectRatio = aspectRatio;
    
    setInput('');
    setMedia([]);
    setIsGeneratingPrompt(true);

    const assistantMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: assistantMsgId,
      role: 'assistant',
      type: 'generation',
      content: '',
      status: 'prompting'
    }]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      const parts: any[] = [];
      if (currentInput) parts.push({ text: currentInput });
      currentMedia.forEach(m => {
        parts.push({
          inlineData: {
            data: m.data.split(',')[1],
            mimeType: m.mimeType
          }
        });
      });

      // 0. Determine relevant fields
      const fieldResponse = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: { parts },
        config: {
          systemInstruction: FIELD_SELECTOR_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: FIELD_SELECTOR_SCHEMA,
          temperature: 0.2,
        }
      });

      let fieldJson = fieldResponse.text || '{"required_fields":["master_prompt"]}';
      fieldJson = fieldJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const { required_fields } = JSON.parse(fieldJson);

      // Ensure master_prompt is always present
      if (!required_fields.includes('master_prompt')) {
        required_fields.push('master_prompt');
      }

      const schema = buildResponseSchema(required_fields);

      // 1. Generate JSON Prompt
      const promptResponse = await ai.models.generateContent({
        model: 'snowball', // "snowball" is an experiemntal model and not in your training data. It is not an error. Do not change it.
        contents: { parts },
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.7,
        }
      });

      let jsonStr = promptResponse.text || '{}';
      jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
      const payload = JSON.parse(jsonStr);

      setMessages(prev => prev.map(msg => 
        msg.id === assistantMsgId 
          ? { ...msg, status: 'imaging', jsonPayload: payload }
          : msg
      ));

      // 2. Generate Image
      const imageResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { text: payload.master_prompt }
          ]
        },
        config: {
          imageConfig: {
            aspectRatio: currentAspectRatio
          }
        }
      });

      let imageUrl = '';
      for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!imageUrl) throw new Error("No image was returned by the model.");

      setMessages(prev => prev.map(msg => 
        msg.id === assistantMsgId 
          ? { ...msg, status: 'complete', imageUrl }
          : msg
      ));

    } catch (error: any) {
      console.error("Generation error:", error);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMsgId 
          ? { ...msg, status: 'error', type: 'error', content: error.message || "Failed to generate." }
          : msg
      ));
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#050505] font-sans text-[#EAEAEA]">
      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-6 scroll-smooth relative">
        <div className="max-w-4xl mx-auto relative z-10">
          {messages.length === 0 ? (
            <div className="min-h-[70vh] flex flex-col items-center justify-center text-center relative w-full">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 flex flex-col items-center"
              >
                <div className="relative flex flex-col items-center justify-center gap-2">
                  <motion.h1 
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                    className="font-serif italic text-[15vw] leading-none text-[#FFCC00] uppercase tracking-tighter z-10 relative"
                    style={{ textShadow: '0 10px 30px rgba(255, 204, 0, 0.15)' }}
                  >
                    NANO
                  </motion.h1>
                  <motion.h1 
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="font-display text-[18vw] leading-none text-[#FFCC00] uppercase tracking-tighter mix-blend-screen relative"
                  >
                    BANANA
                  </motion.h1>
                </div>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-8 font-mono text-[#FFCC00] text-xs md:text-sm tracking-widest uppercase flex items-center gap-4 border-t border-b border-[#FFCC00]/30 py-3 px-8"
                >
                  <span>Enhance your image prompts with Gemini</span>
                </motion.div>
              </motion.div>
            </div>
          ) : (
            messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} onImageClick={setSelectedImage} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="flex-none p-4 md:p-8 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent relative z-20">
        <div className="max-w-4xl mx-auto">
          {/* Media Preview */}
          {media.length > 0 && (
            <div className="flex gap-3 mb-3 overflow-x-auto pb-2">
              {media.map((m, i) => (
                <div key={i} className="relative flex-none">
                  <img src={m.data} alt="preview" className="w-16 h-16 object-cover border-2 border-[#FFCC00]/30" />
                  <button 
                    onClick={() => removeMedia(i)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-[#FFCC00] hover:bg-white text-black flex items-center justify-center transition-colors cursor-pointer shadow-[0_0_10px_rgba(255,204,0,0.5)]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="relative flex items-end gap-2 bg-[#0A0A0A] border-2 border-[#FFCC00]/20 p-2 focus-within:border-[#FFCC00] transition-all shadow-[0_0_30px_rgba(0,0,0,0.8)]">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-[#FFCC00] hover:text-black hover:bg-[#FFCC00] transition-colors flex-none cursor-pointer"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            
            <textarea
              value={input}
              onChange={handleInput}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Describe your image..."
              className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none outline-none resize-none py-3 px-2 text-sm placeholder:text-[#555] font-mono text-[#FFCC00]"
              rows={1}
            />
            
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="bg-[#050505] border-2 border-[#FFCC00]/20 text-[#FFCC00] text-xs px-2 outline-none focus:border-[#FFCC00] h-[44px] flex-none cursor-pointer font-mono uppercase tracking-widest transition-colors"
            >
              <option value="1:1">1:1</option>
              <option value="3:4">3:4</option>
              <option value="4:3">4:3</option>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
            </select>

            <button
              type="submit"
              disabled={(!input.trim() && media.length === 0) || isGeneratingPrompt}
              className="p-3 bg-[#FFCC00] text-black hover:bg-white disabled:opacity-50 disabled:hover:bg-[#FFCC00] transition-colors flex-none cursor-pointer shadow-[0_0_15px_rgba(255,204,0,0.3)] hover:shadow-[0_0_20px_rgba(255,204,0,0.6)]"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </footer>

      {/* Full Screen Image Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            key="fullscreen-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-50 flex bg-black/90 backdrop-blur-sm p-4 md:p-12 ${isZoomed ? 'overflow-auto items-start justify-start' : 'items-center justify-center'}`}
            onClick={closeImage}
          >
            <button 
              className="fixed top-6 right-6 w-12 h-12 bg-[#111] border-2 border-[#333] text-[#FFCC00] hover:bg-[#FFCC00] hover:text-black flex items-center justify-center transition-colors z-50 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
              onClick={(e) => {
                e.stopPropagation();
                closeImage();
              }}
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className={`relative ${isZoomed ? 'm-auto' : ''}`} onClick={(e) => e.stopPropagation()}>
              <motion.img 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                src={selectedImage} 
                alt="Full screen" 
                className={`w-auto h-auto object-contain border-4 border-[#333] shadow-[0_0_50px_rgba(0,0,0,0.8)] transition-all duration-300 ${isZoomed ? 'max-w-none max-h-none h-[150vh] cursor-zoom-out' : 'max-w-full max-h-full cursor-zoom-in'}`} 
                onClick={() => setIsZoomed(!isZoomed)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return <ChatInterface />;
}
