import { View } from 'react-native';

import type { NativeProps } from './ReorderableViewNativeComponent';

export type {
  NativeDropEvent,
  NativeMoveEvent,
  NativeProps,
} from './ReorderableViewNativeComponent';

export default View as React.ComponentType<NativeProps>;
