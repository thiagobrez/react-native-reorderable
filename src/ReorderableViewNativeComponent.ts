import {
  codegenNativeCommands,
  codegenNativeComponent,
  type HostComponent,
  type ViewProps,
} from 'react-native';
import type {
  DirectEventHandler,
  WithDefault,
} from 'react-native/Libraries/Types/CodegenTypes';

export type NativeMoveEvent = Readonly<{
  sourceIdsJson: string;
  destinationCollectionId: string;
  destinationBeforeId: string;
}>;

export type NativeDropEvent = Readonly<{
  itemIdsJson: string;
  destinationId: string;
}>;

export interface NativeProps extends ViewProps {
  mode?: WithDefault<'reorder' | 'dragDrop', 'reorder'>;
  entryKinds: ReadonlyArray<string>;
  entryIds: ReadonlyArray<string>;
  collectionIds: ReadonlyArray<string>;
  orderedEntryIds: ReadonlyArray<string>;
  selectedIds: ReadonlyArray<string>;
  layoutRevision: string;
  enabled: boolean;
  onMove?: DirectEventHandler<NativeMoveEvent>;
  onDrop?: DirectEventHandler<NativeDropEvent>;
}

interface NativeCommands {
  debugEmitTerminalReorder: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    sourceIdsJson: string,
    destinationCollectionId: string,
    destinationBeforeId: string
  ) => void;
}

export const Commands: NativeCommands = codegenNativeCommands<NativeCommands>({
  supportedCommands: ['debugEmitTerminalReorder'],
});

export default codegenNativeComponent<NativeProps>(
  'ReorderableView'
) as HostComponent<NativeProps>;
