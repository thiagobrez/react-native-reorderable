import type { EnginePolicy } from './types';

export type SectionListEngine = 'disabled' | 'fallback';

export type SectionAutoScrollPlan = Readonly<{
  active: boolean;
  target: number;
  velocity: number;
}>;

export function planSectionAutoScroll(
  pointer: number,
  viewportLength: number,
  offset: number,
  totalLength: number
): SectionAutoScrollPlan {
  'worklet';
  const edge = 60;
  const maximum = Math.max(0, totalLength - viewportLength);
  const velocity =
    pointer < edge && offset > 0
      ? -360 * Math.min(1, (edge - pointer) / edge)
      : pointer > viewportLength - edge
        ? 360 * Math.min(1, (pointer - (viewportLength - edge)) / edge)
        : 0;
  const target = velocity < 0 ? 0 : maximum;
  return {
    active: velocity !== 0 && target !== offset,
    target,
    velocity,
  };
}

export function stepSectionAutoScroll(
  plan: SectionAutoScrollPlan,
  offset: number,
  elapsedMilliseconds: number
): number {
  'worklet';
  if (!plan.active) return offset;
  const next = offset + (plan.velocity * elapsedMilliseconds) / 1000;
  return plan.velocity < 0
    ? Math.max(plan.target, next)
    : Math.min(plan.target, next);
}

export function sectionAutoScrollDuration(
  plan: SectionAutoScrollPlan,
  offset: number
): number {
  'worklet';
  return plan.active
    ? (Math.abs(plan.target - offset) / Math.abs(plan.velocity)) * 1000
    : 0;
}

/**
 * The SwiftUI adapter from issue #33 owns its native scroll viewport and cannot
 * preserve React Native SectionList virtualization, chrome, callbacks, or ref
 * semantics. SectionList therefore has no conforming native adapter yet. Auto
 * explicitly selects the portable fallback while retaining the actual
 * SectionList as the viewport; no native capability or identity leaks publicly.
 */
export function resolveSectionListEngine(
  policy: EnginePolicy,
  platform: string,
  enabled: boolean
): SectionListEngine {
  if (!enabled) return 'disabled';
  if (platform !== 'ios' && platform !== 'android')
    throw new Error(
      `[react-native-reorderable] No reorder engine can fulfill the portable ReorderableSectionList contract for this enabled ${platform} viewport.`
    );
  if (policy === 'fallback') return 'fallback';
  return 'fallback';
}
