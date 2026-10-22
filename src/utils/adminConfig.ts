/**
 * 관리자 전역 설정 및 회원 상태/플랜 관리 유틸리티
 */

const HYMNAL_VISIBLE_KEY = 'nations_admin_show_hymnal';
const USER_PLAN_PREFIX = 'nations_user_plan_';

export function getIsHymnalVisible(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(HYMNAL_VISIBLE_KEY) === 'true';
}

export function setIsHymnalVisible(visible: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HYMNAL_VISIBLE_KEY, visible ? 'true' : 'false');
  window.dispatchEvent(new Event('admin_config_changed'));
}

export function getUserPlan(userId?: string): 'free' | 'pro' | 'team' {
  if (typeof window === 'undefined') return 'free';
  if (!userId) {
    return (localStorage.getItem('nations_current_user_plan') as any) || 'free';
  }
  return (localStorage.getItem(`${USER_PLAN_PREFIX}${userId}`) as any) || 'free';
}

export function setUserPlan(userId: string, plan: 'free' | 'pro' | 'team'): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${USER_PLAN_PREFIX}${userId}`, plan);
  localStorage.setItem('nations_current_user_plan', plan);
  window.dispatchEvent(new Event('admin_config_changed'));
}
