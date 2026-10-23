import { jsPDF } from 'jspdf';
import { imageCache } from './imageCache';
import { gdriveWebService } from '../api/gdriveWebService';

// 이미지 로드 Helper (CORS 가드 적용)
const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('이미지 로드 시간 초과')), 15000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('이미지 로딩 실패'));
    };
    img.src = url;
  });
};

// 상단 헤더 Canvas (곡 제목, Key, 송폼) 렌더링 (한글 깨짐 우회)
const renderHeaderToCanvas = (
  songNumber: number,
  title: string,
  keyStr: string,
  songForm: string,
  width: number,
  height: number
): string => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // 배경: 어두운 다크 그레이 (#18181b)
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, width, height);

    // 하단 구분선
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height - 1);
    ctx.lineTo(width, height - 1);
    ctx.stroke();

    // 1. 곡 번호 및 제목
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    const mainTitle = `${songNumber}. ${title || '찬양 악보'}`;
    ctx.fillText(mainTitle, 16, height / 2 - 8);

    // 2. Key 및 송폼
    ctx.fillStyle = '#fbbf24'; // amber-400
    ctx.font = 'bold 15px sans-serif';
    const subMetaParts = [];
    if (keyStr) subMetaParts.push(`Key: ${keyStr}`);
    if (songForm) subMetaParts.push(`송폼: ${songForm}`);
    const subMeta = subMetaParts.join('  |  ');
    if (subMeta) {
      ctx.fillText(subMeta, 16, height / 2 + 14);
    }

    return canvas.toDataURL('image/jpeg', 0.95);
  } catch (err) {
    console.error('[pdfPackage] renderHeaderToCanvas error:', err);
    return '';
  }
};

// 하단 멘트/노트 Canvas 렌더링
const renderMemoToCanvas = (memo: string, width: number, height: number): string => {
  if (!memo) return '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, width, height);

    // 상단 구분선
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.lineTo(width, 1);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#38bdf8'; // sky-400 (노트/멘트 강조)
    ctx.font = 'bold 20px sans-serif';

    const lines = memo.split('\n');
    const lineHeight = 28;
    const totalHeight = lines.length * lineHeight;
    let startY = (height - totalHeight) / 2 + lineHeight / 2;

    lines.forEach((line) => {
      ctx.fillText(line.trim(), width / 2, startY);
      startY += lineHeight;
    });

    return canvas.toDataURL('image/jpeg', 0.95);
  } catch (err) {
    console.error('[pdfPackage] renderMemoToCanvas error:', err);
    return '';
  }
};

export interface PackageSongItem {
  itemId?: string;
  songId?: string;
  title: string;
  code?: string;
  meter?: string;
  songForm?: string;
  filePath?: string;
  fileId?: string;
  crop?: { top: number; bottom: number; left: number; right: number };
  memo?: string;
}

/**
 * 찬양팀 전용 악보 패키지 PDF 생성 (악보 + 송폼 + 코드 + 멘트 통합)
 * 브라우저 메모리(jsPDF)에서 즉석 생성하여 서버 비용 0원
 */
export async function generateContiPackagePDF(
  contiTitle: string,
  items: PackageSongItem[],
  teamName: string,
  onProgress: (msg: string, percent: number) => void
): Promise<Blob> {
  onProgress('찬양팀 PDF 패키지 엔진 초기화...', 10);

  // 모바일/태블릿 세로 포맷 (4x7 인치 포맷, pt 단위: 288 x 504)
  const PAGE_W = 288;
  const PAGE_H = 504;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: [PAGE_W, PAGE_H]
  });

  let renderedCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const progressPercent = Math.round(15 + (i / items.length) * 75);
    onProgress(`악보 패키지 렌더링 중 (${i + 1}/${items.length})`, progressPercent);

    const fileId = item.filePath || item.fileId || '';

    try {
      // 1. 기기 로컬 IndexedDB 캐시 확인
      let blob: Blob | null = null;
      const cacheKeys = [item.fileId, item.filePath, item.songId, fileId].filter(Boolean);
      for (const key of cacheKeys) {
        try {
          const cached = await imageCache.getImage(key as string);
          if (cached) {
            blob = cached;
            break;
          }
        } catch {}
      }

      // 2. 캐시 미스 시 원본 fetch 또는 Storage에서 로드
      if (!blob && fileId) {
        const isUrl = fileId.startsWith('http') || fileId.includes('/');
        if (isUrl) {
          try {
            const res = await fetch(fileId);
            if (res.ok) blob = await res.blob();
          } catch {}
        }
        if (!blob) {
          blob = await gdriveWebService.getFileBlob(fileId);
        }
      }

      if (!blob) {
        console.warn(`[pdfPackage] Skip item: ${item.title} (이미지 없음)`);
        continue;
      }

      const imgUrl = URL.createObjectURL(blob);
      const img = await loadImage(imgUrl);
      URL.revokeObjectURL(imgUrl);

      // 크롭 계산
      const crop = item.crop || { top: 0, bottom: 0, left: 0, right: 0 };
      const cropLeft = typeof crop.left === 'number' ? crop.left : 0;
      const cropRight = typeof crop.right === 'number' ? crop.right : 0;
      const cropTop = typeof crop.top === 'number' ? crop.top : 0;
      const cropBottom = typeof crop.bottom === 'number' ? crop.bottom : 0;

      const w = img.naturalWidth || img.width || 800;
      const h = img.naturalHeight || img.height || 1100;

      const cropX = Math.max(0, Math.min(w - 10, (w * cropLeft) / 100));
      const cropY = Math.max(0, Math.min(h - 10, (h * cropTop) / 100));
      const cropW = Math.max(10, Math.min(w, w * (1 - (cropLeft + cropRight) / 100)));
      const cropH = Math.max(10, Math.min(h, h * (1 - (cropTop + cropBottom) / 100)));

      const scoreCanvas = document.createElement('canvas');
      scoreCanvas.width = cropW;
      scoreCanvas.height = cropH;
      const scoreCtx = scoreCanvas.getContext('2d');
      if (!scoreCtx) continue;

      scoreCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const scoreDataUrl = scoreCanvas.toDataURL('image/jpeg', 0.95);

      // PDF 새 페이지
      if (renderedCount > 0) {
        pdf.addPage([PAGE_W, PAGE_H]);
      }

      // 배경 다크
      pdf.setFillColor(24, 24, 27);
      pdf.rect(0, 0, PAGE_W, PAGE_H, 'F');

      // 상단 헤더 높이 & 하단 메모 높이
      const headerH = 46;
      const hasMemo = !!item.memo;
      const memoH = hasMemo ? 56 : 0;
      const availableH = PAGE_H - headerH - memoH - 12;

      // 1. 상단 헤더 삽입 (곡 제목, 코드, 송폼)
      const headerDataUrl = renderHeaderToCanvas(
        i + 1,
        item.title,
        item.code || '',
        item.songForm || '',
        PAGE_W * 2,
        headerH * 2
      );
      if (headerDataUrl) {
        pdf.addImage(headerDataUrl, 'JPEG', 0, 0, PAGE_W, headerH);
      }

      // 2. 중앙 악보 이미지 스케일링 삽입
      const AR = cropW / cropH || 0.7;
      let boxW = PAGE_W;
      let boxH = PAGE_W / AR;
      if (boxH > availableH) {
        boxH = availableH;
        boxW = availableH * AR;
      }

      const translateX = Math.max(0, (PAGE_W - boxW) / 2);
      const translateY = headerH + Math.max(0, (availableH - boxH) / 2) + 4;

      pdf.addImage(scoreDataUrl, 'JPEG', translateX, translateY, boxW, boxH);

      // 3. 하단 멘트/노트 삽입 (있을 경우)
      if (hasMemo && item.memo) {
        const memoDataUrl = renderMemoToCanvas(item.memo, PAGE_W * 2, memoH * 2);
        if (memoDataUrl) {
          pdf.addImage(memoDataUrl, 'JPEG', 0, PAGE_H - memoH, PAGE_W, memoH);
        }
      }

      renderedCount++;
    } catch (err) {
      console.error(`[pdfPackage] Item ${i} render failed:`, err);
    }
  }

  if (renderedCount === 0) {
    pdf.setFillColor(24, 24, 27);
    pdf.rect(0, 0, PAGE_W, PAGE_H, 'F');
    pdf.setFontSize(11);
    pdf.setTextColor(148, 163, 184);
    pdf.text('악보 이미지를 불러오지 못했습니다.', PAGE_W / 2, PAGE_H / 2, { align: 'center' });
  }

  onProgress('찬양팀 PDF 패키지 완성!', 100);
  return pdf.output('blob');
}
