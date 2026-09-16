import React from 'react';
import { motion } from 'framer-motion';
import { 
  Library, 
  X, 
  Trash2, 
  Calendar, 
  Layout, 
  ChevronRight, 
  Download 
} from 'lucide-react';

interface SavedContisModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedContis: any[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}

export const SavedContisModal: React.FC<SavedContisModalProps> = ({ 
  isOpen, 
  onClose, 
  savedContis, 
  onLoad, 
  onDelete 
}) => {
  if (!isOpen) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[11000] bg-[#2C2B29]/40 backdrop-blur-xs flex items-center justify-center p-6 no-print"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }}
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border border-[#E7E5DF]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-5 border-b border-[#E7E5DF] flex items-center justify-between bg-[#FAF9F5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FAF0EB] border border-[#F1D3C6] rounded-xl flex items-center justify-center shadow-2xs">
              <Library className="w-5 h-5 text-[#C96442] stroke-[1.5px]" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#2C2B29] leading-none">내 콘티 저장소</h2>
              <p className="text-[11px] text-[#A3A19B] font-medium mt-1">저장된 찬양 콘티를 확인하고 불러옵니다</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#F5F3ED] rounded-full transition-colors text-[#A3A19B] hover:text-[#2C2B29] cursor-pointer">
            <X className="w-5 h-5 stroke-[1.5px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-[#FAF9F5]">
          {savedContis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#A3A19B]">
              <Download className="w-10 h-10 mb-3 opacity-30 stroke-[1.5px]" />
              <p className="font-medium text-xs">저장된 콘티가 아직 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {[...savedContis].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map((conti) => {
                return (
                  <div 
                    key={conti.id} 
                    className="group relative bg-white border border-[#E7E5DF] px-5 py-3.5 rounded-2xl hover:border-[#F1D3C6] hover:bg-[#FAF0EB]/20 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between border-l-4 border-l-[#C96442] shadow-2xs"
                    onClick={() => { onLoad(conti.id); onClose(); }}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 bg-[#FAF0EB] rounded-xl flex items-center justify-center border border-[#F1D3C6] transition-all shadow-2xs">
                        <Calendar className="w-4 h-4 text-[#C96442] stroke-[1.5px]" />
                      </div>
                      <div>
                        <h3 className="font-serif font-bold text-[#2C2B29] text-sm group-hover:text-[#C96442] transition-colors">{conti.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-medium text-[#6A6864] flex items-center gap-1">
                            <Layout className="w-3 h-3 text-[#A3A19B] stroke-[1.5px]" /> {conti.items?.length || 0}곡
                          </span>
                          <div className="w-0.5 h-0.5 bg-[#DDD9D0] rounded-full" />
                          <span className="text-[10px] font-medium text-[#A3A19B]">
                            {new Date(conti.updatedAt).toLocaleDateString('ko-KR', { month:'2-digit', day:'2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(conti.id); }}
                        className="p-1.5 text-[#A3A19B] hover:text-[#C96442] hover:bg-[#FAF0EB] rounded-lg transition-all cursor-pointer"
                        title="콘티 삭제"
                      >
                        <Trash2 className="w-4 h-4 stroke-[1.5px]" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-[#DDD9D0] group-hover:text-[#C96442] group-hover:translate-x-0.5 transition-all stroke-[1.5px]" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
