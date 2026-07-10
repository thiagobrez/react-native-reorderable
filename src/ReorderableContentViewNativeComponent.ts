import {
  codegenNativeComponent,
  type HostComponent,
  type ViewProps,
} from 'react-native';

export interface NativeProps extends ViewProps {
  entryIdentifier: string;
}

export default codegenNativeComponent<NativeProps>('ReorderableContentView', {
  excludedPlatforms: ['android'],
}) as HostComponent<NativeProps>;
