"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncContiSignalCallable = exports.verifyTeamAccessCallable = exports.pingStudioCallable = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
/**
 * 1. 서버리스 상태 헬스체크 (Zero-Cost)
 */
exports.pingStudioCallable = (0, https_1.onCall)({
    region: "asia-northeast3",
    memory: "256MiB",
    timeoutSeconds: 15,
    minInstances: 0,
}, async () => {
    return {
        status: "ok",
        timestamp: Date.now(),
        service: "nations-studio-serverless",
        region: "asia-northeast3",
    };
});
/**
 * 2. 찬양팀 공유방 입장 및 멤버십 유효성 검증
 */
exports.verifyTeamAccessCallable = (0, https_1.onCall)({
    region: "asia-northeast3",
    memory: "256MiB",
    timeoutSeconds: 15,
    minInstances: 0,
}, async (request) => {
    const { teamId, memberId, memberName, role = "member" } = request.data || {};
    if (!teamId || !memberId) {
        throw new https_1.HttpsError("invalid-argument", "팀 ID 또는 멤버 정보가 누락되었습니다.");
    }
    const cleanTeamId = String(teamId).trim().toLowerCase();
    const cleanMemberId = String(memberId).trim();
    try {
        const memberRef = db.doc(`teams/${cleanTeamId}/members/${cleanMemberId}`);
        const snap = await memberRef.get();
        if (!snap.exists) {
            // 새 멤버 등록
            await memberRef.set({
                name: memberName || "팀원",
                role,
                joinedAt: Date.now(),
                lastActiveAt: Date.now(),
            }, { merge: true });
        }
        else {
            // 마지막 활동 시간 갱신
            await memberRef.update({
                lastActiveAt: Date.now(),
            });
        }
        return {
            success: true,
            teamId: cleanTeamId,
            memberId: cleanMemberId,
            isNew: !snap.exists,
        };
    }
    catch (err) {
        console.error("[verifyTeamAccessCallable] Error:", err);
        throw new https_1.HttpsError("internal", err?.message || "팀 접근 검증 중 오류가 발생했습니다.");
    }
});
/**
 * 3. 찬양팀 실시간 콘티 악보 넘김 시그널 서버리스 동기화
 */
exports.syncContiSignalCallable = (0, https_1.onCall)({
    region: "asia-northeast3",
    memory: "256MiB",
    timeoutSeconds: 15,
    minInstances: 0,
}, async (request) => {
    const { teamId, songIndex, senderId, senderName, timestamp = Date.now() } = request.data || {};
    if (!teamId || typeof songIndex !== "number") {
        throw new https_1.HttpsError("invalid-argument", "시그널 동기화에 필요한 정보가 누락되었습니다.");
    }
    const cleanTeamId = String(teamId).trim().toLowerCase();
    const signalRef = db.doc(`teams/${cleanTeamId}/signal/live`);
    try {
        await signalRef.set({
            songIndex,
            senderId: senderId || "manager",
            senderName: senderName || "인도자",
            timestamp,
        }, { merge: true });
        return {
            success: true,
            teamId: cleanTeamId,
            songIndex,
            timestamp,
        };
    }
    catch (err) {
        console.error("[syncContiSignalCallable] Error:", err);
        throw new https_1.HttpsError("internal", err?.message || "시그널 동기화 오류");
    }
});
//# sourceMappingURL=index.js.map