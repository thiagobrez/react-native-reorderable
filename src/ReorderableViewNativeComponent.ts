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

export type NativeDebugInteractionStateEvent = Readonly<{
  active: boolean;
}>;

export type NativeDragActivateEvent = Readonly<{ itemIdsJson: string }>;

export interface NativeProps extends ViewProps {
  mode?: WithDefault<'reorder' | 'dragDrop', 'reorder'>;
  entryKinds: ReadonlyArray<string>;
  entryIds: ReadonlyArray<string>;
  collectionIds: ReadonlyArray<string>;
  parentEntryIds: ReadonlyArray<string>;
  orderedEntryIds: ReadonlyArray<string>;
  selectedIds: ReadonlyArray<string>;
  acceptedDropZoneIds: ReadonlyArray<string>;
  layoutRevision: string;
  enabled: boolean;
  onMove?: DirectEventHandler<NativeMoveEvent>;
  onDrop?: DirectEventHandler<NativeDropEvent>;
  onDragActivate?: DirectEventHandler<NativeDragActivateEvent>;
  onDebugInteractionStateChange?: DirectEventHandler<NativeDebugInteractionStateEvent>;
}

interface NativeCommands {
  cancelInteraction: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>
  ) => void;
  debugBeginInteraction: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>
  ) => void;
  debugEmitTerminalReorder: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    sourceIdsJson: string,
    destinationCollectionId: string,
    destinationBeforeId: string
  ) => void;
  debugBeginDrop: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    activatedId: string
  ) => void;
  debugTargetDrop: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    destinationId: string
  ) => void;
  debugEmitTerminalDrop: (
    viewRef: React.ElementRef<HostComponent<NativeProps>>,
    outside: boolean
  ) => void;
}

export const Commands: NativeCommands = codegenNativeCommands<NativeCommands>({
  supportedCommands: [
    'cancelInteraction',
    'debugBeginInteraction',
    'debugEmitTerminalReorder',
    'debugBeginDrop',
    'debugTargetDrop',
    'debugEmitTerminalDrop',
  ],
});

export default codegenNativeComponent<NativeProps>(
  'ReorderableView'
) as HostComponent<NativeProps>;
