import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { useHymnal } from '../stores/HymnalProvider';

export const TooltipIcon = ({ text, position = 'inline' }: { text: string; position?: 'inline' | 'bottom-right' | 'top-right' }) => {
  const { showAllTooltips } = useHymnal();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const isTooRight = rect.right + 280 > window.innerWidth;
      setCoords({ 
        top: Math.max(30, Math.min(window.innerHeight - 100, rect.top + rect.height / 2)), 
        left: isTooRight ? Math.max(10, rect.left - 270) : rect.right + 8 
      });
    }
  };

  if (!showAllTooltips) return null;

  const wrapperClass = position === 'bottom-right' 
    ? "absolute bottom-1.5 right-1.5 flex items-center justify-center z-10" 
    : position === 'top-right'
    ? "absolute top-1.5 right-1.5 flex items-center justify-center z-10"
    : "relative inline-flex items-center justify-center ml-auto shrink-0 w-4 h-4";

  return (
    <div 
      ref={containerRef}
      className={wrapperClass} 
      onMouseEnter={() => {
        updatePosition();
        setIsOpen(true);
      }}
      onMouseLeave={() => {
        setIsOpen(false);
      }}
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        updatePosition();
        setIsOpen(!isOpen);
      }}
      title="설명 보기"
    >
      <button
        type="button"
        className={`w-4 h-4 rounded transition-all cursor-pointer flex items-center justify-center p-0 ${
          isOpen 
            ? 'text-[#2B2927] bg-[#EBE5DC]' 
            : 'text-[#8C877D] hover:text-[#2B2927] hover:bg-[#DED8CE]/60'
        }`}
      >
        <MoreVertical className="w-3.5 h-3.5 stroke-[1.8px]" />
      </button>

      {isOpen && createPortal(
        <div 
          className="fixed w-[260px] px-3.5 py-2.5 bg-[#2C2B29] text-[#FAF9F5] rounded-xl shadow-2xl border border-[#43403B] text-left z-[99999] pointer-events-none animate-in fade-in zoom-in-95 duration-150"
          style={{ top: coords.top, left: coords.left, transform: 'translateY(-50%)' }}
        >
          <p className="text-xs text-[#FAF9F5] font-normal leading-relaxed whitespace-pre-wrap">
            {text}
          </p>
        </div>,
        document.body
      )}
    </div>
  );
};
