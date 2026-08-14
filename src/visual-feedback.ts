import type { Platform } from 'react-native';

const ACTIVE_PREVIEW_VISUAL_OFFSET_Y = -12;
const ANDROID_DESTINATION_VISUAL_OFFSET_Y = 12;

export function activeFeedbackTranslation(
  platform: typeof Platform.OS,
  hasDestinationFeedback: boolean,
  feedbackViewportY: number,
  activeOriginY: number,
  activeLength: number,
  pointerTranslation: number
): number {
  'worklet';
  if (platform === 'android' && hasDestinationFeedback)
    return feedbackViewportY - activeOriginY - activeLength / 2;
  return pointerTranslation + ACTIVE_PREVIEW_VISUAL_OFFSET_Y;
}

export function destinationFeedbackPosition(
  platform: typeof Platform.OS,
  position: number
): number {
  'worklet';
  return (
    position +
    (platform === 'android' ? ANDROID_DESTINATION_VISUAL_OFFSET_Y : 0)
  );
}
