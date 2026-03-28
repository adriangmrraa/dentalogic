import React, { useState } from 'react';
import { Play, FileText, Download, X, Volume2 } from 'lucide-react';

export interface ChatMedia {
  type: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  url: string;
  mimeType: string;
  filename?: string;
  caption?: string;
  duration?: number;
  thumbnail?: string;
}

interface MessageMediaProps {
  media: ChatMedia;
  onView?: (media: ChatMedia) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(url: string): string {
  return ''; // Size determined server-side
}

const ImageMedia: React.FC<{ media: ChatMedia; onView?: (m: ChatMedia) => void }> = ({ media, onView }) => {
  const [lightbox, setLightbox] = useState(false);

  return (
    <>
      <div
        className="cursor-pointer rounded-xl overflow-hidden max-w-[280px] group"
        onClick={() => { setLightbox(true); onView?.(media); }}
      >
        <img
          src={media.thumbnail || media.url}
          alt={media.caption || 'Image'}
          className="w-full rounded-xl transition-transform group-hover:scale-105"
          loading="lazy"
        />
        {media.caption && (
          <p className="text-xs text-white/60 mt-1.5 px-1">{media.caption}</p>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightbox(false)}
              className="absolute -top-10 right-0 p-2 rounded-xl bg-white/[0.06] text-white/60 hover:text-white"
            >
              <X size={20} />
            </button>
            <img
              src={media.url}
              alt={media.caption || 'Image'}
              className="w-full object-contain rounded-2xl animate-modal-in max-h-[80vh]"
            />
          </div>
        </div>
      )}
    </>
  );
};

const AudioMedia: React.FC<{ media: ChatMedia }> = ({ media }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 max-w-[260px]">
      <button
        onClick={togglePlay}
        className="p-2 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors shrink-0"
      >
        {isPlaying ? <Volume2 size={16} /> : <Play size={16} />}
      </button>
      <div className="flex-1 min-w-0">
        {/* Simple waveform placeholder */}
        <div className="flex items-center gap-0.5 h-6">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className={`w-1 rounded-full ${isPlaying ? 'bg-blue-400' : 'bg-white/20'} transition-colors`}
              style={{ height: `${Math.random() * 80 + 20}%` }}
            />
          ))}
        </div>
        <span className="text-[10px] text-white/30">
          {media.duration ? formatDuration(media.duration) : '0:00'}
        </span>
      </div>
      <audio
        ref={audioRef}
        src={media.url}
        onEnded={() => setIsPlaying(false)}
        preload="metadata"
      />
    </div>
  );
};

const VideoMedia: React.FC<{ media: ChatMedia; onView?: (m: ChatMedia) => void }> = ({ media, onView }) => {
  const [showPlayer, setShowPlayer] = useState(false);

  return (
    <>
      <div
        className="relative cursor-pointer rounded-xl overflow-hidden max-w-[280px] group"
        onClick={() => { setShowPlayer(true); onView?.(media); }}
      >
        {media.thumbnail ? (
          <img src={media.thumbnail} alt="Video" className="w-full rounded-xl" loading="lazy" />
        ) : (
          <div className="w-full aspect-video bg-white/[0.04] rounded-xl flex items-center justify-center">
            <Play size={32} className="text-white/30" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl group-hover:bg-black/40 transition-colors">
          <div className="p-3 rounded-full bg-white/20 backdrop-blur-sm">
            <Play size={20} className="text-white" />
          </div>
        </div>
        {media.duration && (
          <span className="absolute bottom-2 right-2 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
            {formatDuration(media.duration)}
          </span>
        )}
      </div>

      {showPlayer && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowPlayer(false)}
        >
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowPlayer(false)}
              className="absolute -top-10 right-0 p-2 rounded-xl bg-white/[0.06] text-white/60 hover:text-white"
            >
              <X size={20} />
            </button>
            <video
              src={media.url}
              controls
              autoPlay
              className="w-full rounded-2xl animate-modal-in max-h-[80vh]"
            />
          </div>
        </div>
      )}
    </>
  );
};

const DocumentMedia: React.FC<{ media: ChatMedia }> = ({ media }) => (
  <a
    href={media.url}
    download={media.filename}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 max-w-[260px] hover:bg-white/[0.06] transition-colors group"
  >
    <div className="p-2 rounded-lg bg-red-500/10 text-red-400 shrink-0">
      <FileText size={18} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-white font-medium truncate">{media.filename || 'Documento'}</p>
      <p className="text-[10px] text-white/30 uppercase">{media.mimeType.split('/')[1] || 'file'}</p>
    </div>
    <Download size={14} className="text-white/30 group-hover:text-white/60 transition-colors shrink-0" />
  </a>
);

const StickerMedia: React.FC<{ media: ChatMedia }> = ({ media }) => (
  <img
    src={media.url}
    alt="Sticker"
    className="w-32 h-32 object-contain"
    loading="lazy"
  />
);

export const MessageMedia: React.FC<MessageMediaProps> = ({ media, onView }) => {
  switch (media.type) {
    case 'image':
      return <ImageMedia media={media} onView={onView} />;
    case 'audio':
      return <AudioMedia media={media} />;
    case 'video':
      return <VideoMedia media={media} onView={onView} />;
    case 'document':
      return <DocumentMedia media={media} />;
    case 'sticker':
      return <StickerMedia media={media} />;
    default:
      return null;
  }
};

export const Linkify = ({ text }: { text: string }) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return (
        <>
            {parts.map((part, i) => (
                urlRegex.test(part) ? (
                    <a
                        key={i}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline inline-flex items-center gap-1"
                        style={{ wordBreak: 'break-all' }}
                    >
                        {part}
                    </a>
                ) : part
            ))}
        </>
    );
};

export const MessageContent = ({ message }: { message: any }) => {
    if (!message) return null;
    const content = typeof message.content === 'string' ? message.content : '';
    const attachments = message.attachments || message.content_attributes || [];

    return (
        <div className="flex flex-col gap-1 text-sm">
            {content && (
                <div className="whitespace-pre-wrap">
                    <Linkify text={content} />
                </div>
            )}
            {attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {attachments.map((att: any, idx: number) => (
                        <MessageMedia key={idx} media={att} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default MessageMedia;
