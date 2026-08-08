import { forwardRef, useImperativeHandle, useMemo, type Ref } from 'react';
import { ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';

export function assignViewportRef(
  ref: Ref<unknown> | undefined,
  value: unknown
): void {
  if (typeof ref === 'function') ref(value);
  else if (ref != null) ref.current = value;
}

export function useOwnedAnimatedScrollComponent(
  animatedRef: Readonly<{ current: unknown }>
) {
  return useMemo(
    () =>
      forwardRef<ScrollView, Record<string, unknown>>(
        function ReorderableProviderScroll(scrollProps, providerRef) {
          useImperativeHandle(
            providerRef,
            () => animatedRef.current as unknown as ScrollView,
            []
          );
          return (
            <Animated.ScrollView {...scrollProps} ref={animatedRef as never} />
          );
        }
      ),
    [animatedRef]
  );
}
