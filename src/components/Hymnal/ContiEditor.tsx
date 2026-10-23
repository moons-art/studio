import React, { useRef, useState, useEffect, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { useHymnal } from '../../stores/HymnalProvider';
import type { ContiItem } from '../../stores/HymnalProvider';
import { hymnalApi } from '../../api/hymnalApi';
import { 
  Plus, Minus, Trash2, Maximize2, Type, Move, ZoomIn, Scissors, Save, X, RotateCcw, Image as ImageIcon, 
  StickyNote, LayoutTemplate, Printer, Share2, Search, Library, FileUp,
  ChevronLeft, ChevronRight, GripVertical, Download, ImagePlus, Calendar, Hash, Layout, CheckCircle2, Check, DoorOpen, HelpCircle
} from 'lucide-react';
import { compressImageToWebP } from '../../utils/imageProcessor';
import { gdriveWebService } from '../../api/gdriveWebService';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { SavedContisModal } from './SavedContisModal';
import { LeaderViewer } from './LeaderViewer';
import { logActivity } from '../../utils/logger';

const MARGIN_PX = 55; // 안전 여백

import { TooltipIcon } from '../TooltipIcon';

// --- Optimized Local Slider Component ---
const SmoothSlider = memo(({ 
  value, 
  onChange, 
  min, 
  max, 
  step = 1,
  label,
  accentColor = "accent-[#D97757]",
  unit = "",
  widthClass = "w-14 sm:w-16"
}: {
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  accentColor?: string;
  unit?: string;
  widthClass?: string;
}) => {
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => { setLocalVal(value); }, [value]);

  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-[9px] font-medium text-[#8C877D] tracking-wide whitespace-nowrap">{label}</span>}
      <input 
        type="range" min={min} max={max} step={step} 
        value={localVal} 
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocalVal(v);
          onChange(v);
        }} 
        className={`${widthClass} ${accentColor} h-1 cursor-pointer`} 
      />
      <span className="text-[11px] font-semibold text-[#D97757] w-5 text-center font-mono">
        {localVal}{unit}
      </span>
    </div>
  );
});

// --- Memoized Individual Item Component ---
const DraggableContiItem = React.memo(({ 
  item,
  song, 
  isSelected, 
  canvasWidth, 
  canvasHeight, 
  isPreviewMode, 
  showContiNumbers,
  index,
  canvasRef,
  onSelect,
  onUpdate,
  onRemove,
  onCropEdit,
  cropEditingId
}: any) => {
  const [imageRatio, setImageRatio] = useState(1.414); // A4 ratio default
  const [localMemo, setLocalMemo] = useState(item.memo || '');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const cropBoxRef = useRef<HTMLDivElement>(null);

  const isCropping = isSelected && (cropEditingId === item.id);

  // 로컬 상태와 동기화
  useEffect(() => { setLocalMemo(item.memo || ''); }, [item.memo]);

  // 전방위 다층 안전 이미지 로더 (모든 후보 키/ID/URL 탐색)
  useEffect(() => {
    let active = true;
    let currentBlobUrl: string | null = null;

    // 모든 가능한 키와 식별자 후보 수집
    const possibleKeys = [
      song?.fileId,
      song?.id,
      item?.songId,
      song?.filePath,
      song?.filename,
      song?.storageUrl
    ].filter((k): k is string => Boolean(k) && typeof k === 'string');

    // 1. 이미 완전한 Data URL, Blob URL, 로컬 정적 경로(/...)인 경우 즉시 표시
    const directUrl = possibleKeys.find(k => 
      k.startsWith('http://') || k.startsWith('https://') || 
      k.startsWith('data:') || k.startsWith('blob:') || k.startsWith('/')
    );
    if (directUrl) {
      setBlobUrl(directUrl);
      return;
    }

    if (possibleKeys.length === 0) {
      setBlobUrl(null);
      return;
    }

    const loadImage = async () => {
      try {
        const { imageCache } = await import('../../utils/imageCache');

        // 1단계: IndexedDB 로컬 캐시 조회 (후보 키 순차 확인)
        for (const key of possibleKeys) {
          try {
            const cachedBlob = await imageCache.getImage(key);
            if (cachedBlob && cachedBlob.size > 0 && active) {
              const url = URL.createObjectURL(cachedBlob);
              currentBlobUrl = url;
              setBlobUrl(url);
              return;
            }
          } catch (_) {}
        }

        // 2단계: 클라우드 스토리지 (R2 / Firebase Storage / CDN) URL fetch
        const remoteUrls = possibleKeys
          .filter(k => k.startsWith('http://') || k.startsWith('https://'));
        
        for (const key of possibleKeys) {
          const resolved = hymnalApi.resolveImagePath(key);
          if (resolved && (resolved.startsWith('http://') || resolved.startsWith('https://')) && !remoteUrls.includes(resolved)) {
            remoteUrls.push(resolved);
          }
        }

        for (const rUrl of remoteUrls) {
          try {
            const res = await fetch(rUrl);
            if (res.ok) {
              const blob = await res.blob();
              if (active && blob.size > 0) {
                const url = URL.createObjectURL(blob);
                currentBlobUrl = url;
                setBlobUrl(url);
                if (possibleKeys[0]) {
                  imageCache.saveImage(possibleKeys[0], blob).catch(() => {});
                }
                return;
              }
            }
          } catch (_) {}
        }

        // 3단계: 구글 드라이브 ID 다운로드 (20자 이상의 구글 드라이브 파일 ID)
        const gdriveKeys = possibleKeys.filter(k => 
          k.length >= 20 && !k.startsWith('http') && !k.startsWith('/') && !k.includes(' ')
        );
        for (const gKey of gdriveKeys) {
          try {
            const { gdriveWebService } = await import('../../api/gdriveWebService');
            const gUrl = await gdriveWebService.downloadImageBlob(gKey);
            if (active && gUrl) {
              currentBlobUrl = gUrl;
              setBlobUrl(gUrl);
              return;
            }
          } catch (_) {}
        }

        // 4단계: hymnalApi 정적 경로 fallback
        for (const key of possibleKeys) {
          const fallback = hymnalApi.resolveImagePath(key);
          if (fallback && active) {
            setBlobUrl(fallback);
            return;
          }
        }
      } catch (err) {
        console.error('[ContiEditor] Image load error:', err);
      }
    };

    loadImage();

    return () => {
      active = false;
      if (currentBlobUrl && currentBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [song?.id, song?.fileId, song?.filePath, song?.filename, song?.storageUrl, item?.songId]);

  const crop = item.crop || { top: 0, bottom: 0, left: 0, right: 0 };
  const visibleWidthFactor = (100 - crop.left - crop.right) / 100;
  const visibleHeightFactor = (100 - crop.top - crop.bottom) / 100;

  // 자르기 모드일 때는 원본 크기로 조작하고, 완료 시에는 잘린 크기로 표시
  const currentWidthPercent = isCropping ? item.width : (item.width * visibleWidthFactor);
  const currentAspectRatio = isCropping 
    ? imageRatio 
    : (imageRatio * (visibleWidthFactor / visibleHeightFactor));

  // 인라인 테두리 자르기 핸들 드래그 핸들러 (마우스 이동과 1:1로 선이 안쪽으로 이동)
  const handleStartCropHandle = (direction: 'top' | 'bottom' | 'left' | 'right', e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const handleEl = e.currentTarget as HTMLElement;
    handleEl.setPointerCapture(e.pointerId);

    const container = cropBoxRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialCrop = { ...(item.crop || { top: 0, bottom: 0, left: 0, right: 0 }) };

    const onPointerMove = (me: PointerEvent) => {
      me.stopPropagation();
      me.preventDefault();

      const newCrop = { ...initialCrop };
      if (direction === 'top') {
        const dy = me.clientY - startY;
        const deltaPercent = (dy / rect.height) * 100;
        newCrop.top = Math.max(0, Math.min(50, Math.round(initialCrop.top + deltaPercent)));
      } else if (direction === 'bottom') {
        const dy = startY - me.clientY;
        const deltaPercent = (dy / rect.height) * 100;
        newCrop.bottom = Math.max(0, Math.min(50, Math.round(initialCrop.bottom + deltaPercent)));
      } else if (direction === 'left') {
        const dx = me.clientX - startX;
        const deltaPercent = (dx / rect.width) * 100;
        newCrop.left = Math.max(0, Math.min(50, Math.round(initialCrop.left + deltaPercent)));
      } else if (direction === 'right') {
        const dx = startX - me.clientX;
        const deltaPercent = (dx / rect.width) * 100;
        newCrop.right = Math.max(0, Math.min(50, Math.round(initialCrop.right + deltaPercent)));
      }

      onUpdate(item.id, { crop: newCrop });
    };

    const onPointerUp = (ue: PointerEvent) => {
      try {
        handleEl.releasePointerCapture(ue.pointerId);
      } catch (_) {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <motion.div
      drag={!isPreviewMode && !isResizing && !isCropping} 
      dragMomentum={false} 
      dragElastic={0} 
      dragConstraints={canvasRef}
      initial={false}
      onDragStart={() => onSelect(item.id)}
      onDragEnd={(e) => {
         if (isResizing || isCropping) return;
         const canvas = canvasRef.current; if (!canvas) return;
         const rect = canvas.getBoundingClientRect();
         const el = (e.target as HTMLElement).closest('.conti-item-container');
         if (!el) return;
         const elRect = el.getBoundingClientRect();
         let xPercent = Number((((elRect.left - rect.left) / rect.width) * 100).toFixed(2));
         let yPercent = Number((((elRect.top - rect.top) / rect.height) * 100).toFixed(2));
         onUpdate(item.id, { x: xPercent, y: yPercent });
      }}
      className={`absolute cursor-grab active:cursor-grabbing conti-item-container ${isSelected ? 'z-[100]' : 'z-10'}`}
      animate={{
        x: (item.x * canvasWidth) / 100,
        y: (item.y * canvasHeight) / 100,
      }}
      transition={{ type: "tween", ease: "linear", duration: 0 }}
      style={{
        left: 0, top: 0,
        width: `${currentWidthPercent}%`,
        transformOrigin: '0 0',
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(item.id); }}
    >
       {/* 악보 기능바: 악보와 겹치지 않게 -top-12에 여유 있게 배치 */}
       {isSelected && !isPreviewMode && (
         <div 
           className="absolute -top-12 left-0 flex items-center gap-1.5 bg-[#FAF9F5] text-[#2B2927] px-2 py-1 rounded-xl shadow-md z-[120] no-print border border-[#E5E0D8] animate-in fade-in slide-in-from-bottom-1 duration-200"
           onMouseDown={(e) => e.stopPropagation()}
           onClick={(e) => e.stopPropagation()}
         >
            {/* 메모 열림 상태일 때: 공간 절약을 위해 자르기/삭제 버튼 숨기고 메모 전용 도구만 표시 */}
            {item.isMemoOpen ? (
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => onUpdate(item.id, { isMemoOpen: false })} 
                  className="flex items-center gap-1 px-2 py-1 bg-[#FAF0EB] text-[#D97757] border border-[#F1D3C6] rounded-lg text-xs font-semibold cursor-pointer"
                  title="메모 닫기"
                >
                  <StickyNote className="w-3 h-3" />
                  <span className="text-[11px] tracking-tight">메모</span>
                </button>

                <div className="w-px h-3.5 bg-[#E5E0D8]" />

                {/* 메모 위치: 상단 / 하단 */}
                <div className="flex bg-[#F3EFE9] p-0.5 rounded-lg border border-[#E5E0D8]">
                  <button 
                    onClick={() => onUpdate(item.id, { memoPosition: 'top' })} 
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${item.memoPosition === 'top' ? 'bg-[#D97757] text-white shadow-2xs' : 'text-[#6A6864] hover:text-[#2B2927]'}`}
                  >
                    상단
                  </button>
                  <button 
                    onClick={() => onUpdate(item.id, { memoPosition: 'bottom' })} 
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${(!item.memoPosition || item.memoPosition === 'bottom') ? 'bg-[#D97757] text-white shadow-2xs' : 'text-[#6A6864] hover:text-[#2B2927]'}`}
                  >
                    하단
                  </button>
                </div>

                <div className="w-px h-3.5 bg-[#E5E0D8]" />

                {/* 글자크기: 15~30 가로바 (길이 반으로 축소) */}
                <SmoothSlider 
                  label="크기" 
                  min={15} max={30} 
                  value={item.memoFontSize || 16} 
                  onChange={(v) => onUpdate(item.id, { memoFontSize: v })}
                  accentColor="accent-[#D97757]"
                  widthClass="w-8 sm:w-10"
                />
              </div>
            ) : (
              /* 평소 상태: [자르기] | [메모] | [삭제] 3가지 심플 구성 */
              <div className="flex items-center gap-1.5">
                {/* 1. 자르기 기능 */}
                {isCropping ? (
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => onCropEdit(null)} 
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-[#2E7D32] hover:bg-[#256628] text-white transition-all rounded-lg shadow-2xs font-semibold whitespace-nowrap cursor-pointer"
                      title="자르기 완료"
                    >
                      <Check className="w-3 h-3 text-white stroke-[2.5px]" />
                      <span className="text-[11px] font-bold tracking-tight">자르기 완료</span>
                    </button>
                    <button 
                      onClick={() => onUpdate(item.id, { crop: { top: 0, bottom: 0, left: 0, right: 0 } })} 
                      className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-[#F3EFE9] text-[#6A6864] transition-all rounded-lg border border-[#E5E0D8] text-[10px] font-medium cursor-pointer"
                      title="자르기 초기화"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>초기화</span>
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => onCropEdit(item.id)} 
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-[#D97757] hover:bg-[#C96442] text-white transition-all rounded-lg shadow-2xs group whitespace-nowrap cursor-pointer"
                    title="상하좌우 선을 드래그하여 여백 자르기"
                  >
                    <Scissors className="w-3 h-3 text-white/90 group-hover:scale-110 transition-transform" />
                    <span className="text-[11px] font-medium tracking-tight">자르기</span>
                  </button>
                )}
                
                <div className="w-px h-3.5 bg-[#E5E0D8] mx-0.5" />
                
                {/* 2. 메모 버튼 */}
                <button 
                  onClick={() => onUpdate(item.id, { isMemoOpen: true })} 
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[#6A6864] hover:bg-[#F3EFE9] transition-all rounded-lg text-xs font-medium cursor-pointer"
                >
                  <StickyNote className="w-3 h-3" />
                  <span className="text-[11px] font-medium tracking-tight">메모</span>
                </button>

                <div className="w-px h-3.5 bg-[#E5E0D8] mx-0.5" />
                
                {/* 3. 삭제 버튼 */}
                <button onClick={() => onRemove(item.id)} className="flex p-1 text-[#8C877D] hover:text-[#D97757] hover:bg-[#FAF0EB] rounded-lg transition-all cursor-pointer" title="악보 삭제">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
         </div>
       )}

       {/* 상단 메모창 (memoPosition === 'top') */}
       {item.isMemoOpen && item.memoPosition === 'top' && (
          <div className="mb-2 no-print relative group/memo" onMouseDown={(e) => e.stopPropagation()}>
            <textarea 
              value={localMemo} 
              onChange={(e) => setLocalMemo(e.target.value)} 
              onBlur={() => onUpdate(item.id, { memo: localMemo })}
              placeholder="찬양 멘트..." 
              className="w-full bg-white border border-[#E5E0D8] rounded-xl p-2.5 font-medium text-[#2B2927] shadow-xs focus:border-[#D97757] focus:ring-2 focus:ring-[#D97757]/10 focus:outline-none transition-all resize-none custom-scrollbar" 
              style={{ fontSize: `${item.memoFontSize || 16}px`, height: 'auto', minHeight: '44px' }} 
            />
          </div>
       )}
       {item.memo && item.memoPosition === 'top' && (
         <div className="hidden print:block text-center mb-2 font-black text-black leading-tight" style={{ fontSize: `${item.memoFontSize || 16}px` }}>{item.memo}</div>
       )}

       {/* 악보 이미지 박스 */}
       <div 
         ref={cropBoxRef} 
         className="relative w-full overflow-hidden rounded-sm ring-1 ring-[#E5E0D8] bg-white select-none" 
         style={{ aspectRatio: `${currentAspectRatio}` }}
       >
          <img 
            src={blobUrl || hymnalApi.resolveImagePath(song?.filePath || song?.filename || '')} 
            className="absolute block max-w-none" 
            onLoad={(e) => { 
              if (e.currentTarget.naturalWidth && e.currentTarget.naturalHeight) {
                setImageRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight); 
              }
            }} 
            style={isCropping ? {
              width: '100%',
              left: 0,
              top: 0
            } : { 
              width: `${(1 / visibleWidthFactor) * 100}%`, 
              left: `-${(crop.left / visibleWidthFactor)}%`, 
              top: `-${(crop.top / visibleHeightFactor)}%` 
            }} 
            draggable={false} 
          />

          {/* 인라인 자르기 모드: 4개 선이 마우스 드래그를 따라 안쪽으로 스르륵 움직이며 여백을 자름 */}
          {isCropping && !isPreviewMode && (
            <div className="absolute inset-0 z-40 pointer-events-auto select-none">
              {/* 잘려나가는 영역 어두운 마스크 */}
              <div className="absolute top-0 left-0 right-0 bg-black/40 pointer-events-none" style={{ height: `${crop.top}%` }} />
              <div className="absolute bottom-0 left-0 right-0 bg-black/40 pointer-events-none" style={{ height: `${crop.bottom}%` }} />
              <div className="absolute left-0 bg-black/40 pointer-events-none" style={{ top: `${crop.top}%`, bottom: `${crop.bottom}%`, width: `${crop.left}%` }} />
              <div className="absolute right-0 bg-black/40 pointer-events-none" style={{ top: `${crop.top}%`, bottom: `${crop.bottom}%`, width: `${crop.right}%` }} />

              {/* 자르는 사각형 테두리 가이드라인 (바깥 주황색 선과 일체화) */}
              <div 
                className="absolute border-2 border-[#D97757] pointer-events-none shadow-xs"
                style={{
                  top: `${crop.top}%`,
                  bottom: `${crop.bottom}%`,
                  left: `${crop.left}%`,
                  right: `${crop.right}%`
                }}
              />

              {/* 상단 핸들 바 (도톰한 6px 두께로 바깥 선과 밀착 일체화, 마우스로 잡고 내리면 줄이 아래로 이동) */}
              <div 
                className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35%] py-2.5 flex items-center justify-center cursor-ns-resize group/top z-50 touch-none"
                style={{ top: `${crop.top}%` }}
                onPointerDown={(e) => handleStartCropHandle('top', e)}
                title="아래로 드래그하여 위쪽 여백 자르기"
              >
                <div className="w-full h-[6px] bg-[#D97757] rounded-full shadow-md group-hover/top:h-[7px] group-hover/top:bg-[#C96442] transition-all" />
              </div>

              {/* 하단 핸들 바 (도톰한 6px 두께로 바깥 선과 밀착 일체화, 마우스로 잡고 올리면 줄이 위로 이동) */}
              <div 
                className="absolute left-1/2 -translate-x-1/2 translate-y-1/2 w-[35%] py-2.5 flex items-center justify-center cursor-ns-resize group/bot z-50 touch-none"
                style={{ bottom: `${crop.bottom}%` }}
                onPointerDown={(e) => handleStartCropHandle('bottom', e)}
                title="위로 드래그하여 아래쪽 여백 자르기"
              >
                <div className="w-full h-[6px] bg-[#D97757] rounded-full shadow-md group-hover/bot:h-[7px] group-hover/bot:bg-[#C96442] transition-all" />
              </div>

              {/* 좌측 핸들 바 (도톰한 6px 두께로 바깥 선과 밀착 일체화, 마우스로 잡고 밀면 줄이 오른쪽으로 이동) */}
              <div 
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-[35%] px-2.5 flex items-center justify-center cursor-ew-resize group/left z-50 touch-none"
                style={{ left: `${crop.left}%` }}
                onPointerDown={(e) => handleStartCropHandle('left', e)}
                title="우측으로 드래그하여 왼쪽 여백 자르기"
              >
                <div className="h-full w-[6px] bg-[#D97757] rounded-full shadow-md group-hover/left:w-[7px] group-hover/left:bg-[#C96442] transition-all" />
              </div>

              {/* 우측 핸들 바 (도톰한 6px 두께로 바깥 선과 밀착 일체화, 마우스로 잡고 밀면 줄이 왼쪽으로 이동) */}
              <div 
                className="absolute top-1/2 translate-x-1/2 -translate-y-1/2 h-[35%] px-2.5 flex items-center justify-center cursor-ew-resize group/right z-50 touch-none"
                style={{ right: `${crop.right}%` }}
                onPointerDown={(e) => handleStartCropHandle('right', e)}
                title="좌측으로 드래그하여 오른쪽 여백 자르기"
              >
                <div className="h-full w-[6px] bg-[#D97757] rounded-full shadow-md group-hover/right:w-[7px] group-hover/right:bg-[#C96442] transition-all" />
              </div>
            </div>
          )}
       </div>

       {/* 하단 메모창 (기본값: memoPosition !== 'top') */}
       {item.isMemoOpen && (!item.memoPosition || item.memoPosition === 'bottom') && (
          <div className="mt-2.5 no-print relative group/memo" onMouseDown={(e) => e.stopPropagation()}>
            <textarea 
              value={localMemo} 
              onChange={(e) => setLocalMemo(e.target.value)} 
              onBlur={() => onUpdate(item.id, { memo: localMemo })}
              placeholder="찬양 멘트..." 
              className="w-full bg-white border border-[#E5E0D8] rounded-xl p-2.5 font-medium text-[#2B2927] shadow-xs focus:border-[#D97757] focus:ring-2 focus:ring-[#D97757]/10 focus:outline-none transition-all resize-none custom-scrollbar" 
              style={{ fontSize: `${item.memoFontSize || 16}px`, height: 'auto', minHeight: '44px' }} 
            />
          </div>
       )}
       {item.memo && (!item.memoPosition || item.memoPosition === 'bottom') && (
         <div className="hidden print:block text-center mt-2.5 font-black text-black leading-tight" style={{ fontSize: `${item.memoFontSize || 16}px` }}>{item.memo}</div>
       )}

       {/* 우하단 리사이즈 드래그 핸들 (기준점 좌상단 완전 고정) */}
       {isSelected && !isPreviewMode && !isCropping && (
         <div 
           className="absolute -bottom-2 -right-2 w-5 h-5 bg-[#D97757] border-2 border-white rounded-full shadow-md flex items-center justify-center cursor-se-resize touch-none z-[102] hover:scale-110 active:scale-95 transition-transform"
           onPointerDown={(e) => {
             e.stopPropagation();
             e.preventDefault();
             setIsResizing(true);
             const targetEl = e.currentTarget as HTMLElement;
             targetEl.setPointerCapture(e.pointerId);
             const startX = e.clientX;
             const startWidth = item.width;
             const move = (me: PointerEvent) => {
               me.stopPropagation();
               me.preventDefault();
               const dx = me.clientX - startX;
               const dPercent = (dx / canvasWidth) * 100;
               const newWidth = Math.round(Math.max(10, Math.min(100, startWidth + dPercent)));
               onUpdate(item.id, { width: newWidth });
             };
             const up = (ue: PointerEvent) => {
               try { targetEl.releasePointerCapture(ue.pointerId); } catch (_) {}
               setIsResizing(false);
               window.removeEventListener('pointermove', move);
               window.removeEventListener('pointerup', up);
             };
             window.addEventListener('pointermove', move);
             window.addEventListener('pointerup', up);
           }}
           title="드래그하여 크기 조절"
         >
           <div className="w-1.5 h-1.5 bg-white rounded-full pointer-events-none" />
         </div>
       )}

       {showContiNumbers && (
         <div className={`absolute -top-3 -left-3 w-6 h-6 bg-[#2B2927] border-2 border-white text-[#FAF9F5] rounded-full items-center justify-center text-[10px] font-bold shadow-md z-[105] ${!isPreviewMode ? 'flex' : 'hidden print:flex'} print:shadow-none print:bg-black`}>
            {index + 1}
         </div>
       )}

       {isSelected && !isPreviewMode && <div className="absolute -inset-1 border-2 border-[#D97757] rounded-lg pointer-events-none z-[101]" />}

    </motion.div>
  );
});

// --- Sub-component for individual page content ---
const PageContent: React.FC<{ 
  pNum: number, 
  canvasWidth: number, 
  canvasHeight: number,
  activeItemId: string | null,
  cropEditingId: string | null,
  setActiveItemId: (id: string | null) => void,
  setCropEditingId: (id: string | null) => void,
  isPreviewMode: boolean
}> = ({ pNum, canvasWidth, canvasHeight, activeItemId, cropEditingId, setActiveItemId, setCropEditingId, isPreviewMode }) => {
  const { 
    contiItems, contiTitle, contiTitleFontSize, songs, 
    updateContiItem, removeFromConti, showContiNumbers
  } = useHymnal();
  
  const canvasRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={canvasRef} onMouseDown={() => setActiveItemId(null)} className={`bg-white relative page-break-after overflow-hidden ${isPreviewMode ? '' : 'shadow-2xl'}`} style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}>
      {!isPreviewMode && <div className="absolute pointer-events-none no-print border border-slate-200 border-dashed" style={{ left: MARGIN_PX, top: MARGIN_PX, right: MARGIN_PX, bottom: MARGIN_PX }} />}
      
      <div className="absolute left-0 right-0 z-20 text-center flex flex-col items-center gap-2 group/title no-print pointer-events-none" style={{ top: '30px' }}>
        <div 
          className="w-full font-black text-slate-900 bg-transparent text-center py-4 border-none focus:outline-none transition-all" 
          style={{ fontSize: `${contiTitleFontSize}px` }}
        >
          {contiTitle || "무제목 콘티"}
        </div>
      </div>

      <div className="hidden print:block absolute left-0 right-0 text-center font-black text-black" style={{ top: '30px', fontSize: `${contiTitleFontSize}px` }}>
        {contiTitle && contiTitle.trim() !== '' ? contiTitle : ''}
      </div>

      <AnimatePresence>
        {contiItems.filter(item => item.isVisible && item.page === pNum).map((item, index) => (
          <DraggableContiItem 
            key={item.id}
            item={item}
            song={songs.find(s => {
              if (!s || !s.id || !item.songId) return false;
              const sId = s.id.toString();
              const tId = item.songId.toString();
              return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
            })}
            isSelected={activeItemId === item.id}
            cropEditingId={cropEditingId}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            isPreviewMode={isPreviewMode}
            showContiNumbers={showContiNumbers}
            index={contiItems.findIndex(i => i.id === item.id)}
            canvasRef={canvasRef}
            onSelect={setActiveItemId}
            onUpdate={updateContiItem}
            onRemove={removeFromConti}
            onCropEdit={(id: string | null) => setCropEditingId(id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export const ContiEditor: React.FC = () => {
  const { 
    setIsEditorOpen, contiItems, contiTitle, setContiTitle, paperSize, setPaperSize,
    orientation, setOrientation, updateContiItem, removeFromConti, toggleContiItemVisibility,
    clearConti, songs, contiTitleFontSize, setContiTitleFontSize,
    reorderContiItems, showContiNumbers, setShowContiNumbers,
    isLibraryOpen, setIsLibraryOpen,
    savedContis, saveCurrentConti, loadSavedConti, deleteSavedConti,
    setSongs, setContiItems
  } = useHymnal();

  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [cropEditingId, setCropEditingId] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isLeaderViewerOpen, setIsLeaderViewerOpen] = useState(false);

  const [localTitle, setLocalTitle] = useState(contiTitle);
  useEffect(() => { setLocalTitle(contiTitle); }, [contiTitle]);

  const isLandscape = orientation === 'landscape';
  const canvasWidth = isLandscape ? (paperSize === 'A4' ? 1123 : 1587) : (paperSize === 'A4' ? 794 : 1123);
  const canvasHeight = isLandscape ? (paperSize === 'A4' ? 794 : 1123) : (paperSize === 'A4' ? 1123 : 1587);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] flex flex-col overflow-hidden select-none bg-[#F5F3ED]">
        <AnimatePresence>
          <SavedContisModal 
            key="saved-contis-modal"
            isOpen={isLibraryOpen} 
            onClose={() => setIsLibraryOpen(false)} 
            savedContis={savedContis} 
            onLoad={loadSavedConti} 
            onDelete={deleteSavedConti} 
          />
          {isLeaderViewerOpen && (
            <LeaderViewer 
              key="leader-viewer" 
              onClose={() => setIsLeaderViewerOpen(false)} 
              onOpenLibrary={() => setIsLibraryOpen(true)}
            />
          )}
        </AnimatePresence>

        {/* 미리보기 종료 버튼 (플로팅) */}
        <AnimatePresence>
          {isPreviewMode && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-6 left-1/2 -translate-x-1/2 z-[10000] no-print"
            >
              <button
                onClick={() => setIsPreviewMode(false)}
                className="px-5 py-2.5 bg-[#FAF9F5] border border-[#E5E0D8] text-[#2B2927] hover:text-[#D97757] hover:border-[#D97757] rounded-full text-xs font-semibold shadow-lg flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <X className="w-3.5 h-3.5 stroke-[2px]" />
                <span>미리보기 닫기</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`bg-[#FAF9F5] border-b border-[#E5E0D8] z-50 no-print transition-all duration-300 ${isPreviewMode ? '-translate-y-full absolute w-full' : 'relative'}`}>
          {/* 1층: 타이틀 및 핵심 조작 */}
          <div className="py-2.5 px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E0D8]">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsEditorOpen(false)} 
                className="p-1.5 hover:bg-[#F3EFE9] rounded-lg text-[#6A6864] hover:text-[#2B2927] transition-colors cursor-pointer"
                title="뒤로 가기"
              >
                <ChevronLeft className="w-5 h-5 stroke-[1.8px]" />
              </button>
              <div className="flex items-center gap-2">
                <Layout className="w-4 h-4 text-[#D97757] stroke-[1.8px]" />
                <h1 className="font-serif text-sm font-bold text-[#2B2927] tracking-tight leading-none">콘티 에디터</h1>
              </div>
            </div>

            {/* 제목 및 저장소/저장 액션 */}
            <div className="flex items-center flex-wrap gap-2 sm:gap-3">
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#E5E0D8] focus-within:border-[#D97757] focus-within:ring-2 focus-within:ring-[#D97757]/10 transition-all">
                <input 
                  type="text" value={localTitle} 
                  onChange={(e) => setLocalTitle(e.target.value)}
                  onBlur={() => setContiTitle(localTitle)}
                  onKeyDown={(e) => e.key === 'Enter' && setContiTitle(localTitle)}
                  placeholder="콘티 제목 입력..." className="bg-transparent font-serif font-semibold text-xs sm:text-sm text-[#2B2927] focus:outline-none w-32 sm:w-48 placeholder:text-[#A8A49C]"
                />
                <div className="w-px h-3.5 bg-[#E5E0D8] hidden sm:block" />
                <div className="hidden sm:block">
                  <SmoothSlider 
                    label="크기"
                    min={20} max={100}
                    value={contiTitleFontSize}
                    onChange={setContiTitleFontSize}
                    accentColor="accent-[#D97757]"
                  />
                </div>
              </div>

              <div className="w-px h-4 bg-[#E5E0D8] mx-0.5 hidden sm:block" />

              <div className="flex items-center">
                <button 
                  onClick={() => setIsLibraryOpen(true)} 
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#4A4741] hover:text-[#2B2927] hover:bg-[#F3EFE9] rounded-lg transition-colors cursor-pointer"
                >
                  <Library className="w-3.5 h-3.5 stroke-[1.8px] text-[#6E6A63]" /> 
                  <span>저장소</span>
                </button>
                <TooltipIcon text="저장된 콘티를 불러옵니다" />
              </div>

              <button 
                onClick={() => saveCurrentConti()} 
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D97757] hover:bg-[#C96442] text-white rounded-lg text-xs font-medium transition-colors shadow-2xs active:scale-98 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 stroke-[1.8px]" /> 
                <span>저장하기</span>
              </button>
            </div>
          </div>

          {/* 2층: 레이아웃 옵션 및 액션 도구들 */}
          <div className="py-2 px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 bg-[#FAF9F5]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center">
                <button 
                  onClick={() => setShowContiNumbers(!showContiNumbers)} 
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    showContiNumbers 
                      ? 'bg-[#FAF0EB] text-[#D97757] font-semibold' 
                      : 'text-[#6A6864] hover:text-[#2B2927] hover:bg-[#F3EFE9]'
                  }`}
                >
                  <Hash className="w-3 h-3 stroke-[1.8px]" /> 
                  <span>순번 {showContiNumbers ? 'ON' : 'OFF'}</span>
                </button>
                <TooltipIcon text="악보 번호보기를 끄고 켭니다" />
              </div>

              <div className="w-px h-3.5 bg-[#E5E0D8] mx-0.5 hidden sm:block" />

              {/* 방향 토글 */}
              <div className="flex bg-[#F3EFE9] p-0.5 rounded-lg border border-[#E5E0D8] shrink-0">
                <button 
                  onClick={() => setOrientation('portrait')} 
                  className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    !isLandscape ? 'bg-white text-[#2B2927] shadow-2xs font-semibold' : 'text-[#8C877D] hover:text-[#2B2927]'
                  }`}
                >
                  세로
                </button>
                <button 
                  onClick={() => setOrientation('landscape')} 
                  className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    isLandscape ? 'bg-white text-[#2B2927] shadow-2xs font-semibold' : 'text-[#8C877D] hover:text-[#2B2927]'
                  }`}
                >
                  가로
                </button>
              </div>

              {/* 용지 크기 토글 */}
              <div className="flex bg-[#F3EFE9] p-0.5 rounded-lg border border-[#E5E0D8] shrink-0">
                <button 
                  onClick={() => setPaperSize('A4')} 
                  className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    paperSize === 'A4' ? 'bg-white text-[#2B2927] shadow-2xs font-semibold' : 'text-[#8C877D] hover:text-[#2B2927]'
                  }`}
                >
                  A4
                </button>
                <button 
                  onClick={() => setPaperSize('A3')} 
                  className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    paperSize === 'A3' ? 'bg-white text-[#2B2927] shadow-2xs font-semibold' : 'text-[#8C877D] hover:text-[#2B2927]'
                  }`}
                >
                  A3
                </button>
              </div>
            </div>
            
            {/* 우측 액션 도구들: 아이콘 + 이름 플랫 버튼 */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <div className="flex items-center">
                <button 
                  onClick={() => { setIsLeaderViewerOpen(true); logActivity('뷰어', '뷰어 실행'); }} 
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#D97757] hover:bg-[#FAF0EB] rounded-lg transition-colors cursor-pointer"
                >
                  <Layout className="w-3.5 h-3.5 stroke-[1.8px]" /> 
                  <span>뷰어</span>
                </button>
                <TooltipIcon text="인도자용 악보 뷰어와 회중용 PDF 링크를 생성합니다." />
              </div>

              <button 
                onClick={() => setIsPreviewMode(true)} 
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#4A4741] hover:text-[#2B2927] hover:bg-[#F3EFE9] rounded-lg transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 stroke-[1.8px] text-[#6E6A63]" /> 
                <span>미리보기</span>
              </button>

              <button 
                onClick={clearConti} 
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#8C877D] hover:text-[#D97757] hover:bg-[#FAF0EB] rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[1.8px]" /> 
                <span>비우기</span>
              </button>

              <div className="w-px h-4 bg-[#E5E0D8] mx-0.5 hidden sm:block" />

              <button 
                onClick={() => window.print()} 
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#FAF0EB] hover:bg-[#FAF0EB]/80 text-[#D97757] border border-[#F1D3C6] rounded-lg transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 stroke-[1.8px]" />
                <span>인쇄</span>
              </button>

              <button 
                onClick={() => { if (contiItems.length > 0 && !confirm('변경사항이 저장되지 않을 수 있습니다.')) return; setIsEditorOpen(false); }} 
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#6A6864] hover:text-[#2B2927] hover:bg-[#F3EFE9] rounded-lg transition-colors cursor-pointer"
              >
                <DoorOpen className="w-3.5 h-3.5 stroke-[1.8px]" /> 
                <span>닫기</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3층: 곡 순서 Reorder 바 */}
        <div className={`bg-[#FAF9F5] border-b border-[#E5E0D8] flex items-center gap-2 overflow-x-auto custom-scrollbar no-print transition-all duration-300 ${isPreviewMode ? 'opacity-0 h-0 p-0 pointer-events-none' : 'opacity-100 h-auto'}`}>
          <div className="flex items-center px-3 py-2 border-r border-[#E5E0D8] shrink-0">
             <TooltipIcon text="[우측] 악보이름을 선택하면 아래 페이지에 악보가 보입니다. [악보이름]을 좌우로 이동하여 악보번호를 바꿉니다." />
          </div>
          <Reorder.Group axis="x" values={contiItems} onReorder={reorderContiItems} className="px-2 pt-2 pb-2.5 flex items-center gap-1.5 flex-1">
           {contiItems.filter(item => !item.isVisible || item.page === 1).map((item, idx) => {
                const song = songs.find(s => {
                  if (!s || !s.id || !item.songId) return false;
                  const sId = s.id.toString();
                  const tId = item.songId.toString();
                  return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
                });
                const isAssignedToThisPage = item.isVisible && item.page === 1;
                return (
                  <Reorder.Item key={item.id} value={item} layout transition={{ type: "spring", stiffness: 700, damping: 40, mass: 0.8 }} className={`flex items-center gap-1 pl-1.5 pr-2.5 py-1 rounded-lg border shrink-0 select-none cursor-pointer transition-colors ${isAssignedToThisPage ? 'bg-[#FAF0EB] border-[#F1D3C6] text-[#D97757]' : (item.isVisible ? 'opacity-30 border-[#E5E0D8] pointer-events-none' : 'bg-white border-[#E5E0D8] text-[#6A6864] hover:bg-[#F3EFE9]')}`}>
                     <div className="p-0.5 cursor-grab active:cursor-grabbing text-[#8C877D] hover:text-[#2B2927] transition-colors group touch-none"><GripVertical className="w-3.5 h-3.5 group-active:scale-110" /></div>
                     <button onClick={() => toggleContiItemVisibility(item.id)} className="flex items-center gap-1.5 cursor-pointer">
                       <span className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold ${isAssignedToThisPage ? 'bg-[#D97757] text-white' : 'bg-[#F3EFE9] text-[#8C877D]'}`}>{idx + 1}</span>
                       <span className="text-xs font-medium truncate max-w-[120px]">{song?.title}</span>
                       {isAssignedToThisPage && <CheckCircle2 className="w-3.5 h-3.5 text-[#D97757]" />}
                     </button>
                  </Reorder.Item>
                );
           })}
          </Reorder.Group>
        </div>

        <div className={`flex-1 overflow-auto p-16 flex flex-col items-center custom-scrollbar transition-all print:p-0 print:m-0 print:overflow-visible print:bg-white ${isPreviewMode ? 'bg-[#FAF9F5]' : 'bg-[#F5F3ED]'}`}>
            <div className="relative flex flex-col items-center gap-16 print:gap-0 print:static">
               <div className="flex flex-col items-center transition-opacity duration-300 relative z-10 print:visible print:relative print:pointer-events-auto print:z-10 print:h-auto print:block">
                 <PageContent 
                   pNum={1} 
                   canvasWidth={canvasWidth} 
                   canvasHeight={canvasHeight} 
                   activeItemId={activeItemId} 
                   cropEditingId={cropEditingId}
                   setActiveItemId={setActiveItemId}
                   setCropEditingId={setCropEditingId}
                   isPreviewMode={isPreviewMode}
                 />
               </div>
            </div>
        </div>
        <style>{`.custom-scrollbar::-webkit-scrollbar { height: 5px; width: 5px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(195, 190, 180, 0.45); border-radius: 9999px; } @media print { * { box-shadow: none !important; -webkit-print-color-adjust: exact; } body { margin: 0; padding: 0 !important; background-color: white !important; } .no-print { display: none !important; } .page-break-after { page-break-after: always; display: block !important; margin: 0 auto !important; position: static !important; } @page { size: ${paperSize} ${orientation}; margin: 0; } }`}</style>
    </motion.div>
  );
};
